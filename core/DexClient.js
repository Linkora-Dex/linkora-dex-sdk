// core/DexClient.js
const ConfigManager = require('./ConfigManager');
const ContractManager = require('./ContractManager');

class DexClient {
   constructor(config = {}) {
       this.configManager = new ConfigManager(config.configPath);
       this.provider = config.provider;
       this.signer = config.signer;
       this.contractManager = null;
       this.modules = new Map();
       this.initialized = false;

       // Устанавливаем контракты из конфигурации createSDK
       if (config.contracts) {
           const currentConfig = this.configManager.getConfig();
           currentConfig.contracts = {...currentConfig.contracts, ...config.contracts};
           this.configManager.config = currentConfig;
       }
   }

   async initialize() {
       if (this.initialized) {
           return;
       }

       try {
           console.log('🚀 Initializing DEX Client...');

           if (!this.provider) {
               const {ethers} = require('ethers');
               this.provider = new ethers.JsonRpcProvider('http://localhost:8545');
               console.log('📡 Using default local provider');
           }

           this.contractManager = new ContractManager(
               this.configManager,
               this.provider,
               this.signer
           );

           await this.contractManager.initialize();
           this.initialized = true;
           console.log('✅ DEX Client initialized successfully');
           this.printInfo();
       } catch (error) {
           throw new Error(`Failed to initialize DEX Client: ${error.message}`);
       }
   }

   async connectSigner(signer) {
       this.signer = signer;
       if (this.contractManager) {
           await this.contractManager.connectSigner(signer);
       }
       console.log('✅ Signer connected to DEX Client');
   }

   addModule(name, moduleInstance) {
       if (!moduleInstance) {
           throw new Error(`Module instance required for ${name}`);
       }

       const moduleContext = {
           contractManager: this.contractManager,
           configManager: this.configManager,
           provider: this.provider,
           signer: this.signer,
           client: this
       };

       if (typeof moduleInstance.initialize === 'function') {
           moduleInstance.initialize(moduleContext);
       }

       this.modules.set(name, moduleInstance);
       console.log(`📦 Module ${name} added`);
   }

   getModule(name) {
       const module = this.modules.get(name);
       if (!module) {
           throw new Error(`Module not found: ${name}`);
       }
       return module;
   }

   hasModule(name) {
       return this.modules.has(name);
   }

   async getSystemInfo() {
       await this.ensureInitialized();

       const networkInfo = await this.provider.getNetwork();
       const contractAddresses = this.contractManager.getAllAddresses();

       return {
           network: {
               name: networkInfo.name,
               chainId: Number(networkInfo.chainId)
           },
           contracts: contractAddresses,
           tokens: this.configManager.getTokens(),
           signer: this.signer ? await this.signer.getAddress() : null,
           modules: Array.from(this.modules.keys()),
           initialized: this.initialized
       };
   }

   async getContract(name) {
       await this.ensureInitialized();
       return this.contractManager.getContract(name);
   }

   async addContract(name, address, abiPath) {
       await this.ensureInitialized();
       return this.contractManager.addContract(name, address, abiPath);
   }

   async callContract(contractName, methodName, args = [], options = {}) {
       await this.ensureInitialized();
       return this.contractManager.callMethod(contractName, methodName, args, options);
   }

   async estimateGas(contractName, methodName, args = [], options = {}) {
       await this.ensureInitialized();
       return this.contractManager.estimateGas(contractName, methodName, args, options);
   }

   getConfig() {
       return this.configManager.getConfig();
   }

   updateConfig(updates) {
       this.configManager.update(updates);
   }

   addToken(symbol, config) {
       this.configManager.addToken(symbol, config);
   }

   getToken(symbolOrAddress) {
       return this.configManager.getToken(symbolOrAddress);
   }

   async validateContracts() {
       await this.ensureInitialized();
       return this.contractManager.validateAllContracts();
   }

   async getBalance(address, tokenAddress) {
       await this.ensureInitialized();

       if (this.configManager.isETH(tokenAddress)) {
           return this.provider.getBalance(address);
       }

       try {
           const token = this.configManager.getToken(tokenAddress);
           if (token.address) {
               const {ethers} = require('ethers');
               const tokenContract = new ethers.Contract(
                   token.address,
                   ['function balanceOf(address) view returns (uint256)'],
                   this.provider
               );
               return tokenContract.balanceOf(address);
           }
       } catch (error) {
           throw new Error(`Failed to get balance: ${error.message}`);
       }
   }

   async getUserAddress() {
       if (!this.signer) {
           throw new Error('Signer not connected');
       }
       return this.signer.getAddress();
   }

   async executeModule(moduleName, methodName, ...args) {
       await this.ensureInitialized();

       const module = this.getModule(moduleName);
       if (typeof module[methodName] !== 'function') {
           throw new Error(`Method ${methodName} not found in module ${moduleName}`);
       }

       return module[methodName](...args);
   }

   printInfo() {
       const config = this.configManager.getConfig();
       const contractAddresses = this.contractManager.getAllAddresses();

       console.log('\n🎯 DEX CLIENT INFO');
       console.log(' Network:', config.network);
       console.log(' Chain ID:', config.chainId);
       console.log(' Contracts:', Object.keys(contractAddresses).length);
       console.log(' Tokens:', Object.keys(config.tokens).length);
       console.log(' Modules:', this.modules.size);
       console.log(' Signer:', this.signer ? '✅ Connected' : '❌ Not connected');
       console.log(' Status: ✅ Ready\n');
   }

   async ensureInitialized() {
       if (!this.initialized) {
           await this.initialize();
       }
   }

   dispose() {
       this.modules.clear();
       this.contractManager = null;
       this.initialized = false;
       console.log('🗑️ DEX Client disposed');
   }
}

module.exports = DexClient;