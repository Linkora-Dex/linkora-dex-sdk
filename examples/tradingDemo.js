const {createSDK} = require('../index');
const fs = require('fs');
require('dotenv').config();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function loadConfig() {
    const paths = ['./config/anvil_upgradeable-config.json', './config/anvil_final-config.json'];
    for (const path of paths) {
        if (fs.existsSync(path)) return JSON.parse(fs.readFileSync(path, 'utf8'));
    }
    throw new Error("Config not found");
}

async function main() {
    console.log("🚀 SDK Trading Demo");

    const config = loadConfig();

    // Initialize SDK instances for different users
    const [demoSDK1, demoSDK2, keeperSDK] = await Promise.all([
        createSDK({
            rpcUrl: 'http://127.0.0.1:8545',
            privateKey: process.env.USER1_PRIVATE_KEY,
            contracts: config.contracts
        }),
        createSDK({
            rpcUrl: 'http://127.0.0.1:8545',
            privateKey: process.env.USER2_PRIVATE_KEY,
            contracts: config.contracts
        }),
        createSDK({
            rpcUrl: 'http://127.0.0.1:8545',
            privateKey: process.env.ANVIL_KEEPER_PRIVATE_KEY,
            contracts: config.contracts
        })
    ]);

    const {router: router1, pool: pool1, trading: trading1} = demoSDK1;
    const {router: router2} = demoSDK2;
    const {router: routerKeeper} = keeperSDK;

    const tokens = Object.keys(config.tokens || {});
    const firstToken = tokens[0];
    const firstTokenAddress = config.tokens[firstToken]?.address;

    if (!firstTokenAddress) throw new Error("No tokens configured");

    const createdOrders = [];

    const displayStatus = async () => {
        try {
            const [user1Addr, user2Addr] = await Promise.all([
                router1.getUserAddress?.() || demoSDK1.client.signer.getAddress(),
                router2.getUserAddress?.() || demoSDK2.client.signer.getAddress()
            ]);

            const [ethPrice, tokenPrice] = await Promise.all([
                router1.getPrice('0x0000000000000000000000000000000000000000'),
                router1.getPrice(firstTokenAddress)
            ]);

            const [user1EthBal, user1TokenBal, user2EthBal, user2TokenBal] = await Promise.all([
                router1.getBalance(user1Addr, '0x0000000000000000000000000000000000000000'),
                router1.getBalance(user1Addr, firstTokenAddress),
                router2.getBalance(user2Addr, '0x0000000000000000000000000000000000000000'),
                router2.getBalance(user2Addr, firstTokenAddress)
            ]);

            const isPaused = await router1.isSystemPaused();
            const [nextOrderId, nextPositionId] = await Promise.all([
                router1.getNextOrderId(),
                router1.getNextPositionId()
            ]);

            console.log("┌─ SYSTEM STATUS ────────────────────────────────────────────┐");
            console.log(`│ Status: ${isPaused ? "🔴 PAUSED" : "🟢 OPERATIONAL"} | Orders: ${Number(nextOrderId) - 1} | Positions: ${Number(nextPositionId) - 1}`);
            console.log(`│ Prices: ETH: ${parseFloat(ethPrice).toFixed(1)} | ${firstToken}: ${parseFloat(tokenPrice).toFixed(6)}`);
            console.log(`│ User1: ${parseFloat(user1EthBal).toFixed(1)} ETH | ${parseFloat(user1TokenBal).toFixed(1)} ${firstToken}`);
            console.log(`│ User2: ${parseFloat(user2EthBal).toFixed(1)} ETH | ${parseFloat(user2TokenBal).toFixed(1)} ${firstToken}`);
            console.log("└────────────────────────────────────────────────────────────┘");
        } catch (error) {
            console.log("⚠️ Status display failed:", error.message);
        }
    };

    await displayStatus();

    // Phase 0: Fund users
    console.log("\n⏳ Phase 0: Funding Users");
    try {
        await Promise.all([
            router1.depositETH("2"),
            router2.depositETH("2")
        ]);
        console.log("✅ ETH deposits: 2 ETH each");

        // Mint and deposit tokens
        const tokenContract = demoSDK1.client.contractManager.getContract('ERC20', firstTokenAddress, [
            'function mint(address,uint256)',
            'function approve(address,uint256)',
            'function balanceOf(address) view returns (uint256)'
        ]);

        await Promise.all([
            tokenContract.connect(demoSDK1.client.signer).mint(await demoSDK1.client.signer.getAddress(), '400000000000000000000'),
            tokenContract.connect(demoSDK2.client.signer).mint(await demoSDK2.client.signer.getAddress(), '400000000000000000000')
        ]);

        await Promise.all([
            router1.depositToken(firstTokenAddress, "200"),
            router2.depositToken(firstTokenAddress, "200")
        ]);
        console.log(`✅ Token deposits: 200 ${firstToken} each`);
    } catch (error) {
        console.log("❌ Funding failed:", error.message);
    }

    await sleep(1000);

    // Phase 1: Basic Trading
    console.log("\n⏳ Phase 1: Basic Trading");
    try {
        const amountOut = await router2.swapTokens('0x0000000000000000000000000000000000000000', firstTokenAddress, "0.1", 1);
        console.log("✅ Swap: 0.1 ETH → tokens successful");
    } catch (error) {
        console.log("❌ Swap failed:", error.message);
    }

    await sleep(1000);

    // Phase 2: Advanced Orders
    console.log("\n⏳ Phase 2: Creating Orders");
    try {
        const currentPrice = await router2.getPrice(firstTokenAddress);
        const targetPrice = (parseFloat(currentPrice) * 1.05).toFixed(6);

        const orderId1 = await router2.createLimitOrder(
            '0x0000000000000000000000000000000000000000',
            firstTokenAddress,
            "0.05",
            targetPrice,
            true
        );
        createdOrders.push({id: orderId1, user: 'User2', type: 'LIMIT'});
        console.log(`✅ Limit order created: ID ${orderId1} @ ${targetPrice}`);
    } catch (error) {
        console.log("❌ Limit order failed:", error.message);
    }

    try {
        const currentPrice = await router2.getPrice('0x0000000000000000000000000000000000000000');
        const stopPrice = (parseFloat(currentPrice) * 0.95).toFixed(6);

        const orderId2 = await router2.createStopLossOrder(
            '0x0000000000000000000000000000000000000000',
            firstTokenAddress,
            "0.05",
            stopPrice
        );
        createdOrders.push({id: orderId2, user: 'User2', type: 'STOP_LOSS'});
        console.log(`✅ Stop-loss created: ID ${orderId2} @ ${stopPrice}`);
    } catch (error) {
        console.log("❌ Stop-loss failed:", error.message);
    }

    await sleep(1000);

    // Phase 3: Order Management
    console.log("\n⏳ Phase 3: Order Management");
    if (createdOrders.length > 0) {
        const lastOrder = createdOrders[createdOrders.length - 1];

        try {
            const currentPrice = await router2.getPrice('0x0000000000000000000000000000000000000000');
            const newTargetPrice = (parseFloat(currentPrice) * 0.98).toFixed(6);

            await router2.modifyOrder(lastOrder.id, newTargetPrice, "1");
            console.log(`✏️ Order ${lastOrder.id} modified to ${newTargetPrice}`);
        } catch (error) {
            console.log(`❌ Order modification failed: ${error.message}`);
        }

        try {
            await router2.cancelOrder(lastOrder.id);
            console.log(`❌ Order ${lastOrder.id} cancelled`);
        } catch (error) {
            console.log(`❌ Order cancellation failed: ${error.message}`);
        }
    }

    await sleep(1000);

    // Phase 4: Emergency Features
    console.log("\n⏳ Phase 4: Emergency Features");
    try {
        // Test emergency pause if available
        if (config.contracts.AccessControl) {
            const accessControl = demoSDK1.client.contractManager.getContract('AccessControl');

            await accessControl.emergencyPause();
            console.log("🚨 Emergency pause activated");

            try {
                await router1.swapTokens('0x0000000000000000000000000000000000000000', firstTokenAddress, "0.001", 1);
                console.log("❌ Trade executed during pause (unexpected!)");
            } catch {
                console.log("✅ Trade blocked during pause");
            }

            await accessControl.emergencyUnpause();
            console.log("🔄 Emergency pause deactivated");
        }
    } catch (error) {
        console.log(`⚠️ Emergency features test: ${error.message}`);
    }

    await sleep(1000);

    // Phase 5: Self-Execution
    console.log("\n⏳ Phase 5: Self-Execution");
    try {
        const currentPrice = await router1.getPrice(firstTokenAddress);
        const execPrice = (parseFloat(currentPrice) * 1.01).toFixed(6);

        const orderId = await router1.createLimitOrder(
            '0x0000000000000000000000000000000000000000',
            firstTokenAddress,
            "0.02",
            execPrice,
            true
        );
        createdOrders.push({id: orderId, user: 'User1', type: 'SELF_EXEC'});
        console.log(`✅ Self-executable order: ID ${orderId} @ ${execPrice}`);
    } catch (error) {
        console.log(`❌ Self-executable order failed: ${error.message}`);
    }

    await sleep(1000);

    // Phase 6: Execution Testing
    console.log("\n⏳ Phase 6: Order Execution");
    if (createdOrders.length > 0) {
        console.log("🎯 Testing order execution:");

        for (const order of createdOrders) {
            try {
                const canExecute = await routerKeeper.shouldExecuteOrder(order.id);
                const orderData = await routerKeeper.getOrder(order.id);

                console.log(`   Order ${order.id} (${order.type}): ${canExecute ? "✅ Executable" : "⏳ Waiting"} | Executed: ${orderData.executed ? "Yes" : "No"}`);

                if (canExecute && !orderData.executed) {
                    try {
                        await routerKeeper.selfExecuteOrder(order.id);
                        console.log(`   🚀 Order ${order.id} executed successfully!`);
                    } catch (execError) {
                        const msg = execError.message.includes('Slippage') ? 'slippage protection' :
                            execError.message.includes('Price change') ? 'circuit breaker' : 'execution error';
                        console.log(`   ❌ Order ${order.id} failed: ${msg}`);
                    }
                }
            } catch (error) {
                console.log(`   ❌ Order ${order.id} check failed: ${error.message}`);
            }
        }
    }

    await sleep(1000);

    // Final Status
    console.log("\n⏳ Final Status");
    await displayStatus();

    console.log("\n📋 Orders Summary:");
    if (createdOrders.length > 0) {
        const summary = createdOrders.reduce((acc, order) => {
            acc[order.type] = (acc[order.type] || 0) + 1;
            return acc;
        }, {});

        console.log(`   ${Object.entries(summary).map(([type, count]) => `${type}: ${count}`).join(' | ')}`);
        createdOrders.forEach(order => {
            console.log(`   Order ${order.id}: ${order.type} by ${order.user}`);
        });
    } else {
        console.log("   No orders created");
    }

    console.log("\n🎉 DEMO COMPLETE");
    console.log("✅ Features: Security | Orders | Execution | Emergency Controls");
    console.log("🔧 SDK: Unified API | Minimal Code | Type Safety");
    console.log("🚀 Next: Run keeper and price generator examples");
}

main().catch(error => {
    console.error("🚨 Demo failed:", error.message);
    process.exit(1);
});