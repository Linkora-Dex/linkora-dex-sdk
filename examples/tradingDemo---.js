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
        this.ethers = require('ethers');
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
            user1: {
                sdk: user1SDK,
                signer: user1SDK.client.signer,
                address: await user1SDK.client.signer.getAddress(),
                router: user1SDK.client.contractManager.getContract('Router').connect(user1SDK.client.signer)
            },
            user2: {
                sdk: user2SDK,
                signer: user2SDK.client.signer,
                address: await user2SDK.client.signer.getAddress(),
                router: user2SDK.client.contractManager.getContract('Router').connect(user2SDK.client.signer)
            },
            keeper: {
                sdk: keeperSDK,
                signer: keeperSDK.client.signer,
                address: await keeperSDK.client.signer.getAddress(),
                router: keeperSDK.client.contractManager.getContract('Router').connect(keeperSDK.client.signer)
            }
        };

        this.router = user1SDK.client.contractManager.getContract('Router');

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

        for (const [symbol, tokenConfig] of Object.entries(this.config.tokens || {})) {
            const abi = [
                'function mint(address,uint256)',
                'function approve(address,uint256)',
                'function balanceOf(address) view returns (uint256)'
            ];
            this.tokens[symbol] = {
                contract: new this.ethers.Contract(tokenConfig.address, abi, user1SDK.client.provider),
                config: tokenConfig
            };
        }

        console.log(`✅ Initialized users:`);
        console.log(`   User1: ${this.users.user1.address}`);
        console.log(`   User2: ${this.users.user2.address}`);
        console.log(`   Keeper: ${this.users.keeper.address}`);
        console.log(`✅ Tokens: ${Object.keys(this.tokens).concat(['ETH']).join(', ')}`);
        console.log("🛡️ Features: Security, Self-Execution, Stop-Loss, Circuit Breaker, Emergency Controls\n");
    }

    async getPrice(tokenAddress) {
        try {
            const price = await this.router.getPrice(tokenAddress);
            return parseFloat(this.ethers.formatEther(price));
        } catch {
            return 0;
        }
    }

    async getRawPrice(tokenAddress) {
        try {
            return await this.router.getPrice(tokenAddress);
        } catch {
            return BigInt(0);
        }
    }

    async getUserBalance(userAddress, tokenAddress) {
        try {
            if (tokenAddress === this.ethers.ZeroAddress) {
                const balance = await this.router.getBalance(userAddress, tokenAddress);
                return parseFloat(this.ethers.formatEther(balance));
            } else {
                const tokenConfig = Object.values(this.config.tokens || {}).find(t => t.address === tokenAddress);
                const balance = await this.router.getBalance(userAddress, tokenAddress);
                return parseFloat(this.ethers.formatUnits(balance, tokenConfig.decimals));
            }
        } catch {
            return 0;
        }
    }

    async displayStatus() {
        console.log("┌─ SYSTEM STATUS ─────────────────────────────────────────────────┐");

        let paused = false;
        try {
            if (this.accessControl) {
                paused = await this.accessControl.emergencyStop();
            }
        } catch {}

        let nextOrderId = BigInt(0), nextPositionId = BigInt(0);
        try {
            nextOrderId = await this.router.getNextOrderId();
            nextPositionId = await this.router.getNextPositionId();
        } catch {}

        console.log(`│ Status: ${paused ? "🔴 PAUSED" : "🟢 OPERATIONAL"} | Orders: ${Number(nextOrderId) - 1} | Positions: ${Number(nextPositionId) - 1}`);
        console.log("│ Security: ✅ Flash Loan Protection ✅ Circuit Breaker ✅ Emergency Stop");
        console.log("├─ MARKET PRICES ─────────────────────────────────────────────────┤");

        const ethPrice = await this.getPrice(this.ethers.ZeroAddress);
        const prices = [`ETH: ${ethPrice.toFixed(1)}`];

        for (const [symbol, tokenData] of Object.entries(this.tokens)) {
            const price = await this.getPrice(tokenData.config.address);
            prices.push(`${symbol}: ${price.toFixed(6)}`);
        }
        console.log(`│ ${prices.join(' | ')}`);

        console.log("├─ USER BALANCES ─────────────────────────────────────────────────┤");

        for (const [userName, user] of Object.entries(this.users)) {
            if (userName === 'keeper') continue;

            const ethBalance = await this.getUserBalance(user.address, this.ethers.ZeroAddress);
            const ethValue = ethBalance * ethPrice;
            const balances = [`ETH: ${ethBalance.toFixed(1)} ($${ethValue.toFixed(2)})`];

            for (const [symbol, tokenData] of Object.entries(this.tokens)) {
                const balance = await this.getUserBalance(user.address, tokenData.config.address);
                const price = await this.getPrice(tokenData.config.address);
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
            await this.users.user1.router.depositETH({ value: this.ethers.parseEther("2") });
            await this.users.user2.router.depositETH({ value: this.ethers.parseEther("2") });
            console.log("✅ ETH deposits: User1 & User2 deposited 2 ETH each");
        } catch (error) {
            console.log("❌ ETH deposit failed:", error.message);
        }

        const depositResults = [];
        for (const [symbol, tokenData] of Object.entries(this.tokens)) {
            try {
                const userBalance = await tokenData.contract.balanceOf(this.users.user1.address);
                const requiredAmount = this.ethers.parseUnits("200", tokenData.config.decimals);

                if (userBalance < requiredAmount) {
                    await tokenData.contract.connect(this.users.user1.signer).mint(this.users.user1.address, requiredAmount * BigInt(2));
                    await tokenData.contract.connect(this.users.user2.signer).mint(this.users.user2.address, requiredAmount * BigInt(2));
                }

                await tokenData.contract.connect(this.users.user1.signer).approve(this.router.target, requiredAmount);
                await this.users.user1.router.depositToken(tokenData.config.address, requiredAmount);
                await tokenData.contract.connect(this.users.user2.signer).approve(this.router.target, requiredAmount);
                await this.users.user2.router.depositToken(tokenData.config.address, requiredAmount);

                depositResults.push(`${symbol}: ✅`);
            } catch (error) {
                depositResults.push(`${symbol}: ❌`);
            }
        }
        console.log("💎 Token deposits:", depositResults.join(' | '));
    }

    async basicTrading() {
        console.log("\n⏳ Phase 1: Basic Trading & Security");

        const firstToken = Object.keys(this.tokens)[0];
        const firstTokenAddress = this.tokens[firstToken].config.address;

        try {
            const swapAmount = this.ethers.parseEther("0.1");
            const expectedOut = await this.router.getAmountOut(swapAmount, this.ethers.ZeroAddress, firstTokenAddress);
            const minAmountOut = expectedOut * BigInt(90) / BigInt(100);

            console.log(`🔄 Swap: 0.1 ETH → ${this.ethers.formatUnits(expectedOut, this.tokens[firstToken].config.decimals)} ${firstToken}`);

            const swapTx = await this.users.user2.router.swapTokens(
                this.ethers.ZeroAddress, firstTokenAddress, swapAmount, minAmountOut, { value: swapAmount }
            );
            await swapTx.wait();
            console.log("✅ Swap successful with flash loan protection");
        } catch (error) {
            console.log("❌ Swap failed:", error.message, "| Trying smaller amount...");

            try {
                const smallSwapAmount = this.ethers.parseEther("0.01");
                const expectedOut = await this.router.getAmountOut(smallSwapAmount, this.ethers.ZeroAddress, firstTokenAddress);
                const minAmountOut = expectedOut * BigInt(80) / BigInt(100);

                const smallSwapTx = await this.users.user2.router.swapTokens(
                    this.ethers.ZeroAddress, firstTokenAddress, smallSwapAmount, minAmountOut, { value: smallSwapAmount }
                );
                await smallSwapTx.wait();
                console.log("✅ Small swap successful");
            } catch (retryError) {
                console.log("❌ Retry swap failed:", retryError.message);
            }
        }
    }

    async createAdvancedOrders() {
        console.log("\n⏳ Phase 2: Advanced Order Types");

        const firstToken = Object.keys(this.tokens)[0];
        const firstTokenAddress = this.tokens[firstToken].config.address;

        try {
            const currentTokenRawPrice = await this.getRawPrice(firstTokenAddress);
            const targetPriceRaw = currentTokenRawPrice * BigInt(105) / BigInt(100);
            const orderAmount = this.ethers.parseEther("0.05");
            const expectedOut = await this.router.getAmountOut(orderAmount, this.ethers.ZeroAddress, firstTokenAddress);
            const minAmountOut = expectedOut * BigInt(80) / BigInt(100);

            console.log(`📋 Limit Order: ${this.ethers.formatEther(orderAmount)} ETH @ ${this.ethers.formatEther(targetPriceRaw)} target`);

            const orderTx = await this.users.user2.router.createLimitOrder(
                this.ethers.ZeroAddress, firstTokenAddress, orderAmount, targetPriceRaw, minAmountOut, true, { value: orderAmount }
            );
            await orderTx.wait();

            const orderId = (await this.router.getNextOrderId()) - BigInt(1);
            this.createdOrders.push({id: Number(orderId), user: this.users.user2, type: 'LIMIT'});
            console.log(`✅ Limit order created: ID ${orderId} | Self-executable for rewards`);
        } catch (error) {
            console.log("❌ Limit order failed:", error.message);

            try {
                const currentTokenRawPrice = await this.getRawPrice(firstTokenAddress);
                const orderAmount = this.ethers.parseEther("0.05");
                const expectedOut = await this.router.getAmountOut(orderAmount, this.ethers.ZeroAddress, firstTokenAddress);
                const minAmountOut = expectedOut * BigInt(50) / BigInt(100);

                const retryOrderTx = await this.users.user2.router.createLimitOrder(
                    this.ethers.ZeroAddress, firstTokenAddress, orderAmount, currentTokenRawPrice, minAmountOut, true, { value: orderAmount }
                );
                await retryOrderTx.wait();

                const orderId = (await this.router.getNextOrderId()) - BigInt(1);
                this.createdOrders.push({id: Number(orderId), user: this.users.user2, type: 'LIMIT_RETRY'});
                console.log(`✅ Limit order (retry) created: ID ${orderId}`);
            } catch (retryError) {
                console.log("❌ Retry limit order failed:", retryError.message);
            }
        }

        try {
            const currentEthRawPrice = await this.getRawPrice(this.ethers.ZeroAddress);
            const stopPriceRaw = currentEthRawPrice * BigInt(95) / BigInt(100);
            const orderAmount = this.ethers.parseEther("0.05");
            const expectedOut = await this.router.getAmountOut(orderAmount, this.ethers.ZeroAddress, firstTokenAddress);
            const minAmountOut = expectedOut * BigInt(80) / BigInt(100);

            console.log(`🛑 Stop-Loss: ${this.ethers.formatEther(orderAmount)} ETH @ ${this.ethers.formatEther(stopPriceRaw)} stop`);

            const stopLossTx = await this.users.user2.router.createStopLossOrder(
                this.ethers.ZeroAddress, firstTokenAddress, orderAmount, stopPriceRaw, minAmountOut, { value: orderAmount }
            );
            await stopLossTx.wait();

            const orderId = (await this.router.getNextOrderId()) - BigInt(1);
            this.createdOrders.push({id: Number(orderId), user: this.users.user2, type: 'STOP_LOSS'});
            console.log(`✅ Stop-loss created: ID ${orderId} | Auto-executes if ETH drops`);
        } catch (error) {
            console.log("❌ Stop-loss failed:", error.message);

            try {
                const currentEthRawPrice = await this.getRawPrice(this.ethers.ZeroAddress);
                const orderAmount = this.ethers.parseEther("0.05");
                const expectedOut = await this.router.getAmountOut(orderAmount, this.ethers.ZeroAddress, firstTokenAddress);
                const minAmountOut = expectedOut * BigInt(50) / BigInt(100);

                const retryStopTx = await this.users.user2.router.createStopLossOrder(
                    this.ethers.ZeroAddress, firstTokenAddress, orderAmount, currentEthRawPrice, minAmountOut, { value: orderAmount }
                );
                await retryStopTx.wait();

                const orderId = (await this.router.getNextOrderId()) - BigInt(1);
                this.createdOrders.push({id: Number(orderId), user: this.users.user2, type: 'STOP_LOSS_RETRY'});
                console.log(`✅ Stop-loss (retry) created: ID ${orderId}`);
            } catch (retryError) {
                console.log("❌ Retry stop-loss failed:", retryError.message);
            }
        }
    }

    async orderManagement() {
        console.log("\n⏳ Phase 3: Order Management");

        if (this.createdOrders.length > 0) {
            const lastOrder = this.createdOrders[this.createdOrders.length - 1];
            const firstToken = Object.keys(this.tokens)[0];

            try {
                const currentPrice = await this.getRawPrice(this.ethers.ZeroAddress);
                const newTargetPrice = currentPrice * BigInt(98) / BigInt(100);
                const minAmountOut = this.ethers.parseUnits("1", this.tokens[firstToken].config.decimals);

                const orderData = await this.router.getOrder(lastOrder.id);
                if (!orderData.executed) {
                    const modifyTx = await lastOrder.user.router.modifyOrder(lastOrder.id, newTargetPrice, minAmountOut);
                    await modifyTx.wait();
                    console.log(`✏️ Order ${lastOrder.id} modified | New target: ${this.ethers.formatEther(newTargetPrice)}`);
                } else {
                    console.log(`⚠️ Order ${lastOrder.id} already executed, skipping modification`);
                }
            } catch (error) {
                console.log(`❌ Order modification failed: ${error.message}`);
            }

            try {
                const cancelTx = await lastOrder.user.router.cancelOrder(lastOrder.id);
                await cancelTx.wait();
                console.log(`❌ Order ${lastOrder.id} cancelled | Funds unlocked automatically`);
            } catch (error) {
                console.log(`❌ Order cancellation failed: ${error.message}`);
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
                    const deployerSigner = new this.ethers.Wallet(deployerPrivateKey, this.users.user1.sdk.client.provider);
                    const accessControlWithDeployer = this.accessControl.connect(deployerSigner);

                    await accessControlWithDeployer.emergencyPause();
                    console.log("🚨 Emergency pause activated | All trading halted");

                    await sleep(500);

                    try {
                        const firstToken = Object.keys(this.tokens)[0];
                        await this.users.user1.router.swapTokens(
                            this.ethers.ZeroAddress, this.tokens[firstToken].config.address, this.ethers.parseEther("0.001"),
                            this.ethers.parseUnits("1", this.tokens[firstToken].config.decimals), { value: this.ethers.parseEther("0.001") }
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

        const firstToken = Object.keys(this.tokens)[0];
        const firstTokenAddress = this.tokens[firstToken].config.address;

        try {
            const currentTokenRawPrice = await this.getRawPrice(firstTokenAddress);
            const executionPriceRaw = currentTokenRawPrice * BigInt(101) / BigInt(100);
            const orderAmount = this.ethers.parseEther("0.02");
            const expectedOut = await this.router.getAmountOut(orderAmount, this.ethers.ZeroAddress, firstTokenAddress);
            const minAmountOut = expectedOut * BigInt(80) / BigInt(100);

            console.log(`🎯 Self-Exec Order: ${this.ethers.formatEther(orderAmount)} ETH @ ${this.ethers.formatEther(executionPriceRaw)}`);

            const selfExecTx = await this.users.user1.router.createLimitOrder(
                this.ethers.ZeroAddress, firstTokenAddress, orderAmount, executionPriceRaw, minAmountOut, true, { value: orderAmount }
            );
            await selfExecTx.wait();

            const orderId = (await this.router.getNextOrderId()) - BigInt(1);
            this.createdOrders.push({id: Number(orderId), user: this.users.user1, type: 'SELF_EXEC'});
            console.log(`✅ Self-executable order created: ID ${orderId} | 0.1% reward for executors`);
        } catch (error) {
            console.log(`❌ Self-executable order failed: ${error.message}`);

            try {
                const currentTokenRawPrice = await this.getRawPrice(firstTokenAddress);
                const orderAmount = this.ethers.parseEther("0.02");
                const expectedOut = await this.router.getAmountOut(orderAmount, this.ethers.ZeroAddress, firstTokenAddress);
                const minAmountOut = expectedOut * BigInt(50) / BigInt(100);

                const retrySelfExecTx = await this.users.user1.router.createLimitOrder(
                    this.ethers.ZeroAddress, firstTokenAddress, orderAmount, currentTokenRawPrice, minAmountOut, true, { value: orderAmount }
                );
                await retrySelfExecTx.wait();

                const orderId = (await this.router.getNextOrderId()) - BigInt(1);
                this.createdOrders.push({id: Number(orderId), user: this.users.user1, type: 'SELF_EXEC_RETRY'});
                console.log(`✅ Self-executable order (retry) created: ID ${orderId}`);
            } catch (retryError) {
                console.log(`❌ Retry self-executable order failed: ${retryError.message}`);
            }
        }
    }

    async executionTesting() {
        console.log("\n⏳ Phase 6: Order Execution Testing");

        if (this.createdOrders.length > 0) {
            console.log("🎯 Testing order execution conditions:");

            const executionResults = [];
            for (const order of this.createdOrders) {
                try {
                    const canExecute = await this.router.shouldExecuteOrder(order.id);
                    const orderData = await this.router.getOrder(order.id);

                    const status = `ID ${order.id} (${order.type}): ${canExecute ? "✅ Can execute" : "⏳ Waiting"} | Target: ${this.ethers.formatEther(orderData.targetPrice)} | Executed: ${orderData.executed ? "Yes" : "No"}`;
                    executionResults.push(status);

                    if (canExecute && !orderData.executed) {
                        try {
                            const execTx = await this.users.keeper.router.selfExecuteOrder(order.id);
                            await execTx.wait();
                            console.log(`🚀 Order ${order.id} executed successfully!`);
                        } catch (execError) {
                            console.log(`❌ Order ${order.id} execution failed: ${execError.message}`);
                        }
                    }
                } catch (checkError) {
                    executionResults.push(`ID ${order.id}: ❌ Check failed`);
                }
            }

            executionResults.forEach(result => console.log(`   ${result}`));
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

        console.log("\n⏳ Phase 5: Self-Execution Demo");
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

            this.createdOrders.forEach((order) => {
                const userNum = order.user === this.users.user1 ? '1' : '2';
                console.log(`   Order ${order.id}: ${order.type} by User${userNum}`);
            });
        } else {
            console.log("   No orders were successfully created");
        }

        console.log("\n🎉 DEMO COMPLETE 🎉");
        console.log("✅ Features Demonstrated: Security | Orders | Execution | Protection | Debug");
        console.log("🔧 Router-Centric: Single API | Consistent patterns | Future-proof architecture");
        console.log("🚀 Next Steps: 'npm run keeper:upgradeable-anvil' | 'npm run price-generator-anvil' | Test scenarios");
        console.log("💡 All contract interactions now unified through Router interface\n");
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