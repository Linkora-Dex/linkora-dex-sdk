// examples/keeper.js (обновленная версия)
const {createSDK} = require('../index');
const fs = require('fs');
require('dotenv').config();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function loadConfig() {
 const paths = [
 './config/anvil_upgradeable-config.json',
 './config/anvil_final-config.json',
 './config/upgradeable-config.json'
 ];

 for (const path of paths) {
 if (fs.existsSync(path)) {
 console.log(`📋 Loading config: ${path}`);
 return JSON.parse(fs.readFileSync(path, 'utf8'));
 }
 }
 throw new Error("❌ No config found. Run: npm run prod:deploy");
}

async function main() {
 console.log("🤖 SDK Keeper Service | Upgradeable Architecture");

 const config = loadConfig();

 const keeperPrivateKey = process.env.ANVIL_KEEPER_PRIVATE_KEY || process.env.ANVIL_KEY;
 if (!keeperPrivateKey) {
 throw new Error("❌ Keeper private key not found. Set ANVIL_KEEPER_PRIVATE_KEY or ANVIL_KEY in .env");
 }

 const {router, keeper, oracle} = await createSDK({
 rpcUrl: 'http://127.0.0.1:8545',
 privateKey: keeperPrivateKey,
 contracts: config.contracts
 });

 console.log("✅ SDK Keeper initialized");

 const displayDiagnostics = async (phase) => {
 try {
 const diagnostics = await keeper.getSystemDiagnostics();
 console.log(`\n┌─ SDK DIAGNOSTICS: ${phase} ────────────────────────────────┐`);
 console.log(`│ Keeper: ${diagnostics.keeper.address}`);
 console.log(`│ ETH Balance: ${diagnostics.keeper.ethBalance} ETH`);
 console.log(`│ Pool Balance: ${diagnostics.keeper.poolBalance} ETH`);

 const tokenBalances = Object.entries(diagnostics.keeper.tokenBalances);
 if (tokenBalances.length > 0) {
 const balanceStr = tokenBalances.map(([symbol, balance]) => `${symbol}: ${parseFloat(balance).toFixed(2)}`).join(' | ');
 console.log(`│ Token Balances: ${balanceStr}`);
 }

 console.log(`│ System Status: ${diagnostics.system.isOperational ? '🟢 OPERATIONAL' : '🔴 PAUSED'}`);

 const contractEntries = Object.entries(diagnostics.contracts);
 if (contractEntries.length > 0) {
 contractEntries.forEach(([name, info]) => {
 console.log(`│ ${name}: v${info.version} (${info.address.slice(0, 8)}...)`);
 });
 }

 console.log("└────────────────────────────────────────────────────────────────┘");
 } catch (error) {
 console.log(`⚠️ Diagnostics failed: ${error.message}`);
 }
 };

 await displayDiagnostics("INITIALIZATION");

 console.log("\n🚀 SDK Keeper monitoring started");
 console.log("🔄 Using SDK modular architecture");
 console.log("⏹️ Press Ctrl+C to stop\n");

 let cycleCounter = 0;

 while (true) {
 try {
 cycleCounter++;

 const systemStatus = await keeper.getSystemStatus();
 if (!systemStatus.isOperational) {
 console.log("🔴 System not operational - waiting 20s...");
 await sleep(20000);
 continue;
 }

 const nextOrderId = await keeper.getNextOrderId();
 const totalOrders = Number(nextOrderId) - 1;

 if (totalOrders > 0) {
 console.log(`🔍 Cycle ${cycleCounter}: Processing ${totalOrders} orders via SDK`);

 const executableOrders = await keeper.getExecutableOrders();
 const allOrders = await keeper.getAllOrders();
 const completedOrders = allOrders.filter(order => order.executed);
 const activePendingOrders = allOrders.filter(order => !order.executed);

 console.log(`📊 Orders: ${executableOrders.length} executable | ${completedOrders.length} completed | ${activePendingOrders.length} pending`);

 for (const order of executableOrders) {
 console.log(`🎯 Executing order ${order.id}: ${order.orderType} ${order.direction} (${order.tokenPair})`);
 console.log(`   Amount: ${order.amountIn} | Target: ${order.targetPrice}`);

 try {
 await keeper.selfExecuteOrder(order.id);
 console.log(`✅ Order ${order.id} executed successfully via SDK`);
 } catch (error) {
 const errorMsg = error.message.split('\n')[0];
 console.log(`❌ Order ${order.id} execution failed: ${errorMsg}`);

 if (error.message.includes('Slippage')) {
 console.log(`   Reason: Slippage protection triggered`);
 } else if (error.message.includes('Price change')) {
 console.log(`   Reason: Circuit breaker triggered`);
 } else if (error.message.includes('Insufficient')) {
 console.log(`   Reason: Insufficient funds/liquidity`);
 }
 }
 }

 if (activePendingOrders.length > 0 && executableOrders.length === 0) {
 activePendingOrders.slice(0, 3).forEach(order => {
 console.log(`⏳ Order ${order.id}: ${order.orderType} ${order.direction} waiting for price condition`);
 });
 }
 }

 if (cycleCounter % 2 === 0) {
 const nextPositionId = await keeper.getNextPositionId();
 const totalPositions = Number(nextPositionId) - 1;

 if (totalPositions > 0) {
 console.log(`📊 Checking ${totalPositions} positions via SDK`);

 const liquidatablePositions = await keeper.getLiquidatablePositions();

 for (const position of liquidatablePositions) {
 console.log(`⚡ Liquidating position ${position.id}: ${position.pnlPercent}% loss`);

 try {
 await keeper.liquidatePosition(position.id);
 console.log(`⚡ Position ${position.id} liquidated via SDK`);
 } catch (error) {
 console.log(`❌ Liquidation failed for position ${position.id}: ${error.message}`);
 }
 }

 if (liquidatablePositions.length === 0 && totalPositions > 0) {
 console.log(`💚 All ${totalPositions} positions are healthy`);
 }
 }
 }

 if (totalOrders === 0 && cycleCounter % 4 === 0) {
 console.log(`💤 No active orders | Cycle ${cycleCounter} | SDK system operational`);
 }

 if (cycleCounter % 20 === 0) {
 const stats = keeper.getKeeperStats();
 console.log(`\n📈 SDK KEEPER STATS`);
 console.log(` Orders executed: ${stats.ordersExecuted}`);
 console.log(` Positions liquidated: ${stats.positionsLiquidated}`);
 console.log(` Errors: ${stats.errors}`);
 console.log(` Last run: ${stats.lastRun || 'Never'}\n`);
 }

 } catch (error) {
 console.log(`🚨 SDK Keeper cycle error: ${error.message}`);
 }

 await sleep(20000);
 }
}

process.on('SIGINT', () => {
 console.log('\n🛑 SDK Keeper service stopped');
 process.exit(0);
});

if (require.main === module) {
 main().catch(error => {
 console.error("🚨 SDK Keeper failed:", error.message);
 process.exit(1);
 });
}

module.exports = main;