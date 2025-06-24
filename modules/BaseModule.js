class BaseModule {
    constructor(name, version = '1.0.0') {
        this.name = name;
        this.version = version;
        this.context = null;
        this.initialized = false;
    }

    initialize(context) {
        if (!context) {
            throw new Error('Module context is required');
        }

        this.context = context;
        this.initialized = true;
        console.log(`📦 Module ${this.name} v${this.version} initialized`);
    }

    getName() {
        return this.name;
    }

    getVersion() {
        return this.version;
    }

    isInitialized() {
        return this.initialized;
    }

    ensureInitialized() {
        if (!this.initialized) {
            throw new Error(`Module ${this.name} not initialized`);
        }
    }

    getContract(contractName) {
        this.ensureInitialized();
        return this.context.contractManager.getContract(contractName);
    }

    hasContract(contractName) {
        this.ensureInitialized();
        return this.context.contractManager.hasContract(contractName);
    }

    async callContract(contractName, methodName, args = [], options = {}) {
        this.ensureInitialized();
        return this.context.contractManager.callMethod(contractName, methodName, args, options);
    }

    async estimateGas(contractName, methodName, args = [], options = {}) {
        this.ensureInitialized();
        return this.context.contractManager.estimateGas(contractName, methodName, args, options);
    }

    getConfig() {
        this.ensureInitialized();
        return this.context.configManager.getConfig();
    }

    getToken(symbolOrAddress) {
        this.ensureInitialized();
        return this.context.configManager.getToken(symbolOrAddress);
    }

    async getUserAddress() {
        this.ensureInitialized();
        if (!this.context.signer) {
            throw new Error('Signer not connected');
        }
        return this.context.signer.getAddress();
    }

    async getBalance(address, tokenAddress) {
        this.ensureInitialized();
        return this.context.client.getBalance(address, tokenAddress);
    }

    validateParams(params, validationMethod) {
        this.ensureInitialized();

        // Support for ValidationHelpers integration
        if (typeof validationMethod === 'string') {
            const ValidationHelpers = require('../utils/ValidationHelpers');

            // Check ValidationHelpers first
            if (typeof ValidationHelpers[validationMethod] === 'function') {
                return ValidationHelpers[validationMethod](params);
            }

            // Fallback to legacy Validator
            const Validator = require('../utils/Validator');
            const validator = new Validator(this.context.configManager);

            if (typeof validator[validationMethod] === 'function') {
                return validator[validationMethod](params);
            }

            throw new Error(`Validation method ${validationMethod} not found`);
        }

        if (typeof validationMethod === 'function') {
            const ValidationHelpers = require('../utils/ValidationHelpers');
            const Validator = require('../utils/Validator');
            const validator = new Validator(this.context.configManager);

            return validationMethod(params, { ValidationHelpers, validator });
        }

        throw new Error('Invalid validation method');
    }

    formatResult(result, formatMethod) {
        this.ensureInitialized();
        if (!formatMethod) {
            return result;
        }

        const Formatter = require('../utils/Formatter');
        const formatter = new Formatter(this.context.configManager);

        if (typeof formatMethod === 'string') {
            if (typeof formatter[formatMethod] !== 'function') {
                throw new Error(`Format method ${formatMethod} not found`);
            }
            return formatter[formatMethod](result);
        }

        if (typeof formatMethod === 'function') {
            return formatMethod(result, formatter);
        }

        return result;
    }

    calculateValue(params, calculationMethod) {
        if (!calculationMethod) {
            throw new Error('Calculation method required');
        }

        const Calculator = require('../utils/Calculator');
        const calculator = new Calculator();

        if (typeof calculationMethod === 'string') {
            if (typeof calculator[calculationMethod] !== 'function') {
                throw new Error(`Calculation method ${calculationMethod} not found`);
            }
            return calculator[calculationMethod](params);
        }

        if (typeof calculationMethod === 'function') {
            return calculationMethod(params, calculator);
        }

        throw new Error('Invalid calculation method');
    }

    async executeWithRetry(operation, maxRetries = 3, delay = 1000) {
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                console.warn(`${this.name}: Attempt ${attempt} failed:`, error.message);

                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, delay * attempt));
                }
            }
        }

        throw new Error(`${this.name}: All ${maxRetries} attempts failed. Last error: ${lastError.message}`);
    }

    async safeCall(operation, defaultValue = null) {
        try {
            return await operation();
        } catch (error) {
            console.warn(`${this.name}: Safe call failed:`, error.message);
            return defaultValue;
        }
    }

    // Enhanced transaction handling with ContractHelpers integration
    async handleTransaction(operation, description) {
        this.logInfo(`Starting ${description}`);

        try {
            const result = await operation();

            // Enhanced logging with ContractHelpers if available
            if (result && result.logs) {
                const ContractHelpers = require('../utils/ContractHelpers');
                const transactionData = ContractHelpers.extractTransactionData(result);
                this.logInfo(`${description} completed`, {
                    hash: transactionData.hash,
                    gasUsed: transactionData.gasUsed,
                    events: transactionData.events.length
                });
            } else {
                this.logInfo(`${description} completed successfully`);
            }

            return result;
        } catch (error) {
            this.logError(`${description} failed`, error);
            throw this.createError(`${description} failed: ${error.message}`, error.code);
        }
    }

    // New helper method for extracting event data
    extractEventData(receipt, eventName, dataField) {
        const ContractHelpers = require('../utils/ContractHelpers');
        return ContractHelpers.parseEventData(receipt, eventName, dataField);
    }

    // New helper method for token symbol resolution
    getTokenSymbol(tokenAddress) {
        try {
            if (this.context.configManager.isETH(tokenAddress)) {
                return 'ETH';
            }
            return this.context.configManager.getToken(tokenAddress).symbol;
        } catch {
            return 'UNKNOWN';
        }
    }

    // Enhanced safe contract call with retry logic
    async safeContractCall(contractName, methodName, params = [], defaultValue = null, maxRetries = 2) {
        return this.safeCall(async () => {
            return this.executeWithRetry(
                () => this.callContract(contractName, methodName, params),
                maxRetries,
                1000
            );
        }, defaultValue);
    }

    logInfo(message, data) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${this.name}] ${message}`, data || '');
    }

    logWarn(message, data) {
        const timestamp = new Date().toISOString();
        console.warn(`[${timestamp}] [${this.name}] ${message}`, data || '');
    }

    logError(message, error) {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] [${this.name}] ${message}`, error?.message || error || '');
    }

    createError(message, code) {
        const error = new Error(`${this.name}: ${message}`);
        if (code) {
            error.code = code;
        }
        return error;
    }

    getModuleInfo() {
        return {
            name: this.name,
            version: this.version,
            initialized: this.initialized,
            hasContext: !!this.context,
            contracts: this.context ? Object.keys(this.context.contractManager.getAllAddresses()) : [],
            network: this.context ? this.context.configManager.getNetworkConfig() : null,
            userAddress: this.context?.signer ? 'connected' : 'not connected'
        };
    }

    // Enhanced diagnostics
    async getModuleDiagnostics() {
        const info = this.getModuleInfo();

        if (!this.initialized) {
            return { ...info, status: 'not_initialized' };
        }

        try {
            const userAddress = await this.safeCall(() => this.getUserAddress(), null);
            const networkId = await this.safeCall(() => this.context.provider.getNetwork(), null);

            return {
                ...info,
                status: 'healthy',
                userAddress,
                networkId: networkId?.chainId,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                ...info,
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    dispose() {
        this.context = null;
        this.initialized = false;
        this.logInfo('Module disposed');
    }
}

module.exports = BaseModule;