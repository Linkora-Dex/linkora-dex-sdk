const {createSDK} = require('../index');
const fs = require('fs');
require('dotenv').config();

const TIMING_CONFIG = {
    PRICE_UPDATE_INTERVAL: 300000,
    DISPLAY_UPDATE_INTERVAL: 50000,
    PAUSE_CHECK_INTERVAL: 3000,
    INDIVIDUAL_UPDATE_DELAY: 1000,
    NONCE_RETRY_DELAY: 2000,
    CONNECTION_RETRY_DELAY: 2000,
    VOLATILE_EVENT_DELAY: 200,
    ETH_VOLATILE_EVENT_DELAY: 30000,
    TOKEN_VOLATILE_EVENT_DELAY: 60000
};

const STORAGE_LIMITS = {
    PRICE_HISTORY_MAX: 100,
    ERROR_LOG_MAX: 10
};

const VOLATILITY_CONFIG = {
    ETH_VOLATILITY: 0.01,
    HIGH_PRICE_VOLATILITY: 0.04,
    MID_PRICE_VOLATILITY: 0.05,
    LOW_PRICE_VOLATILITY: 0.001,
    DEFAULT_VOLATILITY: 0.03,
    BASE_VOLATILITY: 0.02,
    HIGH_PRICE_THRESHOLD: 10000,
    MID_PRICE_THRESHOLD: 10,
    LOW_PRICE_THRESHOLD: 2
};

function loadConfig() {
    const configPaths = [
        './config/anvil_upgradeable-config.json',
        './config/anvil_final-config.json',
        './config/upgradeable-config.json'
    ];

    for (const configPath of configPaths) {
        if (fs.existsSync(configPath)) {
            console.log(`📋 Loading config: ${configPath}`);
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    }
    throw new Error("❌ No config found. Run: npm run prod:deploy");
}

class PriceGenerator {
    constructor() {
        this.config = loadConfig();
        this.currentPrices = {...this.config.initialPrices};
        this.priceHistory = {};
        this.isRunning = false;
        this.tokenSymbols = ['ETH', ...Object.keys(this.config.tokens || {})];
        this.errorLog = [];

        Object.keys(this.currentPrices).forEach(symbol => {
            this.priceHistory[symbol] = [{
                price: this.currentPrices[symbol],
                timestamp: Date.now()
            }];
        });
    }

    async initialize() {
        console.log("📊 SDK Price Generator initializing");

        const keeperPrivateKey = process.env.ANVIL_KEEPER_PRIVATE_KEY || process.env.ANVIL_KEY;
        if (!keeperPrivateKey) {
            throw new Error("❌ Private key not found. Set ANVIL_KEEPER_PRIVATE_KEY or ANVIL_KEY in .env");
        }

        const {router, oracle} = await createSDK({
            rpcUrl: 'http://127.0.0.1:8545',
            privateKey: keeperPrivateKey,
            contracts: this.config.contracts
        });

        this.router = router;
        this.oracle = oracle;

        console.log(`✅ Initialized | Tokens: ${this.tokenSymbols.join(', ')}`);
        console.log("📊 Price Generator ready with Router proxy");
    }

    async checkSystemStatus() {
        try {
            const systemInfo = await this.router.getSystemInfo();
            return !systemInfo.isSystemPaused;
        } catch (error) {
            this.logError("System status check", error.message);
            return false;
        }
    }

    logError(context, message) {
        const timestamp = new Date().toLocaleTimeString();
        const errorEntry = `[${timestamp}] ${context}: ${message}`;
        this.errorLog.push(errorEntry);
        if (this.errorLog.length > STORAGE_LIMITS.ERROR_LOG_MAX) {
            this.errorLog = this.errorLog.slice(-STORAGE_LIMITS.ERROR_LOG_MAX);
        }
        console.log(`❌ ${errorEntry}`);
    }

    async waitForSystemUnpause() {
        console.log("🔴 System is paused! Waiting for unpause...");
        console.log("💡 Run 'npm run unpause' in another terminal to unpause the system");

        return new Promise((resolve) => {
            const checkInterval = setInterval(async () => {
                const isOperational = await this.checkSystemStatus();
                if (isOperational) {
                    console.log("🟢 System is now operational! Resuming price updates...");
                    clearInterval(checkInterval);
                    resolve();
                }
            }, TIMING_CONFIG.PAUSE_CHECK_INTERVAL);
        });
    }

    generateRandomPrice(currentPrice, volatility = VOLATILITY_CONFIG.BASE_VOLATILITY) {
        const change = (Math.random() - 0.5) * 2 * volatility;
        const newPrice = parseFloat(currentPrice) * (1 + change);
        return Math.max(newPrice, 0.01).toFixed(6);
    }

    getVolatilityForSymbol(symbol) {
        const basePrice = parseFloat(this.config.initialPrices[symbol] || "1");
        if (basePrice >= VOLATILITY_CONFIG.HIGH_PRICE_THRESHOLD) return VOLATILITY_CONFIG.HIGH_PRICE_VOLATILITY;
        if (basePrice >= VOLATILITY_CONFIG.MID_PRICE_THRESHOLD) return VOLATILITY_CONFIG.MID_PRICE_VOLATILITY;
        if (basePrice <= VOLATILITY_CONFIG.LOW_PRICE_THRESHOLD) return VOLATILITY_CONFIG.LOW_PRICE_VOLATILITY;
        return VOLATILITY_CONFIG.DEFAULT_VOLATILITY;
    }

    async updatePrices() {
        try {
            const isOperational = await this.checkSystemStatus();
            if (!isOperational) {
                await this.waitForSystemUnpause();
                return;
            }

            const tokens = [];
            const prices = [];
            const updates = {};

            for (const [symbol, currentPrice] of Object.entries(this.currentPrices)) {
                const volatility = symbol === 'ETH' ? VOLATILITY_CONFIG.ETH_VOLATILITY : this.getVolatilityForSymbol(symbol);
                const newPrice = this.generateRandomPrice(currentPrice, volatility);

                this.currentPrices[symbol] = newPrice;
                updates[symbol] = newPrice;

                this.priceHistory[symbol].push({
                    price: newPrice,
                    timestamp: Date.now()
                });

                if (this.priceHistory[symbol].length > STORAGE_LIMITS.PRICE_HISTORY_MAX) {
                    this.priceHistory[symbol] = this.priceHistory[symbol].slice(-STORAGE_LIMITS.PRICE_HISTORY_MAX);
                }

                if (symbol === 'ETH') {
                    tokens.push('0x0000000000000000000000000000000000000000');
                } else {
                    const tokenAddress = this.config.tokens[symbol]?.address;
                    if (tokenAddress) {
                        tokens.push(tokenAddress);
                    }
                }
                prices.push(newPrice);
            }

            if (tokens.length > 0) {
                console.log(`[${new Date().toLocaleTimeString()}] Updating ${tokens.length} prices via Router...`);
                await this.router.batchUpdateOraclePrices(tokens, prices);

                console.log(`[${new Date().toLocaleTimeString()}] ✅ Batch updated: ${Object.entries(updates).map(([s, p]) => `${s}: ${p}`).join(' | ')}`);
            }

        } catch (error) {
            if (error.message.includes("System paused")) {
                console.log("🔴 System paused during price update");
                await this.waitForSystemUnpause();
            } else if (error.message.includes("Price change too large")) {
                console.log("🔴 Price update rejected by circuit breaker");
            } else {
                this.logError("Price update error", error.message);
                await this.updatePricesIndividually(tokens, prices, updates);
            }
        }
    }

    async updatePricesIndividually(tokens, prices, updates) {
        console.log(`[${new Date().toLocaleTimeString()}] Falling back to individual updates...`);

        for (let i = 0; i < tokens.length; i++) {
            try {
                await new Promise(resolve => setTimeout(resolve, TIMING_CONFIG.INDIVIDUAL_UPDATE_DELAY));

                await this.router.updateOraclePrice(tokens[i], prices[i]);

                const symbol = tokens[i] === '0x0000000000000000000000000000000000000000' ? 'ETH' :
                    Object.keys(this.config.tokens || {}).find(s => this.config.tokens[s].address === tokens[i]);

                console.log(`[${new Date().toLocaleTimeString()}] ✅ ${symbol}: ${updates[symbol]}`);
            } catch (error) {
                const symbol = tokens[i] === '0x0000000000000000000000000000000000000000' ? 'ETH' :
                    Object.keys(this.config.tokens || {}).find(s => this.config.tokens[s].address === tokens[i]);

                if (error.message.includes("Price change too large")) {
                    console.log(`[${new Date().toLocaleTimeString()}] ❌ ${symbol}: Circuit breaker triggered`);
                } else {
                    this.logError(`Individual update ${symbol}`, error.message);
                }
            }
        }
    }

    getPriceStats(symbol) {
        const history = this.priceHistory[symbol];
        if (!history || history.length < 2) {
            if (this.currentPrices[symbol]) {
                return {
                    current: parseFloat(this.currentPrices[symbol]).toFixed(6),
                    change: "0.00",
                    min24h: parseFloat(this.currentPrices[symbol]).toFixed(6),
                    max24h: parseFloat(this.currentPrices[symbol]).toFixed(6)
                };
            }
            return null;
        }

        const prices = history.map(h => parseFloat(h.price));
        const current = prices[prices.length - 1];
        const previous = prices[prices.length - 2];
        const change = ((current - previous) / previous * 100);
        const min24h = Math.min(...prices.slice(-24));
        const max24h = Math.max(...prices.slice(-24));

        return {
            current: current.toFixed(6),
            change: change.toFixed(2),
            min24h: min24h.toFixed(6),
            max24h: max24h.toFixed(6)
        };
    }

    async printPriceBoard() {
        let isOperational = true;
        let systemStatus = "🟢 OPERATIONAL";

        try {
            isOperational = await this.checkSystemStatus();
            systemStatus = isOperational ? "🟢 OPERATIONAL" : "🔴 PAUSED";
        } catch (error) {
            systemStatus = "⚠️ CONNECTION";
        }

        console.log("\n" + "=".repeat(80));
        console.log(` LIVE PRICE FEED via SDK Router [${systemStatus}]`);
        console.log("=".repeat(80));
        console.log("Symbol".padEnd(10) + "Price".padEnd(15) + "Change%".padEnd(12) + "24h Low".padEnd(12) + "24h High");
        console.log("-".repeat(80));

        for (const symbol of this.tokenSymbols) {
            if (this.currentPrices[symbol]) {
                const stats = this.getPriceStats(symbol);
                if (stats) {
                    const changeColor = parseFloat(stats.change) >= 0 ? '+' : '';
                    console.log(
                        symbol.padEnd(10) +
                        `${stats.current}`.padEnd(15) +
                        `${changeColor}${stats.change}%`.padEnd(12) +
                        `${stats.min24h}`.padEnd(12) +
                        `${stats.max24h}`
                    );
                }
            }
        }

        console.log("-".repeat(80));
        console.log(`Last update: ${new Date().toLocaleTimeString()} (via SDK)`);

        if (this.errorLog.length > 0) {
            console.log("\n📝 Recent errors:");
            this.errorLog.slice(-3).forEach(error => console.log(`   ${error}`));
        }

        if (!isOperational && systemStatus !== "⚠️ CONNECTION") {
            console.log("🚨 SYSTEM PAUSED - Run 'npm run unpause' to resume");
        }

        console.log("Press Ctrl+C to stop price generation\n");
    }

    async generateVolatileEvent(symbol, multiplier = 1.5) {
        if (!this.currentPrices[symbol]) {
            console.log(`Symbol ${symbol} not found in current prices`);
            return;
        }

        console.log(`\n🚨 VOLATILE EVENT: ${symbol} price shock via SDK!`);

        const currentPrice = parseFloat(this.currentPrices[symbol]);
        const direction = Math.random() > 0.5 ? 1 : -1;
        const shockPrice = (currentPrice * (1 + direction * 0.1 * multiplier)).toFixed(6);

        this.currentPrices[symbol] = shockPrice;
        this.priceHistory[symbol].push({
            price: shockPrice,
            timestamp: Date.now()
        });

        const tokenAddress = symbol === 'ETH' ?
            '0x0000000000000000000000000000000000000000' :
            this.config.tokens[symbol]?.address;

        if (tokenAddress) {
            try {
                const isOperational = await this.checkSystemStatus();
                if (!isOperational) {
                    console.log("🔴 Cannot execute volatile event - system is paused");
                    return;
                }

                console.log(`[${new Date().toLocaleTimeString()}] Executing volatile event via SDK...`);
                await new Promise(resolve => setTimeout(resolve, TIMING_CONFIG.VOLATILE_EVENT_DELAY));

                await this.router.updateOraclePrice(tokenAddress, shockPrice);
                console.log(`${symbol} price ${direction > 0 ? 'surged' : 'crashed'} to ${shockPrice} via SDK`);
            } catch (error) {
                if (error.message.includes("System paused")) {
                    console.log("🔴 Volatile event triggered system pause - this is normal behavior");
                } else if (error.message.includes("Price change too large")) {
                    console.log("🔴 Volatile event rejected by circuit breaker - this is normal protection");
                } else {
                    this.logError("Volatile event", error.message);
                }
            }
        }
    }

    async start() {
        if (this.isRunning) return;

        this.isRunning = true;
        console.log("🚀 Price generation started - updates every 5min, display every 50s");

        const updateInterval = setInterval(async () => {
            if (!this.isRunning) {
                clearInterval(updateInterval);
                return;
            }
            await this.updatePrices();
        }, TIMING_CONFIG.PRICE_UPDATE_INTERVAL);

        const displayInterval = setInterval(async () => {
            if (!this.isRunning) {
                clearInterval(displayInterval);
                return;
            }
            await this.printPriceBoard();
        }, TIMING_CONFIG.DISPLAY_UPDATE_INTERVAL);

        const tokenSymbols = this.tokenSymbols.filter(s => s !== 'ETH');
        if (tokenSymbols.length > 0) {
            setTimeout(() => this.generateVolatileEvent('ETH', 2), TIMING_CONFIG.ETH_VOLATILE_EVENT_DELAY);
            setTimeout(() => this.generateVolatileEvent(tokenSymbols[0], 1.5), TIMING_CONFIG.TOKEN_VOLATILE_EVENT_DELAY);
        }

        process.on('SIGINT', () => {
            console.log("\n🛑 Price generator stopped");
            this.isRunning = false;
            clearInterval(updateInterval);
            clearInterval(displayInterval);
            process.exit(0);
        });
    }
}

async function main() {
    const generator = new PriceGenerator();
    await generator.initialize();
    await generator.start();
}

main().catch(error => {
    console.error("🚨 Price generator failed:", error.message);
    process.exit(1);
});