const {ethers} = require('ethers');
const fs = require('fs');
const path = require('path');



const ABI_MAP = {
    AccessControl: "./artifacts/contracts/access/AccessControl.sol/AccessControlContract.json",
    Pool: "./artifacts/contracts/upgradeable/PoolUpgradeable.sol/PoolUpgradeable.json",
    Router: "./artifacts/contracts/upgradeable/RouterUpgradeable.sol/RouterUpgradeable.json",
    Trading: "./artifacts/contracts/upgradeable/TradingUpgradeable.sol/TradingUpgradeable.json",
    TradingEvents: "./artifacts/contracts/core/TradingEvents.sol/TradingEvents.json",
    Oracle: "./artifacts/contracts/upgradeable/OracleUpgradeable.sol/OracleUpgradeable.json",
    PnLCalculator: "./artifacts/contracts/core/PnLCalculator.sol/PnLCalculator.json",
    ReentrancyGuard: "./artifacts/contracts/access/ReentrancyGuard.sol/ReentrancyGuard.json",
    PoolLibrary: "./artifacts/contracts/libraries/PoolLibrary.sol/PoolLibrary.json",
    LiquidityLibrary: "./artifacts/contracts/libraries/LiquidityLibrary.sol/LiquidityLibrary.json",
    TradingLibrary: "./artifacts/contracts/libraries/TradingLibrary.sol/TradingLibrary.json",
    RouterLibrary: "./artifacts/contracts/libraries/RouterLibrary.sol/RouterLibrary.json",
    GovernanceToken: "./artifacts/contracts/governance/GovernanceToken.sol/GovernanceToken.json",
    IRouterFeeDistribution: "./artifacts/contracts/interfaces/IRouterFeeDistribution.sol/IRouterFeeDistribution.json",
    MockERC20: "./artifacts/contracts/tokens/MockERC20.sol/MockERC20.json"
};


class ContractManager {
    constructor(config, provider, signer) {
        this.config = config;
        this.provider = provider;
        this.signer = signer;
        this.contracts = new Map();
        this.abiCache = new Map();
        this.artifactsPath = path.join(process.cwd(), 'artifacts');
    }

    async initialize() {
        try {
            await this.loadContracts();
            console.log('✅ ContractManager initialized');
        } catch (error) {
            throw new Error(`Failed to initialize ContractManager: ${error.message}`);
        }
    }

    async loadContracts() {
        const contractsConfig = this.config.getContracts();

        for (const [name, address] of Object.entries(contractsConfig)) {
            if (address) {
                await this.loadContract(name, address, ABI_MAP[name]);
            }
        }
    }

    async loadContract(name, address, abiPath) {
        try {
            // console.log("loadContract", name, address, abiPath);

            const abi = abiPath ? this.loadABIFromFile(abiPath) : this.loadABI(name);

            const contract = new ethers.Contract(address, abi, this.signer || this.provider);

            this.contracts.set(name, contract);
            // console.log(`Contract ${name} loaded at ${address}`);
            return contract;
        } catch (error) {
            throw new Error(`Failed to load contract ${name}: ${error.message}`);
        }
    }

    loadABI(contractName) {
        if (this.abiCache.has(contractName)) {
            return this.abiCache.get(contractName);
        }

        const possiblePaths = [
            path.join(this.artifactsPath, 'contracts', `${contractName}.sol`, `${contractName}.json`),
            path.join(this.artifactsPath, `${contractName}.json`),
            path.join(process.cwd(), 'abi', `${contractName}.json`),
            path.join(process.cwd(), 'abis', `${contractName}.json`)
        ];

        for (const artifactPath of possiblePaths) {
            if (fs.existsSync(artifactPath)) {
                try {
                    const artifactData = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
                    const abi = artifactData.abi || artifactData;
                    if (!Array.isArray(abi)) {
                        throw new Error(`Invalid ABI format in ${artifactPath}`);
                    }
                    this.abiCache.set(contractName, abi);
                    return abi;
                } catch (error) {
                    console.warn(`Failed to load ABI from ${artifactPath}: ${error.message}`);
                }
            }
        }

        throw new Error(`ABI not found for contract: ${contractName}`);
    }

    loadABIFromFile(filePath) {
        try {
            const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
            const fileData = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            const abi = fileData.abi || fileData;
            if (!Array.isArray(abi)) {
                throw new Error(`Invalid ABI format in ${fullPath}`);
            }
            return abi;
        } catch (error) {
            throw new Error(`Failed to load ABI from file ${filePath}: ${error.message}`);
        }
    }

    getContract(name) {
        const contract = this.contracts.get(name);
        if (!contract) {
            throw new Error(`Contract not found: ${name}`);
        }
        return contract;
    }

    hasContract(name) {
        return this.contracts.has(name);
    }

    addContract(name, address, abi) {
        try {
            const contract = new ethers.Contract(address, abi, this.signer || this.provider);
            this.contracts.set(name, contract);
            this.config.setContract(name, address);
            // console.log(`Contract ${name} added at ${address}`);
            return contract;
        } catch (error) {
            throw new Error(`Failed to add contract ${name}: ${error.message}`);
        }
    }

    async connectSigner(signer) {
        this.signer = signer;
        for (const [name, contract] of this.contracts) {
            this.contracts.set(name, contract.connect(signer));
        }
        console.log('✅ All contracts connected to new signer');
    }

    async validateContract(name) {
        try {
            const contract = this.getContract(name);
            const code = await this.provider.getCode(contract.target);
            const isDeployed = code !== '0x';
            return {
                name,
                address: contract.target,
                isDeployed,
                network: await this.provider.getNetwork()
            };
        } catch (error) {
            return {
                name,
                isDeployed: false,
                error: error.message
            };
        }
    }

    async validateAllContracts() {
        const results = new Map();
        for (const name of this.contracts.keys()) {
            results.set(name, await this.validateContract(name));
        }
        return results;
    }

    getContractAddress(name) {
        const contract = this.getContract(name);
        return contract.target;
    }

    getAllAddresses() {
        const addresses = {};
        for (const [name, contract] of this.contracts) {
            addresses[name] = contract.target;
        }
        return addresses;
    }

    async estimateGas(contractName, methodName, args = [], options = {}) {
        try {
            const contract = this.getContract(contractName);
            const method = contract[methodName];
            if (!method) {
                throw new Error(`Method ${methodName} not found in contract ${contractName}`);
            }
            const gasEstimate = await method.estimateGas(...args, options);
            const feeData = await this.provider.getFeeData();
            return {
                gasLimit: gasEstimate.toString(),
                gasPrice: feeData.gasPrice?.toString() || '0',
                maxFeePerGas: feeData.maxFeePerGas?.toString() || '0',
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString() || '0'
            };
        } catch (error) {
            throw new Error(`Gas estimation failed: ${error.message}`);
        }
    }

    async callMethod(contractName, methodName, args = [], options = {}) {
        try {
            const contract = this.getContract(contractName);
            const method = contract[methodName];
            if (!method) {
                throw new Error(`Method ${methodName} not found in contract ${contractName}`);
            }
            return await method(...args, options);
        } catch (error) {
            throw new Error(`Contract call failed: ${error.message}`);
        }
    }

    getContractInfo() {
        const info = {};
        for (const [name, contract] of this.contracts) {
            info[name] = {
                address: contract.target,
                methods: Object.keys(contract.interface.functions)
            };
        }
        return info;
    }

    clearCache() {
        this.abiCache.clear();
        console.log('🗑️ ABI cache cleared');
    }
}

module.exports = ContractManager;