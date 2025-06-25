// modules/KeeperModule.js (полная версия)
const BaseModule = require('./BaseModule');

class KeeperModule extends BaseModule {
constructor() {
super('KeeperModule', '1.0.0');
this.isRunning = false;
this.intervals = new Map();
this.stats = {
ordersExecuted: 0,
positionsLiquidated: 0,
pricesUpdated: 0,
errors: 0,
lastRun: null
};
}

initialize(context) {
super.initialize(context);
this.routerContract = this.getContract('Router');
this.tradingContract = this.getContract('Trading');
this.oracleContract = this.getContract('Oracle');
}

async getOrder(orderId) {
const order = await this.routerContract.getOrder(orderId);
return this.formatOrderData(order);
}

async getPosition(positionId) {
const position = await this.routerContract.getPosition(positionId);
const currentPrice = await this.getCurrentPrice(position.token);
return this.formatPositionData(position, currentPrice);
}

async getNextOrderId() {
return this.routerContract.getNextOrderId();
}

async getNextPositionId() {
return this.routerContract.getNextPositionId();
}

async shouldExecuteOrder(orderId) {
return this.routerContract.shouldExecuteOrder(orderId);
}

async canExecuteOrder(orderId) {
return this.routerContract.canExecuteOrder(orderId);
}

async selfExecuteOrder(orderId, options = {}) {
const tx = await this.routerContract.selfExecuteOrder(orderId, options);
const receipt = await this.handleTransaction(() => tx.wait(), `Self-execute order ${orderId}`);
this.stats.ordersExecuted++;
return receipt;
}

async liquidatePosition(positionId, options = {}) {
const tx = await this.routerContract.liquidatePosition(positionId, options);
const receipt = await this.handleTransaction(() => tx.wait(), `Liquidate position ${positionId}`);
this.stats.positionsLiquidated++;
return receipt;
}

async getSystemStatus() {
try {
const isSystemPaused = await this.routerContract.isSystemPaused();
let accessControlStatus = null;

if (this.hasContract('AccessControl')) {
try {
const accessControl = this.getContract('AccessControl');
accessControlStatus = !(await accessControl.emergencyStop());
} catch (error) {
this.logWarn('AccessControl check failed:', error.message);
}
}

return {
isOperational: !isSystemPaused && (accessControlStatus !== false),
systemPaused: isSystemPaused,
accessControlOk: accessControlStatus,
timestamp: new Date().toISOString()
};
} catch (error) {
this.logError('System status check failed:', error.message);
return { isOperational: false, error: error.message };
}
}

async getContractVersion(contractName) {
try {
const contract = this.getContract(contractName);
const version = await contract.version();
return version.toString();
} catch (error) {
return null;
}
}

async getSystemDiagnostics() {
const userAddress = await this.getUserAddress();
const diagnostics = {
timestamp: new Date().toISOString(),
keeper: {
address: userAddress,
ethBalance: '0',
poolBalance: '0',
tokenBalances: {}
},
contracts: {},
system: await this.getSystemStatus()
};

try {
const ethBalance = await this.context.provider.getBalance(userAddress);
diagnostics.keeper.ethBalance = this.calculateValue(ethBalance, 'formatFromWei');

const poolBalance = await this.routerContract.getBalance(userAddress, '0x0000000000000000000000000000000000000000');
diagnostics.keeper.poolBalance = this.calculateValue(poolBalance, 'formatFromWei');

const tokens = this.context.configManager.getTokens();
for (const [symbol, tokenConfig] of Object.entries(tokens)) {
const balance = await this.safeCall(() => this.routerContract.getBalance(userAddress, tokenConfig.address), '0');
const formatted = this.calculateValue(balance, 'formatFromWei');
if (parseFloat(formatted) > 0) {
diagnostics.keeper.tokenBalances[symbol] = formatted;
}
}

const contractNames = ['Router', 'Pool', 'Trading', 'Oracle'];
for (const contractName of contractNames) {
if (this.hasContract(contractName)) {
const version = await this.getContractVersion(contractName);
diagnostics.contracts[contractName] = {
address: this.context.contractManager.getContractAddress(contractName),
version: version || 'Unknown'
};
}
}
} catch (error) {
diagnostics.error = error.message;
}

return diagnostics;
}

async getAllOrders() {
const nextOrderId = await this.getNextOrderId();
const totalOrders = Number(nextOrderId) - 1;
const orders = [];

for (let orderId = 1; orderId <= totalOrders; orderId++) {
try {
const order = await this.getOrder(orderId);
orders.push(order);
} catch (error) {
this.logWarn(`Failed to get order ${orderId}:`, error.message);
}
}

return orders;
}

async getAllPositions() {
const nextPositionId = await this.getNextPositionId();
const totalPositions = Number(nextPositionId) - 1;
const positions = [];

for (let positionId = 1; positionId <= totalPositions; positionId++) {
try {
const position = await this.getPosition(positionId);
positions.push(position);
} catch (error) {
this.logWarn(`Failed to get position ${positionId}:`, error.message);
}
}

return positions;
}

async getExecutableOrders() {
const orders = await this.getAllOrders();
const executable = [];

for (const order of orders) {
if (!order.executed) {
const canExecute = await this.safeCall(() => this.shouldExecuteOrder(order.id), false);
if (canExecute) {
executable.push({
...order,
canExecute: true,
type: 'order_execution'
});
}
}
}

return executable;
}

async getLiquidatablePositions() {
const positions = await this.getAllPositions();
const liquidatable = [];

for (const position of positions) {
if (position.isOpen && position.shouldLiquidate) {
liquidatable.push({
...position,
canLiquidate: true,
type: 'position_liquidation'
});
}
}

return liquidatable;
}

async getKeeperOpportunities() {
const [executableOrders, liquidatablePositions] = await Promise.all([
this.getExecutableOrders(),
this.getLiquidatablePositions()
]);

return [
...executableOrders.map(order => ({
type: 'order_execution',
id: order.id,
description: `Execute ${order.orderType} order for ${order.tokenPair}`,
estimatedGas: '300000',
estimatedReward: this.calculateValue({amount: order.amountIn, feePercent: 0.1}, 'calculateFee')
})),
...liquidatablePositions.map(position => ({
type: 'position_liquidation',
id: position.id,
description: `Liquidate ${position.positionType} position`,
estimatedGas: '400000',
estimatedReward: this.calculateValue({amount: position.collateralAmount, feePercent: 10}, 'calculateFee')
}))
];
}

async executeKeeperCycle() {
const systemStatus = await this.getSystemStatus();
if (!systemStatus.isOperational) {
this.logWarn('System not operational, skipping cycle');
return { executed: 0, liquidated: 0, skipped: true, reason: 'System paused' };
}

const results = { executed: 0, liquidated: 0, errors: 0, details: [] };

try {
const executableOrders = await this.getExecutableOrders();
for (const order of executableOrders) {
try {
await this.selfExecuteOrder(order.id);
results.executed++;
results.details.push({ type: 'order', id: order.id, status: 'success' });
this.logInfo(`Order ${order.id} executed successfully`);
} catch (error) {
results.errors++;
results.details.push({ type: 'order', id: order.id, status: 'failed', error: error.message });
this.logError(`Order ${order.id} execution failed:`, error.message);
}
}

const liquidatablePositions = await this.getLiquidatablePositions();
for (const position of liquidatablePositions) {
try {
await this.liquidatePosition(position.id);
results.liquidated++;
results.details.push({ type: 'position', id: position.id, status: 'success' });
this.logInfo(`Position ${position.id} liquidated successfully`);
} catch (error) {
results.errors++;
results.details.push({ type: 'position', id: position.id, status: 'failed', error: error.message });
this.logError(`Position ${position.id} liquidation failed:`, error.message);
}
}
} catch (error) {
this.logError('Keeper cycle failed:', error.message);
results.errors++;
}

this.stats.lastRun = new Date().toISOString();
return results;
}

async startKeeper(config = {}) {
if (this.isRunning) {
this.logWarn('Keeper already running');
return false;
}

const defaultConfig = {
cycleInterval: 20000,
enableOrderExecution: true,
enableLiquidation: true,
enableDiagnostics: true
};

this.config = {...defaultConfig, ...config};
this.isRunning = true;

const intervalId = setInterval(async () => {
if (!this.isRunning) {
clearInterval(intervalId);
return;
}

try {
const results = await this.executeKeeperCycle();
if (results.executed > 0 || results.liquidated > 0 || results.errors > 0) {
this.logInfo(`Cycle completed: ${results.executed} orders executed, ${results.liquidated} positions liquidated, ${results.errors} errors`);
}
} catch (error) {
this.stats.errors++;
this.logError('Keeper cycle error:', error.message);
}
}, this.config.cycleInterval);

this.intervals.set('mainCycle', intervalId);
this.logInfo(`Keeper started with ${this.config.cycleInterval}ms cycle interval`);
return true;
}

stopKeeper() {
if (!this.isRunning) return false;

for (const [name, intervalId] of this.intervals) {
clearInterval(intervalId);
}
this.intervals.clear();
this.isRunning = false;
this.logInfo('Keeper stopped');
return true;
}

getKeeperStats() {
return {
...this.stats,
isRunning: this.isRunning,
activeMonitors: Array.from(this.intervals.keys()),
config: this.config
};
}

async getCurrentPrice(tokenAddress) {
return this.oracleContract.getPrice(tokenAddress);
}

formatOrderData(order) {
const tokenInSymbol = this.getTokenSymbol(order.tokenIn);
const tokenOutSymbol = this.getTokenSymbol(order.tokenOut);
const orderTypeNum = Number(order.orderType);
const orderTypeStr = orderTypeNum === 0 ? 'LIMIT' : orderTypeNum === 1 ? 'STOP_LOSS' : orderTypeNum === 2 ? 'SELF_EXEC' : 'UNKNOWN';

return {
id: order.id.toString(),
user: order.user,
tokenIn: order.tokenIn,
tokenOut: order.tokenOut,
tokenPair: `${tokenInSymbol}/${tokenOutSymbol}`,
amountIn: this.calculateValue(order.amountIn, 'formatFromWei'),
targetPrice: this.calculateValue(order.targetPrice, 'formatFromWei'),
orderType: orderTypeStr,
orderTypeNum,
direction: order.isLong ? 'LONG' : 'SHORT',
isLong: order.isLong,
executed: order.executed,
createdAt: new Date(Number(order.createdAt) * 1000).toISOString()
};
}

formatPositionData(position, currentPrice) {
const tokenSymbol = this.getTokenSymbol(position.token);
const entryPrice = this.calculateValue(position.entryPrice, 'formatFromWei');
const currentPriceFormatted = this.calculateValue(currentPrice, 'formatFromWei');
const isLong = Number(position.positionType) === 0;

const entryPriceNum = parseFloat(entryPrice);
const currentPriceNum = parseFloat(currentPriceFormatted);

let pnlPercent;
if (isLong) {
pnlPercent = ((currentPriceNum - entryPriceNum) / entryPriceNum) * 100;
} else {
pnlPercent = ((entryPriceNum - currentPriceNum) / entryPriceNum) * 100;
}

const shouldLiquidate = pnlPercent <= -80;

return {
id: position.id.toString(),
user: position.user,
token: position.token,
tokenSymbol,
collateralAmount: this.calculateValue(position.collateralAmount, 'formatFromWei'),
leverage: position.leverage.toString() + 'x',
positionType: isLong ? 'LONG' : 'SHORT',
entryPrice,
currentPrice: currentPriceFormatted,
size: this.calculateValue(position.size, 'formatFromWei'),
pnlPercent: pnlPercent.toFixed(2),
isOpen: position.isOpen,
shouldLiquidate,
createdAt: new Date(Number(position.createdAt) * 1000).toISOString()
};
}

getTokenSymbol(tokenAddress) {
try {
if (this.context.configManager.isETH(tokenAddress)) return 'ETH';
return this.context.configManager.getToken(tokenAddress).symbol;
} catch {
return 'UNKNOWN';
}
}
}

module.exports = KeeperModule;