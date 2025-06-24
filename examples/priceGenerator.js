const {createSDK} = require('../index');
const fs = require('fs');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function loadConfig() {
    const paths = ['./config/anvil_upgradeable-config.json', './config/anvil_final-config.json'];
    for (const path of paths) {
        if (fs.existsSync(path)) return JSON.parse(fs.readFileSync(path, 'utf8'));
    }
    throw new Error("Config not found");
}

class PriceGenerator {
    constructor() {
        this.config = loadConfig();
        this.currentPrices = {...this.config.initialPrices};
        this.priceHistory = {};
        this.isRunning = false;
        this.errorCount = 0;

        Object.keys(this.currentPrices).forEach(symbol => {
            this.priceHistory[symbol] = [{price: this.currentPrices[symbol], timestamp: Date.now()}];
        });
    }

    async initialize() {
        console.log("📊 SDK Price Generator initializing");

        const {router, oracle} = await createSDK({
            rpcUrl: 'http://127.0.0.1:8545',
            privateKey: process.env.ANVIL_KEEPER_PRIVATE_KEY,
            contracts: this.config.contracts
        });

        this.router = router;
        this.oracle = oracle;
        this.tokens = Object.keys(this.config.tokens || {});

        console.log(`✅ Initialized | Tokens: ${['ETH', ...this.tokens].join(', ')}`);
    }

    generatePrice(currentPrice, symbol) {
        const basePrices = {'ETH': 2500, 'USDC': 1, 'USDT': 1, 'DAI': 1, 'WBTC': 45000};
        const basePrice = basePrices[symbol] || 100;

        const volatility = symbol === 'ETH' ? 0.01 :
            basePrice >= 10000 ? 0.04 :
                basePrice >= 10 ? 0.05 :
                    basePrice <= 2 ? 0.001 : 0.03;

        const change = (Math.random() - 0.5) * 2 * volatility;
        return Math.max(parseFloat(currentPrice) * (1 + change), 0.01).toFixed(6);
    }

    async updatePrices() {
        try {
            if (await this.router.isSystemPaused()) {
                console.log("🔴 System paused");
                return;
            }

            const updates = [];
            const tokens = [];
            const prices = [];

            for (const [symbol, currentPrice] of Object.entries(this.currentPrices)) {
                const newPrice = this.generatePrice(currentPrice, symbol);
                this.currentPrices[symbol] = newPrice;
                updates.push(`${symbol}: ${newPrice}`);

                this.priceHistory[symbol].push({price: newPrice, timestamp: Date.now()});
                if (this.priceHistory[symbol].length > 100) {
                    this.priceHistory[symbol] = this.priceHistory[symbol].slice(-100);
                }

                if (symbol === 'ETH') {
                    tokens.push('0x0000000000000000000000000000000000000000');
                } else if (this.config.tokens[symbol]?.address) {
                    tokens.push(this.config.tokens[symbol].address);
                }
                prices.push(newPrice);
            }

            if (tokens.length > 0) {
                console.log(`🔄 Updating ${tokens.length} prices`);
                await this.router.batchUpdateOraclePrices(tokens, prices);
                console.log(`✅ Updated: ${updates.join(' | ')}`);
            }

        } catch (error) {
            this.errorCount++;
            const msg = error.message.includes('Price change too large') ? 'circuit breaker' :
                error.message.includes('System paused') ? 'system paused' :
                    error.message.includes('nonce') ? 'nonce conflict' : 'unknown';
            console.log(`❌ Update failed: ${msg}`);
        }
    }

    getPriceStats(symbol) {
        const history = this.priceHistory[symbol];
        if (!history || history.length < 2) {
            return {
                current: parseFloat(this.currentPrices[symbol]).toFixed(6),
                change: "0.00",
                min24h: parseFloat(this.currentPrices[symbol]).toFixed(6),
                max24h: parseFloat(this.currentPrices[symbol]).toFixed(6)
            };
        }

        const prices = history.map(h => parseFloat(h.price));
        const current = prices[prices.length - 1];
        const previous = prices[prices.length - 2];
        const change = ((current - previous) / previous * 100);
        const recent = prices.slice(-24);

        return {
            current: current.toFixed(6),
            change: change.toFixed(2),
            min24h: Math.min(...recent).toFixed(6),
            max24h: Math.max(...recent).toFixed(6)
        };
    }

    async printPriceBoard() {
        const isOperational = !(await this.router.isSystemPaused());
        const status = isOperational ? "🟢 OPERATIONAL" : "🔴 PAUSED";

        console.log(`\n${"=".repeat(70)}`);
        console.log(` LIVE PRICE FEED [${status}]`);
        console.log(`${"=".repeat(70)}`);
        console.log("Symbol".padEnd(8) + "Price".padEnd(12) + "Change%".padEnd(10) + "24h Low".padEnd(10) + "24h High");
        console.log(`${"─".repeat(70)}`);

        for (const symbol of ['ETH', ...this.tokens]) {
            if (this.currentPrices[symbol]) {
                const stats = this.getPriceStats(symbol);
                const changeColor = parseFloat(stats.change) >= 0 ? '+' : '';
                console.log(
                    symbol.padEnd(8) +
                    stats.current.padEnd(12) +
                    `${changeColor}${stats.change}%`.padEnd(10) +
                    stats.min24h.padEnd(10) +
                    stats.max24h
                );
            }
        }

        console.log(`${"─".repeat(70)}`);
        console.log(`Last: ${new Date().toLocaleTimeString()} | Errors: ${this.errorCount}`);
        if (!isOperational) console.log("🚨 Run 'npm run unpause' to resume");
        console.log("");
    }

    async generateVolatileEvent(symbol, multiplier = 1.5) {
        if (!this.currentPrices[symbol]) return;

        console.log(`🚨 VOLATILE EVENT: ${symbol} price shock!`);

        const currentPrice = parseFloat(this.currentPrices[symbol]);
        const direction = Math.random() > 0.5 ? 1 : -1;
        const shockPrice = (currentPrice * (1 + direction * 0.1 * multiplier)).toFixed(6);

        this.currentPrices[symbol] = shockPrice;
        this.priceHistory[symbol].push({price: shockPrice, timestamp: Date.now()});

        try {
            if (await this.router.isSystemPaused()) {
                console.log("🔴 Cannot execute - system paused");
                return;
            }

            const tokenAddress = symbol === 'ETH' ?
                '0x0000000000000000000000000000000000000000' :
                this.config.tokens[symbol]?.address;

            if (tokenAddress) {
                await this.router.updateOraclePrice(tokenAddress, shockPrice);
                console.log(`${symbol} ${direction > 0 ? 'surged' : 'crashed'} to ${shockPrice}`);
            }
        } catch (error) {
            const msg = error.message.includes('Price change too large') ? 'rejected by circuit breaker' :
                error.message.includes('System paused') ? 'triggered system pause' : 'failed';
            console.log(`🔴 Volatile event ${msg}`);
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
        }, 300000); // 5 minutes

        const displayInterval = setInterval(async () => {
            if (!this.isRunning) {
                clearInterval(displayInterval);
                return;
            }
            await this.printPriceBoard();
        }, 50000); // 50 seconds

        // Schedule volatile events
        if (this.tokens.length > 0) {
            setTimeout(() => this.generateVolatileEvent('ETH', 2), 30000);
            setTimeout(() => this.generateVolatileEvent(this.tokens[0], 1.5), 60000);
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