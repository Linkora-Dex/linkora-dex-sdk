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

 async startKeeper(config = {}) {
 if (this.isRunning) {
 this.logWarn('Keeper already running');
 return false;
 }

 const defaultConfig = {
 orderCheckInterval: 30000,
 liquidationCheckInterval: 60000,
 priceUpdateInterval: 300000,
 healthCheckInterval: 120000,
 enableOrderExecution: true,
 enableLiquidation: true,
 enablePriceUpdates: false,
 enableHealthCheck: true
 };

 this.config = {...defaultConfig, ...config};
 this.isRunning = true;

 if (this.config.enableOrderExecution) {
 this.startOrderExecution();
 }

 if (this.config.enableLiquidation) {
 this.startLiquidationMonitor();
 }

 if (this.config.enablePriceUpdates) {
 this.startPriceUpdater();
 }

 if (this.config.enableHealthCheck) {
 this.startHealthMonitor();
 }

 this.logInfo('Keeper started with config:', this.config);
 return true;
 }

 stopKeeper() {
 if (!this.isRunning) return false;

 for (const [name, intervalId] of this.intervals) {
 clearInterval(intervalId);
 this.logInfo(`Stopped ${name} monitor`);
 }

 this.intervals.clear();
 this.isRunning = false;
 this.logInfo('Keeper stopped');
 return true;
 }

 startOrderExecution() {
 const intervalId = setInterval(async () => {
 try {
 await this.executeReadyOrders();
 } catch (error) {
 this.handleKeeperError('Order execution', error);
 }
 }, this.config.orderCheckInterval);

 this.intervals.set('orderExecution', intervalId);
 this.logInfo('Order execution monitor started');
 }

 async executeReadyOrders() {
 try {
 const nextOrderId = await this.routerContract.getNextOrderId();
 const totalOrders = Number(nextOrderId) - 1;

 for (let orderId = 1; orderId <= totalOrders; orderId++) {
 try {
 const order = await this.routerContract.getOrder(orderId);
 if (order.executed) continue;

 const canExecute = await this.routerContract.shouldExecuteOrder(orderId);
 if (!canExecute) continue;

 this.logInfo(`Executing order ${orderId}`);
 const tx = await this.routerContract.executeOrder(orderId, {
 gasLimit: 500000
 });

 await this.handleTransaction(() => tx.wait(), `Execute order ${orderId}`);

 this.stats.ordersExecuted++;
 this.logInfo(`Successfully executed order ${orderId}`);

 } catch (error) {
 this.logError(`Failed to execute order ${orderId}:`, error.message);
 this.stats.errors++;
 }
 }
 } catch (error) {
 this.logError('Order execution check failed:', error.message);
 }

 this.stats.lastRun = new Date().toISOString();
 }

 startLiquidationMonitor() {
 const intervalId = setInterval(async () => {
 try {
 await this.liquidatePositions();
 } catch (error) {
 this.handleKeeperError('Liquidation monitor', error);
 }
 }, this.config.liquidationCheckInterval);

 this.intervals.set('liquidationMonitor', intervalId);
 this.logInfo('Liquidation monitor started');
 }

 async liquidatePositions() {
 try {
 const nextPositionId = await this.routerContract.getNextPositionId();
 const totalPositions = Number(nextPositionId) - 1;

 for (let positionId = 1; positionId <= totalPositions; positionId++) {
 try {
 const position = await this.routerContract.getPosition(positionId);
 if (!position.isOpen) continue;

 const shouldLiquidate = await this.checkLiquidationConditions(position, positionId);
 if (!shouldLiquidate) continue;

 this.logInfo(`Liquidating position ${positionId}`);
 const tx = await this.routerContract.liquidatePosition(positionId, {
 gasLimit: 600000
 });

 await this.handleTransaction(() => tx.wait(), `Liquidate position ${positionId}`);

 this.stats.positionsLiquidated++;
 this.logInfo(`Successfully liquidated position ${positionId}`);

 } catch (error) {
 this.logError(`Failed to liquidate position ${positionId}:`, error.message);
 this.stats.errors++;
 }
 }
 } catch (error) {
 this.logError('Liquidation check failed:', error.message);
 }
 }

 async checkLiquidationConditions(position, positionId) {
 try {
 const currentPrice = await this.routerContract.getPrice(position.token);
 const entryPrice = position.entryPrice;
 const isLong = position.positionType === 0;

 let pnlPercent;
 if (isLong) {
 pnlPercent = currentPrice <= entryPrice
 ? -((entryPrice - currentPrice) * 100 / entryPrice)
 : 0;
 } else {
 pnlPercent = currentPrice >= entryPrice
 ? -((currentPrice - entryPrice) * 100 / entryPrice)
 : 0;
 }

 const shouldLiquidate = pnlPercent <= -80;

 if (shouldLiquidate) {
 this.logInfo(`Position ${positionId} liquidatable: ${pnlPercent.toFixed(2)}% PnL`);
 }

 return shouldLiquidate;
 } catch (error) {
 this.logError(`Error checking liquidation for position ${positionId}:`, error.message);
 return false;
 }
 }

 startPriceUpdater() {
 const intervalId = setInterval(async () => {
 try {
 await this.updatePrices();
 } catch (error) {
 this.handleKeeperError('Price updater', error);
 }
 }, this.config.priceUpdateInterval);

 this.intervals.set('priceUpdater', intervalId);
 this.logInfo('Price updater started');
 }

 async updatePrices() {
 try {
 const tokens = this.context.configManager.getTokens();
 const staleTokens = [];

 const ethStale = await this.oracleContract.isPriceStale('0x0000000000000000000000000000000000000000');
 if (ethStale) {
 staleTokens.push({symbol: 'ETH', address: '0x0000000000000000000000000000000000000000'});
 }

 for (const [symbol, tokenInfo] of Object.entries(tokens)) {
 if (tokenInfo.address) {
 const isStale = await this.safeCall(() => this.oracleContract.isPriceStale(tokenInfo.address), false);
 if (isStale) {
 staleTokens.push({symbol, address: tokenInfo.address});
 }
 }
 }

 if (staleTokens.length === 0) {
 this.logInfo('All prices are current');
 return;
 }

 this.logInfo(`Found ${staleTokens.length} stale prices, updating...`);

 for (const token of staleTokens) {
 try {
 const mockPrice = this.generateMockPrice(token.symbol);
 const tx = await this.routerContract.updateOraclePrice(token.address, mockPrice, {
 gasLimit: 200000
 });

 await this.handleTransaction(() => tx.wait(), `Update ${token.symbol} price`);
 this.stats.pricesUpdated++;

 } catch (error) {
 this.logError(`Failed to update ${token.symbol} price:`, error.message);
 this.stats.errors++;
 }
 }
 } catch (error) {
 this.logError('Price update check failed:', error.message);
 }
 }

 generateMockPrice(symbol) {
 const basePrices = {
 'ETH': '2500',
 'USDC': '1.00',
 'USDT': '1.00',
 'DAI': '1.00',
 'WBTC': '45000'
 };

 const basePrice = parseFloat(basePrices[symbol] || '100');
 const variation = 0.95 + (Math.random() * 0.1);
 const newPrice = (basePrice * variation).toFixed(symbol.includes('USD') ? 4 : 2);

 return this.calculateValue(newPrice, 'parseToWei');
 }

 startHealthMonitor() {
 const intervalId = setInterval(async () => {
 try {
 await this.performHealthCheck();
 } catch (error) {
 this.handleKeeperError('Health monitor', error);
 }
 }, this.config.healthCheckInterval);

 this.intervals.set('healthMonitor', intervalId);
 this.logInfo('Health monitor started');
 }

 async performHealthCheck() {
 const health = {
 timestamp: new Date().toISOString(),
 systemPaused: false,
 contracts: {},
 issues: []
 };

 try {
 health.systemPaused = await this.routerContract.isSystemPaused();
 if (health.systemPaused) {
 health.issues.push('System is paused');
 }

 health.contracts.router = await this.checkContractHealth('Router');
 health.contracts.pool = await this.checkContractHealth('Pool');
 health.contracts.trading = await this.checkContractHealth('Trading');
 health.contracts.oracle = await this.checkContractHealth('Oracle');

 const staleCount = await this.countStalePrices();
 if (staleCount > 0) {
 health.issues.push(`${staleCount} stale prices detected`);
 }

 const ethBalance = await this.getContract('Pool').ethBalance();
 if (parseFloat(this.calculateValue(ethBalance, 'formatFromWei')) < 1) {
 health.issues.push('Low ETH liquidity in pool');
 }

 if (health.issues.length === 0) {
 this.logInfo('System health check passed');
 } else {
 this.logWarn('Health issues detected:', health.issues);
 }

 } catch (error) {
 this.logError('Health check failed:', error.message);
 health.issues.push(`Health check error: ${error.message}`);
 }
 }

 async checkContractHealth(contractName) {
 try {
 const contract = this.getContract(contractName);
 await contract.version();
 return {status: 'healthy', error: null};
 } catch (error) {
 return {status: 'error', error: error.message};
 }
 }

 async countStalePrices() {
 try {
 const tokens = this.context.configManager.getTokens();
 let staleCount = 0;

 const ethStale = await this.oracleContract.isPriceStale('0x0000000000000000000000000000000000000000');
 if (ethStale) staleCount++;

 for (const [, tokenInfo] of Object.entries(tokens)) {
 if (tokenInfo.address) {
 const isStale = await this.safeCall(() => this.oracleContract.isPriceStale(tokenInfo.address), false);
 if (isStale) staleCount++;
 }
 }

 return staleCount;
 } catch (error) {
 this.logError('Failed to count stale prices:', error.message);
 return 0;
 }
 }

 async getKeeperOpportunities() {
 const opportunities = [];

 try {
 const nextOrderId = await this.routerContract.getNextOrderId();
 const totalOrders = Number(nextOrderId) - 1;

 for (let orderId = 1; orderId <= totalOrders; orderId++) {
 const order = await this.safeCall(() => this.routerContract.getOrder(orderId), null);
 if (!order || order.executed) continue;

 const canExecute = await this.safeCall(() => this.routerContract.shouldExecuteOrder(orderId), false);
 if (canExecute) {
 opportunities.push({
 type: 'order_execution',
 id: orderId,
 description: `Execute order ${orderId}`,
 estimatedGas: '300000',
 estimatedReward: this.calculateValue({amount: '0.001', feePercent: 0}, 'parseToWei')
 });
 }
 }

 const liquidatable = await this.findLiquidatablePositions();
 opportunities.push(...liquidatable.map(pos => ({
 type: 'position_liquidation',
 id: pos.positionId,
 description: `Liquidate position ${pos.positionId}`,
 estimatedGas: '400000',
 estimatedReward: this.calculateValue({amount: pos.reward || '0.01', feePercent: 0}, 'parseToWei')
 })));

 } catch (error) {
 this.logError('Failed to get keeper opportunities:', error.message);
 }

 return opportunities;
 }

 async findLiquidatablePositions() {
 const liquidatable = [];

 try {
 const nextPositionId = await this.routerContract.getNextPositionId();
 const totalPositions = Number(nextPositionId) - 1;

 for (let positionId = 1; positionId <= totalPositions && liquidatable.length < 10; positionId++) {
 const position = await this.safeCall(() => this.routerContract.getPosition(positionId), null);
 if (position && position.isOpen) {
 const shouldLiquidate = await this.checkLiquidationConditions(position, positionId);
 if (shouldLiquidate) {
 liquidatable.push({
 positionId,
 user: position.user,
 reward: this.calculateValue(position.collateralAmount, 'formatFromWei') * 0.1
 });
 }
 }
 }
 } catch (error) {
 this.logError('Failed to find liquidatable positions:', error.message);
 }

 return liquidatable;
 }

 handleKeeperError(operation, error) {
 this.stats.errors++;
 this.logError(`Keeper ${operation} error:`, error.message);

 if (this.stats.errors > 10) {
 this.logError('Too many keeper errors, consider stopping');
 }
 }

 getKeeperStats() {
 return {
 ...this.stats,
 isRunning: this.isRunning,
 activeMonitors: Array.from(this.intervals.keys()),
 uptime: this.isRunning ? Date.now() - (this.startTime || Date.now()) : 0,
 config: this.config
 };
 }

 async estimateKeeperProfitability() {
 const opportunities = await this.getKeeperOpportunities();
 const gasPrice = await this.context.provider.getGasPrice();

 let totalReward = 0;
 let totalGasCost = 0;

 for (const opp of opportunities) {
 totalReward += parseFloat(this.calculateValue(opp.estimatedReward, 'formatFromWei'));
 totalGasCost += (parseFloat(opp.estimatedGas) * parseFloat(gasPrice.toString())) / 1e18;
 }

 const netProfit = totalReward - totalGasCost;
 const roi = totalGasCost > 0 ? (netProfit / totalGasCost * 100) : 0;

 return {
 opportunities: opportunities.length,
 totalRewardETH: totalReward.toFixed(6),
 totalGasCostETH: totalGasCost.toFixed(6),
 netProfitETH: netProfit.toFixed(6),
 roi: roi.toFixed(2) + '%',
 profitable: netProfit > 0
 };
 }

 async executeKeeperBatch(maxOperations = 5) {
 if (!this.isRunning) {
 throw this.createError('Keeper not running');
 }

 const opportunities = await this.getKeeperOpportunities();
 const batch = opportunities.slice(0, maxOperations);
 const results = [];

 for (const opp of batch) {
 try {
 let result;

 if (opp.type === 'order_execution') {
 const tx = await this.routerContract.executeOrder(opp.id);
 result = await this.handleTransaction(() => tx.wait(), `Execute order ${opp.id}`);
 this.stats.ordersExecuted++;

 } else if (opp.type === 'position_liquidation') {
 const tx = await this.routerContract.liquidatePosition(opp.id);
 result = await this.handleTransaction(() => tx.wait(), `Liquidate position ${opp.id}`);
 this.stats.positionsLiquidated++;
 }

 results.push({
 ...opp,
 status: 'success',
 transactionHash: result?.hash,
 gasUsed: result?.gasUsed?.toString()
 });

 } catch (error) {
 this.stats.errors++;
 results.push({
 ...opp,
 status: 'failed',
 error: error.message
 });
 }
 }

 return {
 executed: results.length,
 successful: results.filter(r => r.status === 'success').length,
 failed: results.filter(r => r.status === 'failed').length,
 results
 };
 }
}

module.exports = KeeperModule;