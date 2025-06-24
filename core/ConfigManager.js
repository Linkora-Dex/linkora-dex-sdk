const fs = require('fs');
const path = require('path');

class ConfigManager {
    constructor(configPath) {
        this.configPath = configPath || this._findConfigPath();
        this.config = null;
        this.load();
    }

    _findConfigPath() {
        const possiblePaths =  ['./config/anvil_upgradeable-config.json', './config/anvil_final-config.json'];

        for (const configPath of possiblePaths) {
            if (fs.existsSync(configPath)) {
                return configPath;
            }
        }

        throw new Error('Config file not found. Available paths: ' + possiblePaths.join(', '));
    }

    load() {
        try {
            if (!fs.existsSync(this.configPath)) {
                throw new Error(`Config file not found: ${this.configPath}`);
            }

            const configData = fs.readFileSync(this.configPath, 'utf8');
            this.config = JSON.parse(configData);
            this.validateConfig();
            console.log(`✅ Config loaded from ${this.configPath}`);
            return this.config;
        } catch (error) {
            throw new Error(`Failed to load config: ${error.message}`);
        }
    }

    validateConfig() {
        if (!this.config.contracts) {
            this.config.contracts = {};
        }
        if (!this.config.tokens) {
            this.config.tokens = {};
        }
        if (!this.config.network) {
            this.config.network = 'localhost';
        }
        if (!this.config.chainId) {
            this.config.chainId = 31337;
        }
    }

    getConfig() {
        if (!this.config) {
            this.load();
        }
        return this.config;
    }

    getContracts() {
        return this.getConfig().contracts || {};
    }

    getContract(name) {
        const contracts = this.getContracts();
        if (!contracts[name]) {
            throw new Error(`Contract not found: ${name}`);
        }
        return contracts[name];
    }

    setContract(name, address) {
        if (!this.config) {
            this.load();
        }
        this.config.contracts[name] = address;
    }

    getTokens() {
        return this.getConfig().tokens || {};
    }

    getToken(symbolOrAddress) {
        const tokens = this.getTokens();
        const {ethers} = require('ethers');

        if (ethers.isAddress(symbolOrAddress)) {
            const symbol = Object.keys(tokens).find(
                s => tokens[s].address && tokens[s].address.toLowerCase() === symbolOrAddress.toLowerCase()
            );
            if (!symbol) {
                throw new Error(`Token not found for address: ${symbolOrAddress}`);
            }
            return {symbol, ...tokens[symbol]};
        } else {
            if (!tokens[symbolOrAddress]) {
                throw new Error(`Token not found: ${symbolOrAddress}`);
            }
            return {symbol: symbolOrAddress, ...tokens[symbolOrAddress]};
        }
    }

    addToken(symbol, config) {
        if (!this.config) {
            this.load();
        }
        this.config.tokens[symbol] = config;
    }

    isETH(address) {
        const {ethers} = require('ethers');
        const zeroAddress = ethers.ZeroAddress || "0x0000000000000000000000000000000000000000";
        return address && address.toLowerCase() === zeroAddress.toLowerCase();
    }

    validateAddress(address) {
        const {ethers} = require('ethers');
        try {
            return ethers.isAddress(address);
        } catch {
            return false;
        }
    }

    getNetworkConfig() {
        return {
            name: this.getConfig().network,
            chainId: this.getConfig().chainId
        };
    }

    save() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            console.log(`✅ Config saved to ${this.configPath}`);
        } catch (error) {
            throw new Error(`Failed to save config: ${error.message}`);
        }
    }

    update(updates) {
        if (!this.config) {
            this.load();
        }
        this.config = {...this.config, ...updates};
        this.save();
    }

    static createDefault(outputPath) {
        const defaultConfig = {
            network: "localhost",
            chainId: 31337,
            contracts: {},
            tokens: {}
        };

        fs.writeFileSync(outputPath, JSON.stringify(defaultConfig, null, 2));
        console.log(`Default config created at ${outputPath}`);
        return defaultConfig;
    }
}

module.exports = ConfigManager;