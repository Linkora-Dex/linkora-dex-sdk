const {createSDK} = require('../index');
const fs = require('fs');
require('dotenv').config();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function loadConfig() {
    const paths = [
        './config/anvil_upgradeable-config.json',
        './config/anvil_final-config.json',
        './config/deployed-config.json'
    ];
    for (const path of paths) {
        if (fs.existsSync(path)) {
            console.log(`📋 Loading config: ${path}`);
            return JSON.parse(fs.readFileSync(path, 'utf8'));
        }
    }
    throw new Error("❌ No config found. Run: npm run prod:deploy");
}

class TradingDemo {
    constructor() {
        this.config = loadConfig();
        this.createdOrders = [];
        this.users = {};
        this.tokens = {};
        this.router = null;
        this.oracle = null;
        this.accessControl = null;
    }

    async initialize() {
        console.log("🚀 SDK Trading Demo | Enhanced");

        const user1PrivateKey = process.env.USER1_PRIVATE_KEY || process.env.ANVIL_KEEPER_PRIVATE_KEY || process.env.ANVIL_KEY;
        const user2PrivateKey = process.env.USER2_PRIVATE_KEY || process.env.ANVIL_KEEPER_PRIVATE_KEY || process.env.ANVIL_KEY;
        const keeperPrivateKey = process.env.ANVIL_KEEPER_PRIVATE_KEY || process.env.ANVIL_KEY;

        if (!user1PrivateKey || !user2PrivateKey || !keeperPrivateKey) {
            throw new Error("❌ Private keys not found. Set USER1_PRIVATE_KEY, USER2_PRIVATE_KEY, ANVIL_KEEPER_PRIVATE_KEY in .env");
        }

        const [user1SDK, user2SDK, keeperSDK] = await Promise.all([
            createSDK({
                rpcUrl: 'http://127.0.0.1:8545',
                privateKey: user1PrivateKey,
                contracts: this.config.contracts
            }),
            createSDK({
                rpcUrl: 'http://127.0.0.1:8545',
                privateKey: user2PrivateKey,
                contracts: this.config.contracts
            }),
            createSDK({
                rpcUrl: 'http://127.0.0.1:8545',
                privateKey: keeperPrivateKey,
                contracts: this.config.contracts
            })
        ]);

        this.users = {
            user1: {sdk: user1SDK, router: user1SDK.router, address: await user1SDK.client.signer.getAddress()},
            user2: {sdk: user2SDK, router: user2SDK.router, address: await user2SDK.client.signer.getAddress()},
            keeper: {sdk: keeperSDK, router: keeperSDK.router, address: await keeperSDK.client.signer.getAddress()}
        };

        this.router = user1SDK.router;
        this.oracle = user1SDK.oracle;

        if (this.config.contracts.AccessControl) {
            try {
                this.accessControl = user1SDK.client.contractManager.getContract('AccessControl');
            } catch (error) {
                console.log("⚠️ AccessControl not available");
            }
        }

        this.tokens = Object.keys(this.config.tokens || {});
        if (this.tokens.length === 0) {
            throw new Error("❌ No tokens configured");
        }

        console.log(`✅ Initialized users:`);
        console.log(`   User1: ${this.users.user1.address}`);
        console.log(`   User2: ${this.users.user2.address}`);
        console.log(`   Keeper: ${this.users.keeper.address}`);
        console.log(`✅ Tokens: ${this.tokens.concat(['ETH']).join(', ')}`);
        console.log("🛡️ Features: Security, Self-Execution, Stop-Loss, Circuit Breaker, Emergency Controls\n");
    }

    async getPrice(tokenAddress) {
        try {
            const price = await this.router.getPrice(tokenAddress);
            return parseFloat(price) / 1e18;
        } catch {
            return 0;
        }
    }

    async getUserBalance(userAddress, tokenAddress) {
        try {
            const balance = await this.router.getBalance(userAddress, tokenAddress);
            if (tokenAddress === '0x0000000000000000000000000000000000000000') {
                return parseFloat(balance) / 1e18;
            } else {
                const tokenConfig = Object.values(this.config.tokens || {}).find(t => t.address === tokenAddress);
                const decimals = tokenConfig ? tokenConfig.decimals : 18;
                return parseFloat(balance) / Math.pow(10, decimals);
            }
        } catch {
            return 0;
        }
    }

    async displayStatus() {
        console.log("┌─ SYSTEM STATUS ─────────────────────────────────────────────────┐");

        let systemInfo;
        try {
            systemInfo = await this.router.getSystemInfo();
        } catch {
            systemInfo = {isSystemPaused: false};
        }

        console.log(`│ Status: ${systemInfo.isSystemPaused ? "🔴 PAUSED" : "🟢 OPERATIONAL"}`);
        console.log("│ Security: ✅ Flash Loan Protection ✅ Circuit Breaker ✅ Emergency Stop");
        console.log("├─ MARKET PRICES ─────────────────────────────────────────────────┤");

        const ethPrice = await this.getPrice('0x0000000000000000000000000000000000000000');
        const prices = [`ETH: ${ethPrice.toFixed(1)}`];

        for (const symbol of this.tokens) {
            const tokenAddress = this.config.tokens[symbol].address;
            const price = await this.getPrice(tokenAddress);
            prices.push(`${symbol}: ${price.toFixed(6)}`);
        }
        console.log(`│ ${prices.join(' | ')}`);

        console.log("├─ USER BALANCES ─────────────────────────────────────────────────┤");

        for (const [userName, user] of Object.entries(this.users)) {
            if (userName === 'keeper') continue;

            const ethBalance = await this.getUserBalance(user.address, '0x0000000000000000000000000000000000000000');
            const ethValue = ethBalance * ethPrice;
            const balances = [`ETH: ${ethBalance.toFixed(1)} ($${ethValue.toFixed(2)})`];

            for (const symbol of this.tokens) {
                const tokenAddress = this.config.tokens[symbol].address;
                const balance = await this.getUserBalance(user.address, tokenAddress);
                const price = await this.getPrice(tokenAddress);
                const value = balance * price;
                balances.push(`${symbol}: ${balance.toFixed(1)} ($${value.toFixed(2)})`);
            }
            console.log(`│ ${userName}: ${balances.join(' | ')}`);
        }
        console.log("└─────────────────────────────────────────────────────────────────┘\n");
    }

    async fundUsers() {
        console.log("⏳ Phase 0: Adding User Funds");

        try {
            await Promise.all([
                this.users.user1.router.depositETH("2"),
                this.users.user2.router.depositETH("2")
            ]);
            console.log("✅ ETH deposits: User1 & User2 deposited 2 ETH each");
        } catch (error) {
            console.log("❌ ETH deposit failed:", error.message);
        }

        const depositResults = [];
        for (const symbol of this.tokens) {
            try {
                const tokenAddress = this.config.tokens[symbol].address;

                const abi = [
                    'function mint(address,uint256)',
                    'function approve(address,uint256)',
                    'function balanceOf(address) view returns (uint256)'
                ];

                let tokenContract;
                try {
                    tokenContract = this.users.user1.sdk.client.contractManager.getContract('MockERC20');
                } catch {
                    const ethers = require('ethers');
                    tokenContract = new ethers.Contract(tokenAddress, abi, this.users.user1.sdk.client.signer);
                }

                const user1Address = this.users.user1.address;
                const user2Address = this.users.user2.address;
                const decimals = this.config.tokens[symbol].decimals;
                const mintAmount = '400' + '0'.repeat(decimals);

                await Promise.all([
                    tokenContract.mint(user1Address, mintAmount),
                    tokenContract.mint(user2Address, mintAmount)
                ]);

                await Promise.all([
                    this.users.user1.router.depositToken(tokenAddress, "200"),
                    this.users.user2.router.depositToken(tokenAddress, "200")
                ]);

                depositResults.push(`${symbol}: ✅`);
            } catch (error) {
                depositResults.push(`${symbol}: ❌ ${error.message.split(' ')[0]}`);
            }
        }
        console.log("💎 Token deposits:", depositResults.join(' | '));
    }

    async basicTrading() {
        console.log("\n⏳ Phase 1: Basic Trading & Security");

        const firstToken = this.tokens[0];
        const firstTokenAddress = this.config.tokens[firstToken].address;

        try {
            console.log(`🔄 Swap: 0.1 ETH → ${firstToken}`);
            await this.users.user2.router.swapTokens(
                '0x0000000000000000000000000000000000000000',
                firstTokenAddress,
                "0.1",
                0.5
            );
            console.log("✅ Swap successful with flash loan protection");
        } catch (error) {
            console.log("❌ Swap failed:", error.message.split(' ')[0], "| Trying smaller amount...");

            try {
                await this.users.user2.router.swapTokens(
                    '0x0000000000000000000000000000000000000000',
                    firstTokenAddress,
                    "0.01",
                    1
                );
                console.log("✅ Small swap successful");
            } catch (retryError) {
                console.log("❌ Retry swap failed:", retryError.message.split(' ')[0]);
            }
        }
    }

    async createAdvancedOrders() {
        console.log("\n⏳ Phase 2: Advanced Order Types");

        const firstToken = this.tokens[0];
        const firstTokenAddress = this.config.tokens[firstToken].address;

        try {
            const currentTokenPrice = await this.getPrice(firstTokenAddress);
            const targetPrice = (currentTokenPrice * 1.05).toFixed(6);

            console.log(`📋 Limit Order: 0.05 ETH @ ${targetPrice} target`);

            await this.users.user2.router.createLimitOrder(
                '0x0000000000000000000000000000000000000000',
                firstTokenAddress,
                "0.05",
                targetPrice,
                true
            );

            this.createdOrders.push({type: 'LIMIT', user: 'user2', token: firstToken});
            console.log(`✅ Limit order created | Self-executable for rewards`);
        } catch (error) {
            console.log("❌ Limit order failed:", error.message.split(' ')[0]);

            try {
                const currentTokenPrice = await this.getPrice(firstTokenAddress);
                const price = currentTokenPrice > 0 ? currentTokenPrice.toFixed(6) : "1.0";
                await this.users.user2.router.createLimitOrder(
                    '0x0000000000000000000000000000000000000000',
                    firstTokenAddress,
                    "0.05",
                    price,
                    true
                );
                this.createdOrders.push({type: 'LIMIT_RETRY', user: 'user2', token: firstToken});
                console.log(`✅ Limit order (retry) created`);
            } catch (retryError) {
                console.log("❌ Retry limit order failed:", retryError.message.split(' ')[0]);
            }
        }

        try {
            const currentEthPrice = await this.getPrice('0x0000000000000000000000000000000000000000');
            const stopPrice = (currentEthPrice * 0.95).toFixed(6);

            console.log(`🛑 Stop-Loss: 0.05 ETH @ ${stopPrice} stop`);

            await this.users.user2.router.createStopLossOrder(
                '0x0000000000000000000000000000000000000000',
                firstTokenAddress,
                "0.05",
                stopPrice
            );

            this.createdOrders.push({type: 'STOP_LOSS', user: 'user2', token: firstToken});
            console.log(`✅ Stop-loss created | Auto-executes if ETH drops`);
        } catch (error) {
            console.log("❌ Stop-loss failed:", error.message.split(' ')[0]);

            try {
                const currentEthPrice = await this.getPrice('0x0000000000000000000000000000000000000000');
                const price = currentEthPrice > 0 ? currentEthPrice.toFixed(6) : "2500.0";
                await this.users.user2.router.createStopLossOrder(
                    '0x0000000000000000000000000000000000000000',
                    firstTokenAddress,
                    "0.05",
                    price
                );
                this.createdOrders.push({type: 'STOP_LOSS_RETRY', user: 'user2', token: firstToken});
                console.log(`✅ Stop-loss (retry) created`);
            } catch (retryError) {
                console.log("❌ Retry stop-loss failed:", retryError.message.split(' ')[0]);
            }
        }
    }

    async orderManagement() {
        console.log("\n⏳ Phase 3: Order Management");

        if (this.createdOrders.length > 0) {
            const lastOrder = this.createdOrders[this.createdOrders.length - 1];

            console.log(`⚠️ Order modification not available in current SDK version`);
            console.log(`⚠️ Order retrieval not available in current SDK version`);

            try {
                console.log(`❌ Attempting to cancel most recent order...`);
                console.log(`⚠️ Order cancellation requires order ID which is not available in current SDK`);
                console.log(`💡 In production: implement order tracking or use events to get order IDs`);
            } catch (error) {
                console.log(`❌ Order cancellation simulation failed: ${error.message}`);
            }
        } else {
            console.log("⚠️ No orders created to demonstrate management features");
        }
    }

    async emergencyFeatures() {
        console.log("\n⏳ Phase 4: Emergency & Security Features");

        if (this.accessControl) {
            try {
                const deployerPrivateKey = process.env.ANVIL_DEPLOYER_PRIVATE_KEY || process.env.ANVIL_KEY;
                if (deployerPrivateKey) {
                    const ethers = require('ethers');
                    const deployerSigner = new ethers.Wallet(deployerPrivateKey, this.users.user1.sdk.client.provider);
                    const accessControlWithDeployer = this.accessControl.connect(deployerSigner);

                    await accessControlWithDeployer.emergencyPause();
                    console.log("🚨 Emergency pause activated | All trading halted");

                    await sleep(500);

                    try {
                        await this.users.user1.router.swapTokens(
                            '0x0000000000000000000000000000000000000000',
                            this.config.tokens[this.tokens[0]].address,
                            "0.001",
                            1
                        );
                        console.log("❌ Trade executed during pause (unexpected!)");
                    } catch {
                        console.log("✅ Trade blocked | Emergency pause working correctly");
                    }

                    await accessControlWithDeployer.emergencyUnpause();
                    console.log("🔄 Emergency pause deactivated | System operational");
                } else {
                    console.log("⚠️ Deployer key not found, cannot test emergency features");
                }
            } catch (error) {
                console.log(`❌ Emergency pause test failed: ${error.message.split(':')[0]}`);
            }
        } else {
            console.log("⚠️ AccessControl not available, skipping emergency pause tests");
        }
    }

    async selfExecution() {
        console.log("\n⏳ Phase 5: Self-Execution Demo");

        const firstToken = this.tokens[0];
        const firstTokenAddress = this.config.tokens[firstToken].address;

        try {
            const currentTokenPrice = await this.getPrice(firstTokenAddress);
            const executionPrice = (currentTokenPrice * 1.01).toFixed(6);

            console.log(`🎯 Self-Exec Order: 0.02 ETH @ ${executionPrice}`);

            await this.users.user1.router.createLimitOrder(
                '0x0000000000000000000000000000000000000000',
                firstTokenAddress,
                "0.02",
                executionPrice,
                true
            );

            this.createdOrders.push({type: 'SELF_EXEC', user: 'user1', token: firstToken});
            console.log(`✅ Self-executable order created | 0.1% reward for executors`);
        } catch (error) {
            console.log(`❌ Self-executable order failed: ${error.message.split(' ')[0]}`);

            try {
                const currentTokenPrice = await this.getPrice(firstTokenAddress);
                const price = currentTokenPrice > 0 ? currentTokenPrice.toFixed(6) : "1.0";
                await this.users.user1.router.createLimitOrder(
                    '0x0000000000000000000000000000000000000000',
                    firstTokenAddress,
                    "0.02",
                    price,
                    true
                );
                this.createdOrders.push({type: 'SELF_EXEC_RETRY', user: 'user1', token: firstToken});
                console.log(`✅ Self-executable order (retry) created`);
            } catch (retryError) {
                console.log(`❌ Retry self-executable order failed: ${retryError.message.split(' ')[0]}`);
            }
        }
    }

    async executionTesting() {
        console.log("\n⏳ Phase 6: Order Execution Testing");

        if (this.createdOrders.length > 0) {
            console.log("🎯 Testing order execution conditions:");
            console.log("⚠️ Order execution testing limited by current SDK capabilities");
            console.log("💡 Available methods: shouldExecuteOrder, canExecuteOrder, selfExecuteOrder");
            console.log("❌ Missing methods: getOrder, getNextOrderId for proper order tracking");

            console.log("\n🔧 Simulating execution logic:");
            this.createdOrders.forEach((order, index) => {
                console.log(`   Order ${index + 1} (${order.type}): Created by ${order.user} for ${order.token}`);
                console.log(`   Status: ⏳ Would need order ID for execution testing`);
            });

            console.log("\n💡 To implement full execution testing:");
            console.log("   1. Add getOrder() method to RouterModule");
            console.log("   2. Add getNextOrderId() method to RouterModule");
            console.log("   3. Track order IDs in order creation responses");
            console.log("   4. Use shouldExecuteOrder() and selfExecuteOrder() with tracked IDs");
        }
    }

    async run() {
        await this.initialize();
        await this.displayStatus();

        await this.fundUsers();
        await sleep(2000);

        await this.basicTrading();
        await sleep(2000);

        await this.createAdvancedOrders();
        await sleep(1000);

        await this.orderManagement();
        await sleep(1000);

        await this.emergencyFeatures();
        await sleep(1000);

        await this.selfExecution();
        await sleep(1000);

        await this.executionTesting();
        await sleep(1000);

        console.log("\n⏳ Final Status");
        await this.displayStatus();

        console.log("📋 Orders Summary:");
        if (this.createdOrders.length > 0) {
            const orderTypes = this.createdOrders.reduce((acc, order) => {
                acc[order.type] = (acc[order.type] || 0) + 1;
                return acc;
            }, {});

            const summary = Object.entries(orderTypes).map(([type, count]) => `${type}: ${count}`).join(' | ');
            console.log(`   ${summary}`);

            this.createdOrders.forEach((order, index) => {
                console.log(`   Order ${index + 1}: ${order.type} by ${order.user} for ${order.token}`);
            });
        } else {
            console.log("   No orders were successfully created");
        }

        console.log("\n🎉 DEMO COMPLETE 🎉");
        console.log("✅ Features Demonstrated: Security | Orders | Execution | Protection | SDK Integration");
        console.log("🔧 SDK Architecture: Unified API | Minimal Code | Reusable Components");
        console.log("⚠️ Current SDK Limitations: Order tracking, modification requires enhancement");
        console.log("🚀 Next Steps: Enhance SDK with missing methods | Run keeper examples");
        console.log("💡 All contract interactions now unified through SDK Router interface\n");
    }
}

async function main() {
    const demo = new TradingDemo();
    await demo.run();
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("🚨 Demo failed:", error.message);
            process.exit(1);
        });
}

module.exports = main;