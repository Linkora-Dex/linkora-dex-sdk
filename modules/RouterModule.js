const BaseModule = require('./BaseModule');

class RouterModule extends BaseModule {
    constructor() {
        super('RouterModule', '1.0.0');
        this.routerContract = null;
    }

    initialize(context) {
        super.initialize(context);
        this.routerContract = this.getContract('Router');
    }

    async depositETH(amount, options = {}) {
        this.validateParams({amount}, params => params.amount && parseFloat(params.amount) > 0);

        const tx = await this.routerContract.depositETH({
            value: this.calculateValue(amount, 'parseToWei'),
            ...options
        });

        return this.handleTransaction(
            () => tx.wait(),
            `Deposit ${amount} ETH`
        );
    }

    async depositToken(tokenAddress, amount, options = {}) {
        const validation = this.validateParams({tokenAddress, amount}, 'validateSwapParams');
        if (!validation.isValid) throw this.createError(`Invalid params: ${validation.errors.join(', ')}`);

        const tokenContract = await this.context.contractManager.loadContract('ERC20', tokenAddress, [
            'function approve(address,uint256) returns (bool)',
            'function allowance(address,address) view returns (uint256)'
        ]);

        const amountWei = this.calculateValue(amount, 'parseToWei');
        const userAddress = await this.getUserAddress();

        const allowance = await tokenContract.allowance(userAddress, this.routerContract.target);
        if (allowance < amountWei) {
            const approveTx = await tokenContract.approve(this.routerContract.target, amountWei);
            await approveTx.wait();
            this.logInfo(`Approved ${amount} tokens`);
        }

        const tx = await this.routerContract.depositToken(tokenAddress, amountWei, options);
        return this.handleTransaction(() => tx.wait(), `Deposit ${amount} tokens`);
    }

    async withdrawETH(amount, options = {}) {
        const amountWei = this.calculateValue(amount, 'parseToWei');
        const tx = await this.routerContract.withdrawETH(amountWei, options);
        return this.handleTransaction(() => tx.wait(), `Withdraw ${amount} ETH`);
    }

    async withdrawToken(tokenAddress, amount, options = {}) {
        const amountWei = this.calculateValue(amount, 'parseToWei');
        const tx = await this.routerContract.withdrawToken(tokenAddress, amountWei, options);
        return this.handleTransaction(() => tx.wait(), `Withdraw ${amount} tokens`);
    }

    async swapTokens(tokenIn, tokenOut, amountIn, slippage = 0.5, options = {}) {
        const validation = this.validateParams({tokenIn, tokenOut, amountIn, slippage}, 'validateSwapParams');
        if (!validation.isValid) throw this.createError(`Invalid swap params: ${validation.errors.join(', ')}`);

        const amountInWei = this.calculateValue(amountIn, 'parseToWei');
        const amountOutMin = await this.calculateMinAmountOut(tokenIn, tokenOut, amountInWei, slippage);

        const isETHInput = this.context.configManager.isETH(tokenIn);
        const txOptions = isETHInput ? {value: amountInWei, ...options} : options;

        const tx = await this.routerContract.swapTokens(tokenIn, tokenOut, amountInWei, amountOutMin, txOptions);
        return this.handleTransaction(() => tx.wait(), `Swap ${amountIn} tokens`);
    }

    async createLimitOrder(tokenIn, tokenOut, amountIn, targetPrice, isLong = true, options = {}) {
        const amountInWei = this.calculateValue(amountIn, 'parseToWei');
        const targetPriceWei = this.calculateValue(targetPrice, 'parseToWei');
        const minAmountOut = await this.calculateMinAmountOut(tokenIn, tokenOut, amountInWei, 5);

        const isETHInput = this.context.configManager.isETH(tokenIn);
        const txOptions = isETHInput ? {value: amountInWei, ...options} : options;

        const tx = await this.routerContract.createLimitOrder(
            tokenIn, tokenOut, amountInWei, targetPriceWei, minAmountOut, isLong, txOptions
        );
        return this.handleTransaction(() => tx.wait(), 'Create limit order');
    }

    async createStopLossOrder(tokenIn, tokenOut, amountIn, stopPrice, options = {}) {
        const amountInWei = this.calculateValue(amountIn, 'parseToWei');
        const stopPriceWei = this.calculateValue(stopPrice, 'parseToWei');
        const minAmountOut = await this.calculateMinAmountOut(tokenIn, tokenOut, amountInWei, 10);

        const isETHInput = this.context.configManager.isETH(tokenIn);
        const txOptions = isETHInput ? {value: amountInWei, ...options} : options;

        const tx = await this.routerContract.createStopLossOrder(
            tokenIn, tokenOut, amountInWei, stopPriceWei, minAmountOut, txOptions
        );
        return this.handleTransaction(() => tx.wait(), 'Create stop-loss order');
    }

    async openPosition(token, collateralAmount, leverage, isLong, options = {}) {
        const collateralWei = this.calculateValue(collateralAmount, 'parseToWei');
        const tx = await this.routerContract.openPosition(token, collateralWei, leverage, isLong, {
            value: collateralWei, ...options
        });
        return this.handleTransaction(() => tx.wait(), `Open ${isLong ? 'long' : 'short'} position`);
    }

    async closePosition(positionId, options = {}) {
        const tx = await this.routerContract.closePosition(positionId, options);
        return this.handleTransaction(() => tx.wait(), `Close position ${positionId}`);
    }

    async cancelOrder(orderId, options = {}) {
        const tx = await this.routerContract.cancelOrder(orderId, options);
        return this.handleTransaction(() => tx.wait(), `Cancel order ${orderId}`);
    }

    async executeOrder(orderId, options = {}) {
        const tx = await this.routerContract.executeOrder(orderId, options);
        return this.handleTransaction(() => tx.wait(), `Execute order ${orderId}`);
    }

    async selfExecuteOrder(orderId, options = {}) {
        const tx = await this.routerContract.selfExecuteOrder(orderId, options);
        return this.handleTransaction(() => tx.wait(), `Self-execute order ${orderId}`);
    }

    async liquidatePosition(positionId, options = {}) {
        const tx = await this.routerContract.liquidatePosition(positionId, options);
        return this.handleTransaction(() => tx.wait(), `Liquidate position ${positionId}`);
    }

    async getBalance(userAddress, tokenAddress) {
        const address = userAddress || await this.getUserAddress();
        return this.routerContract.getBalance(address, tokenAddress);
    }

    async getAvailableBalance(userAddress, tokenAddress) {
        const address = userAddress || await this.getUserAddress();
        return this.routerContract.getAvailableBalance(address, tokenAddress);
    }

    async getPrice(tokenAddress) {
        return this.routerContract.getPrice(tokenAddress);
    }

    async getAmountOut(amountIn, tokenIn, tokenOut) {
        const amountInWei = this.calculateValue(amountIn, 'parseToWei');
        return this.routerContract.getAmountOut(amountInWei, tokenIn, tokenOut);
    }

    async calculateMinAmountOut(tokenIn, tokenOut, amountIn, slippagePercent) {
        const amountOut = await this.getAmountOut(amountIn, tokenIn, tokenOut);
        return this.calculateValue({amount: amountOut, slippage: slippagePercent, isMinimum: true}, 'applySlippage');
    }

    async getUserOrders(userAddress) {
        const address = userAddress || await this.getUserAddress();
        const orderIds = await this.routerContract.getUserOrders(address);

        const orders = [];
        for (const orderId of orderIds) {
            const order = await this.routerContract.getOrder(orderId);
            orders.push(this.formatResult(order, 'formatOrderInfo'));
        }
        return orders;
    }

    async getUserPositions(userAddress) {
        const address = userAddress || await this.getUserAddress();
        const positionIds = await this.routerContract.getUserPositions(address);

        const positions = [];
        for (const positionId of positionIds) {
            const position = await this.routerContract.getPosition(positionId);
            positions.push(this.formatResult(position, 'formatPositionInfo'));
        }
        return positions;
    }

    async getSystemInfo() {
        const [poolAddress, tradingAddress, oracleAddress, governanceAddress] = await Promise.all([
            this.routerContract.getPoolAddress(),
            this.routerContract.getTradingAddress(),
            this.routerContract.getOracleAddress(),
            this.routerContract.getGovernanceTokenAddress()
        ]);

        return {
            poolAddress,
            tradingAddress,
            oracleAddress,
            governanceAddress,
            isSystemPaused: await this.routerContract.isSystemPaused()
        };
    }

    async getUserTokenomicsInfo(userAddress) {
        const address = userAddress || await this.getUserAddress();
        return this.routerContract.getUserTokenomicsInfo(address);
    }

    async getTokenomicsStats() {
        return this.routerContract.getTokenomicsStats();
    }

    async claimLPFees(tokenAddress, options = {}) {
        const tx = await this.routerContract.claimLPFees(tokenAddress, options);
        return this.handleTransaction(() => tx.wait(), `Claim LP fees for ${tokenAddress}`);
    }

    async getClaimableLPFees(userAddress, tokenAddress) {
        const address = userAddress || await this.getUserAddress();
        return this.routerContract.getClaimableLPFees(address, tokenAddress);
    }

    async updateOraclePrice(tokenAddress, price, options = {}) {
        const priceWei = this.calculateValue(price, 'parseToWei');
        const tx = await this.routerContract.updateOraclePrice(tokenAddress, priceWei, options);
        return this.handleTransaction(() => tx.wait(), `Update price for ${tokenAddress}`);
    }

    async batchUpdateOraclePrices(tokenAddresses, prices, options = {}) {
        const pricesWei = prices.map(price => this.calculateValue(price, 'parseToWei'));
        const tx = await this.routerContract.batchUpdateOraclePrices(tokenAddresses, pricesWei, options);
        return this.handleTransaction(() => tx.wait(), 'Batch update oracle prices');
    }

    async shouldExecuteOrder(orderId) {
        return this.routerContract.shouldExecuteOrder(orderId);
    }

    async canExecuteOrder(orderId) {
        return this.routerContract.canExecuteOrder(orderId);
    }

    async getExecutableOrders() {
        const nextOrderId = await this.routerContract.getNextOrderId();
        const executableOrders = [];

        for (let i = 1; i < nextOrderId; i++) {
            const canExecute = await this.safeCall(() => this.shouldExecuteOrder(i), false);
            if (canExecute) {
                const order = await this.safeCall(() => this.routerContract.getOrder(i), null);
                if (order && !order.executed) {
                    executableOrders.push({orderId: i, order});
                }
            }
        }

        return executableOrders;
    }
}

module.exports = RouterModule;