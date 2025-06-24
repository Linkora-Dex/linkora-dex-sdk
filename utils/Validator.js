const {ethers} = require('ethers');
const CONSTANTS = require('./constants');

class Validator {
    constructor(configManager) {
        this.configManager = configManager;
    }

    isValidAddress(address) {
        try {
            return ethers.isAddress(address);
        } catch {
            return false;
        }
    }

    isValidAmount(amount, decimals = 18) {
        try {
            if (!amount || amount === '0') return false;
            const amountStr = amount.toString();
            const amountNum = parseFloat(amountStr);
            if (isNaN(amountNum) || amountNum <= 0) return false;
            const decimalPart = amountStr.split('.')[1];
            if (decimalPart && decimalPart.length > decimals) return false;
            ethers.parseUnits(amountStr, decimals);
            return true;
        } catch {
            return false;
        }
    }

    isValidSlippage(slippage) {
        return typeof slippage === 'number' &&
            slippage >= CONSTANTS.LIMITS.MIN_SLIPPAGE_PERCENT &&
            slippage <= CONSTANTS.LIMITS.MAX_SLIPPAGE_PERCENT;
    }

    isValidToken(tokenAddress) {
        if (!this.isValidAddress(tokenAddress)) return false;
        if (tokenAddress === CONSTANTS.ADDRESSES.ZERO_ADDRESS) return true;
        if (!this.configManager) return true;
        try {
            this.configManager.getToken(tokenAddress);
            return true;
        } catch {
            return false;
        }
    }

    isValidNetwork(chainId) {
        const supportedNetworks = Object.values(CONSTANTS.NETWORKS);
        return supportedNetworks.some(network => network.chainId === chainId);
    }

    validateSwapParams(params) {
        const errors = [];

        if (!params.tokenIn) {
            errors.push('tokenIn is required');
        } else if (!this.isValidToken(params.tokenIn)) {
            errors.push('Invalid tokenIn address');
        }

        if (!params.tokenOut) {
            errors.push('tokenOut is required');
        } else if (!this.isValidToken(params.tokenOut)) {
            errors.push('Invalid tokenOut address');
        }

        if (params.tokenIn === params.tokenOut) {
            errors.push('tokenIn and tokenOut cannot be the same');
        }

        if (!params.amountIn) {
            errors.push('amountIn is required');
        } else if (!this.isValidAmount(params.amountIn)) {
            errors.push('Invalid amountIn');
        }

        if (params.slippage !== undefined && !this.isValidSlippage(params.slippage)) {
            errors.push(`Invalid slippage (must be between ${CONSTANTS.LIMITS.MIN_SLIPPAGE_PERCENT} and ${CONSTANTS.LIMITS.MAX_SLIPPAGE_PERCENT})`);
        }

        return {isValid: errors.length === 0, errors};
    }

    validateTransactionParams(params) {
        const errors = [];

        if (!params.to || !this.isValidAddress(params.to)) {
            errors.push('Invalid recipient address');
        }

        if (!params.value || !this.isValidAmount(params.value)) {
            errors.push('Invalid transaction value');
        }

        if (params.gasLimit) {
            const gasLimit = parseInt(params.gasLimit);
            if (isNaN(gasLimit) || gasLimit < CONSTANTS.LIMITS.MIN_GAS_LIMIT || gasLimit > CONSTANTS.LIMITS.MAX_GAS_LIMIT) {
                errors.push(`Gas limit must be between ${CONSTANTS.LIMITS.MIN_GAS_LIMIT} and ${CONSTANTS.LIMITS.MAX_GAS_LIMIT}`);
            }
        }

        if (params.gasPrice) {
            try {
                const gasPrice = ethers.parseUnits(params.gasPrice.toString(), 'gwei');
                const maxGasPrice = ethers.parseUnits(CONSTANTS.LIMITS.MAX_GAS_PRICE_GWEI.toString(), 'gwei');
                if (gasPrice > maxGasPrice) {
                    errors.push(`Gas price too high (maximum: ${CONSTANTS.LIMITS.MAX_GAS_PRICE_GWEI} gwei)`);
                }
            } catch {
                errors.push('Invalid gas price format');
            }
        }

        return {isValid: errors.length === 0, errors};
    }

    validateTokenParams(params) {
        const errors = [];

        if (!params.symbol || typeof params.symbol !== 'string') {
            errors.push('Valid symbol is required');
        }

        if (!params.address || !this.isValidAddress(params.address)) {
            errors.push('Valid address is required');
        }

        if (params.decimals !== undefined) {
            const decimals = parseInt(params.decimals);
            if (isNaN(decimals) || decimals < 0 || decimals > 77) {
                errors.push('Decimals must be between 0 and 77');
            }
        }

        return {isValid: errors.length === 0, errors};
    }

    validateBalance(balance, requiredAmount) {
        const errors = [];

        if (!this.isValidAmount(balance)) {
            errors.push('Invalid balance amount');
        }

        if (!this.isValidAmount(requiredAmount)) {
            errors.push('Invalid required amount');
        }

        if (errors.length === 0) {
            const balanceNum = parseFloat(balance);
            const requiredNum = parseFloat(requiredAmount);
            if (balanceNum < requiredNum) {
                errors.push(`Insufficient balance: ${balance} < ${requiredAmount}`);
            }
        }

        return {isValid: errors.length === 0, errors};
    }

    validateFilters(filters) {
        const errors = [];

        if (filters.user && !this.isValidAddress(filters.user)) {
            errors.push('Invalid user address in filters');
        }

        if (filters.token && !this.isValidToken(filters.token)) {
            errors.push('Invalid token address in filters');
        }

        if (filters.limit !== undefined) {
            const limit = parseInt(filters.limit);
            if (isNaN(limit) || limit <= 0 || limit > CONSTANTS.LIMITS.MAX_BATCH_SIZE) {
                errors.push(`Invalid limit (must be between 1 and ${CONSTANTS.LIMITS.MAX_BATCH_SIZE})`);
            }
        }

        if (filters.offset !== undefined) {
            const offset = parseInt(filters.offset);
            if (isNaN(offset) || offset < 0) {
                errors.push('Invalid offset (must be non-negative)');
            }
        }

        return {isValid: errors.length === 0, errors};
    }

    validateContractCall(params) {
        const errors = [];

        if (!params.contractName || typeof params.contractName !== 'string') {
            errors.push('Contract name is required');
        }

        if (!params.methodName || typeof params.methodName !== 'string') {
            errors.push('Method name is required');
        }

        if (params.args && !Array.isArray(params.args)) {
            errors.push('Arguments must be an array');
        }

        return {isValid: errors.length === 0, errors};
    }

    validateId(id, type = 'ID') {
        const errors = [];
        const idNum = parseInt(id);

        if (isNaN(idNum)) {
            errors.push(`Invalid ${type} format`);
        } else if (idNum < 0) {
            errors.push(`${type} must be non-negative`);
        } else if (idNum > Number.MAX_SAFE_INTEGER) {
            errors.push(`${type} too large`);
        }

        return {isValid: errors.length === 0, errors, validId: idNum};
    }

    generateWarnings(params) {
        const warnings = [];

        if (params.slippage && params.slippage > 5) {
            warnings.push(`High slippage: ${params.slippage}% - you may lose more than expected`);
        }

        if (params.amountIn && parseFloat(params.amountIn) > 1000) {
            warnings.push('Large transaction amount - double check all parameters');
        }

        if (params.gasPrice && parseFloat(params.gasPrice) > 100) {
            warnings.push('High gas price - transaction may be expensive');
        }

        return warnings;
    }

    validateAll(params) {
        const errors = [];
        const warnings = [];

        if (params.type === 'swap') {
            const swapValidation = this.validateSwapParams(params);
            errors.push(...swapValidation.errors);
        } else if (params.type === 'transaction') {
            const txValidation = this.validateTransactionParams(params);
            errors.push(...txValidation.errors);
        } else if (params.type === 'token') {
            const tokenValidation = this.validateTokenParams(params);
            errors.push(...tokenValidation.errors);
        }

        warnings.push(...this.generateWarnings(params));

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
}

module.exports = Validator;