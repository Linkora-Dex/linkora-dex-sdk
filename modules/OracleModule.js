const BaseModule = require('./BaseModule');

class OracleModule extends BaseModule {
    constructor() {
        super('OracleModule', '1.0.0');
        this.oracleContract = null;
    }

    initialize(context) {
        super.initialize(context);
        this.oracleContract = this.getContract('Oracle');
    }

    async updatePrice(tokenAddress, price, options = {}) {
        const validation = this.validateParams({tokenAddress, price}, params =>
            this.context.configManager.validateAddress(params.tokenAddress) && parseFloat(params.price) > 0
        );
        if (!validation.isValid) throw this.createError('Invalid token address or price');

        const priceWei = this.calculateValue(price, 'parseToWei');
        const tx = await this.oracleContract.updatePrice(tokenAddress, priceWei, options);

        await this.handleTransaction(() => tx.wait(), `Update price for ${this.getTokenSymbol(tokenAddress)}`);
        this.logInfo(`Updated price: ${this.getTokenSymbol(tokenAddress)} = ${price}`);
        return true;
    }

    async batchUpdatePrices(tokenAddresses, prices, options = {}) {
        if (tokenAddresses.length !== prices.length) {
            throw this.createError('Token addresses and prices arrays must have the same length');
        }
        if (tokenAddresses.length > 10) {
            throw this.createError('Maximum 10 tokens per batch update');
        }

        const pricesWei = prices.map(price => this.calculateValue(price, 'parseToWei'));
        const tx = await this.oracleContract.batchUpdatePrices(tokenAddresses, pricesWei, options);

        await this.handleTransaction(() => tx.wait(), `Batch update ${tokenAddresses.length} prices`);

        for (let i = 0; i < tokenAddresses.length; i++) {
            this.logInfo(`Updated: ${this.getTokenSymbol(tokenAddresses[i])} = ${prices[i]}`);
        }
        return true;
    }

    async getPrice(tokenAddress) {
        const price = await this.oracleContract.getPrice(tokenAddress);
        return this.calculateValue(price, 'formatFromWei');
    }

    async getAllPrices() {
        const tokens = this.context.configManager.getTokens();
        const prices = {};

        prices['ETH'] = await this.safeCall(() => this.getPrice('0x0000000000000000000000000000000000000000'), '0');

        for (const [symbol, tokenInfo] of Object.entries(tokens)) {
            if (tokenInfo.address) {
                const price = await this.safeCall(() => this.getPrice(tokenInfo.address), '0');
                prices[symbol] = price;
            }
        }

        return prices;
    }

    async isPriceValid(tokenAddress) {
        return this.oracleContract.isPriceValid(tokenAddress);
    }

    async isPriceStale(tokenAddress) {
        return this.oracleContract.isPriceStale(tokenAddress);
    }

    async getTokenPriceInfo(tokenAddress) {
        const info = await this.oracleContract.getTokenPriceInfo(tokenAddress);

        return {
            currentPrice: this.calculateValue(info.currentPrice, 'formatFromWei'),
            lastUpdate: new Date(info.lastUpdate * 1000).toISOString(),
            isValid: info.isValid,
            isStale: info.isStale,
            historicalCount: info.historicalCount.toString(),
            symbol: this.getTokenSymbol(tokenAddress)
        };
    }

    async getLatestPrices(tokenAddresses) {
        const result = await this.oracleContract.getLatestPrices(tokenAddresses);
        const prices = [];

        for (let i = 0; i < tokenAddresses.length; i++) {
            prices.push({
                token: tokenAddresses[i],
                symbol: this.getTokenSymbol(tokenAddresses[i]),
                price: this.calculateValue(result.priceList[i], 'formatFromWei'),
                timestamp: new Date(result.timestamps[i] * 1000).toISOString()
            });
        }

        return prices;
    }

    async getHistoricalPrice(tokenAddress, timestamp) {
        const targetTimestamp = Math.floor(new Date(timestamp).getTime() / 1000);
        const price = await this.oracleContract.getHistoricalPrice(tokenAddress, targetTimestamp);

        return {
            token: tokenAddress,
            symbol: this.getTokenSymbol(tokenAddress),
            price: this.calculateValue(price, 'formatFromWei'),
            requestedTimestamp: timestamp
        };
    }

    async getPriceHistory(tokenAddress, count = 10) {
        const history = await this.oracleContract.getPriceHistory(tokenAddress, count);

        return history.map(entry => ({
            price: this.calculateValue(entry.price, 'formatFromWei'),
            timestamp: new Date(entry.timestamp * 1000).toISOString(),
            blockNumber: entry.blockNumber.toString()
        }));
    }

    async hasHistoricalData(tokenAddress) {
        return this.oracleContract.hasHistoricalData(tokenAddress);
    }

    async emergencyUpdatePrice(tokenAddress, price, options = {}) {
        const priceWei = this.calculateValue(price, 'parseToWei');
        const tx = await this.oracleContract.emergencyUpdatePrice(tokenAddress, priceWei, options);

        await this.handleTransaction(() => tx.wait(), `Emergency price update for ${this.getTokenSymbol(tokenAddress)}`);
        this.logWarn(`Emergency price update: ${this.getTokenSymbol(tokenAddress)} = ${price}`);
        return true;
    }

    async initializeHistoricalPrices(tokenAddress, options = {}) {
        const tx = await this.oracleContract.initializeHistoricalPrices(tokenAddress, options);
        await this.handleTransaction(() => tx.wait(), `Initialize historical prices for ${this.getTokenSymbol(tokenAddress)}`);
        return true;
    }

    async validateAllPrices() {
        const tokens = this.context.configManager.getTokens();
        const validationResults = {};

        const ethValidation = await this.validateTokenPrice('0x0000000000000000000000000000000000000000');
        validationResults['ETH'] = ethValidation;

        for (const [symbol, tokenInfo] of Object.entries(tokens)) {
            if (tokenInfo.address) {
                const validation = await this.validateTokenPrice(tokenInfo.address);
                validationResults[symbol] = validation;
            }
        }

        return validationResults;
    }

    async validateTokenPrice(tokenAddress) {
        try {
            const [isValid, isStale, price] = await Promise.all([
                this.isPriceValid(tokenAddress),
                this.isPriceStale(tokenAddress),
                this.safeCall(() => this.getPrice(tokenAddress), '0')
            ]);

            return {
                token: tokenAddress,
                symbol: this.getTokenSymbol(tokenAddress),
                price,
                isValid,
                isStale,
                status: isStale ? 'stale' : isValid ? 'valid' : 'invalid',
                needsUpdate: isStale || !isValid
            };
        } catch (error) {
            return {
                token: tokenAddress,
                symbol: this.getTokenSymbol(tokenAddress),
                price: '0',
                isValid: false,
                isStale: true,
                status: 'error',
                needsUpdate: true,
                error: error.message
            };
        }
    }

    async getStaleTokens() {
        const tokens = this.context.configManager.getTokens();
        const staleTokens = [];

        const ethStale = await this.safeCall(() => this.isPriceStale('0x0000000000000000000000000000000000000000'), false);
        if (ethStale) {
            staleTokens.push({symbol: 'ETH', address: '0x0000000000000000000000000000000000000000'});
        }

        for (const [symbol, tokenInfo] of Object.entries(tokens)) {
            if (tokenInfo.address) {
                const isStale = await this.safeCall(() => this.isPriceStale(tokenInfo.address), false);
                if (isStale) {
                    staleTokens.push({symbol, address: tokenInfo.address});
                }
            }
        }

        return staleTokens;
    }

    async generatePriceReport() {
        const tokens = this.context.configManager.getTokens();
        const report = {
            timestamp: new Date().toISOString(),
            totalTokens: Object.keys(tokens).length + 1, // +1 for ETH
            validPrices: 0,
            stalePrices: 0,
            invalidPrices: 0,
            tokens: {}
        };

        const validationResults = await this.validateAllPrices();

        for (const [symbol, validation] of Object.entries(validationResults)) {
            report.tokens[symbol] = validation;

            if (validation.status === 'valid') report.validPrices++;
            else if (validation.status === 'stale') report.stalePrices++;
            else report.invalidPrices++;
        }

        report.healthScore = Math.round((report.validPrices / report.totalTokens) * 100);
        report.needsAttention = report.stalePrices > 0 || report.invalidPrices > 0;

        return report;
    }

    async createPriceWatcher(tokenAddresses, callback, interval = 30000) {
        if (typeof callback !== 'function') {
            throw this.createError('Callback function required');
        }

        const watcherInfo = {
            tokens: tokenAddresses,
            interval,
            active: true,
            lastPrices: new Map()
        };

        const watcher = setInterval(async () => {
            if (!watcherInfo.active) {
                clearInterval(watcher);
                return;
            }

            try {
                const currentPrices = await this.getLatestPrices(tokenAddresses);
                const changes = [];

                for (const priceData of currentPrices) {
                    const lastPrice = watcherInfo.lastPrices.get(priceData.token);
                    if (lastPrice && lastPrice !== priceData.price) {
                        const change = this.calculateValue({oldValue: lastPrice, newValue: priceData.price}, 'calculatePercentChange');
                        changes.push({
                            ...priceData,
                            previousPrice: lastPrice,
                            change: change + '%'
                        });
                    }
                    watcherInfo.lastPrices.set(priceData.token, priceData.price);
                }

                if (changes.length > 0) {
                    callback(changes);
                }
            } catch (error) {
                this.logError('Price watcher error', error);
            }
        }, interval);

        watcherInfo.stop = () => {
            watcherInfo.active = false;
            clearInterval(watcher);
            this.logInfo('Price watcher stopped');
        };

        this.logInfo(`Price watcher started for ${tokenAddresses.length} tokens`);
        return watcherInfo;
    }

    async simulatePriceUpdate(tokenAddress, newPrice) {
        const currentPrice = await this.getPrice(tokenAddress);
        const change = this.calculateValue({oldValue: currentPrice, newValue: newPrice}, 'calculatePercentChange');

        return {
            token: tokenAddress,
            symbol: this.getTokenSymbol(tokenAddress),
            currentPrice,
            newPrice,
            change: change + '%',
            impact: Math.abs(change) > 5 ? 'high' : Math.abs(change) > 2 ? 'medium' : 'low',
            wouldTrigger: Math.abs(change) > 20 ? 'price_protection' : 'normal_update'
        };
    }

    getTokenSymbol(tokenAddress) {
        try {
            return this.context.configManager.getToken(tokenAddress).symbol;
        } catch {
            return this.context.configManager.isETH(tokenAddress) ? 'ETH' : 'UNKNOWN';
        }
    }
}

module.exports = OracleModule;