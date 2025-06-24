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

async function main() {
    console.log("🤖 SDK Keeper started");

    const config = loadConfig();
    const {router, trading, pool, events, keeper: keeperModule} = await createSDK({
        rpcUrl: 'http://127.0.0.1:8545',
        privateKey: process.env.ANVIL_KEEPER_PRIVATE_KEY,
        contracts: config.contracts
    });

    const stats = {orders: 0, positions: 0, errors: 0};
    let cycle = 0;

    const checkSystemStatus = async () => {
        try {
            return !(await router.isSystemPaused());
        } catch {
            return true;
        }
    };

    const processOrders = async () => {
        const opportunities = await keeperModule.getKeeperOpportunities();
        const orders = opportunities.filter(opp => opp.type === 'order_execution');
        if (orders.length === 0) return 0;

        console.log(`📋 ${orders.length} executable orders`);

        let executed = 0;
        for (const order of orders) {
            try {
                await router.executeOrder(order.id);
                executed++;
                stats.orders++;
                console.log(`✅ Order ${order.id} executed`);
            } catch (error) {
                stats.errors++;
                const msg = error.message.includes('Slippage') ? 'slippage' :
                    error.message.includes('Price change') ? 'circuit breaker' :
                        error.message.includes('Insufficient') ? 'liquidity' : 'unknown';
                console.log(`❌ Order ${order.id} failed: ${msg}`);
            }
        }
        return executed;
    };

    const processPositions = async () => {
        const opportunities = await keeperModule.getKeeperOpportunities();
        const positions = opportunities.filter(opp => opp.type === 'position_liquidation');
        if (positions.length === 0) return 0;

        console.log(`⚡ ${positions.length} liquidatable positions`);

        let liquidated = 0;
        for (const position of positions) {
            try {
                await router.liquidatePosition(position.id);
                liquidated++;
                stats.positions++;
                console.log(`⚡ Position ${position.id} liquidated`);
            } catch (error) {
                stats.errors++;
                console.log(`❌ Position ${position.id} failed`);
            }
        }
        return liquidated;
    };

    const showStats = async () => {
        const nextOrderId = await router.callContract('Router', 'getNextOrderId');
        const nextPositionId = await router.callContract('Router', 'getNextPositionId');
        const totalOrders = Number(nextOrderId) - 1;
        const totalPositions = Number(nextPositionId) - 1;

        console.log(`📊 Cycle ${cycle} | Orders: ${totalOrders} | Positions: ${totalPositions} | Executed: ${stats.orders} | Liquidated: ${stats.positions} | Errors: ${stats.errors}`);
    };

    console.log("🚀 Monitoring started - checking every 20s");

    while (true) {
        try {
            cycle++;

            if (!(await checkSystemStatus())) {
                console.log("🔴 System paused");
                await sleep(20000);
                continue;
            }

            const [ordersExecuted, positionsLiquidated] = await Promise.all([
                processOrders(),
                cycle % 2 === 0 ? processPositions() : Promise.resolve(0)
            ]);

            if (ordersExecuted > 0 || positionsLiquidated > 0 || cycle % 10 === 1) {
                await showStats();
            }

        } catch (error) {
            stats.errors++;
            console.log(`🚨 Cycle error: ${error.message}`);
        }

        await sleep(20000);
    }
}

process.on('SIGINT', () => {
    console.log('\n🛑 Keeper stopped');
    process.exit(0);
});

main().catch(error => {
    console.error("🚨 Keeper failed:", error.message);
    process.exit(1);
});