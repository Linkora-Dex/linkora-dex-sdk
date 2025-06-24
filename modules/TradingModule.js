const BaseModule = require('./BaseModule');

class TradingModule extends BaseModule {
    constructor() {
        super('TradingModule', '1.0.0');
        this.tradingContract = null;
        this.oracleContract = null;
    }

    initialize(context) {
        super.initialize(context);
        this.tradingContract = this.getContract('Trading');
        this.oracleContract = this.getContract('Oracle');
    }

    async createLimitOrder(tokenIn, tokenOut, amountIn, targetPrice, isLong = true, options = {}) {
        const validation = this.validateParams({tokenIn, tokenOut, amountIn}, 'validateSwapParams');
        if (!validation.isValid) throw this.createError(`Invalid order: ${validation.errors.join(', ')}`);

        const amountInWei = this.calculateValue(amountIn, 'parseToWei');
        const targetPriceWei = this.calculateValue(targetPrice, 'parseToWei');
        const userAddress = await this.getUserAddress();

        const tx = await this.tradingContract.createLimitOrder(
            userAddress, tokenIn, tokenOut, amountInWei, targetPriceWei, 0, isLong, options
        );

        const receipt = await this.handleTransaction(() => tx.wait(), 'Create limit order');
        const orderId = this.extractEventData(receipt, 'OrderCreated', 'orderId');

        this.logInfo(`Created limit order ${orderId}: ${amountIn} ${this.getTokenSymbol(tokenIn)} at ${targetPrice}`);
        return orderId;
    }

    async createStopLossOrder(tokenIn, tokenOut, amountIn, stopPrice, options = {}) {
        const validation = this.validateParams({tokenIn, tokenOut, amountIn}, 'validateSwapParams');
        if (!validation.isValid) throw this.createError(`Invalid stop-loss: ${validation.errors.join(', ')}`);

        const amountInWei = this.calculateValue(amountIn, 'parseToWei');
        const stopPriceWei = this.calculateValue(stopPrice, 'parseToWei');
        const userAddress = await this.getUserAddress();

        const tx = await this.tradingContract.createStopLossOrder(
            userAddress, tokenIn, tokenOut, amountInWei, stopPriceWei, 0, options
        );

        const receipt = await this.handleTransaction(() => tx.wait(), 'Create stop-loss order');
        const orderId = this.extractEventData(receipt, 'OrderCreated', 'orderId');

        this.logInfo(`Created stop-loss ${orderId}: ${amountIn} ${this.getTokenSymbol(tokenIn)} at ${stopPrice}`);
        return orderId;
    }

    async openPosition(token, collateralAmount, leverage, isLong, options = {}) {
        if (leverage < 1 || leverage > 100) throw this.createError('Leverage must be between 1 and 100');

        const collateralWei = this.calculateValue(collateralAmount, 'parseToWei');
        const userAddress = await this.getUserAddress();

        const tx = await this.tradingContract.openPosition(
            userAddress, token, collateralWei, leverage, isLong, options
        );

        const receipt = await this.handleTransaction(() => tx.wait(), `Open ${isLong ? 'long' : 'short'} position`);
        const positionId = this.extractEventData(receipt, 'PositionOpened', 'positionId');

        this.logInfo(`Opened position ${positionId}: ${collateralAmount} collateral, ${leverage}x leverage`);
        return positionId;
    }

    async closePosition(positionId, options = {}) {
        const userAddress = await this.getUserAddress();
        const tx = await this.tradingContract.closePosition(userAddress, positionId, options);

        const receipt = await this.handleTransaction(() => tx.wait(), `Close position ${positionId}`);
        const pnl = this.extractEventData(receipt, 'PositionClosed', 'pnl');

        this.logInfo(`Closed position ${positionId} with PnL: ${pnl}`);
        return {positionId, pnl};
    }

    async cancelOrder(orderId, options = {}) {
        const userAddress = await this.getUserAddress();
        const tx = await this.tradingContract.cancelOrder(userAddress, orderId, options);

        await this.handleTransaction(() => tx.wait(), `Cancel order ${orderId}`);
        this.logInfo(`Cancelled order ${orderId}`);
        return true;
    }

    async modifyOrder(orderId, newTargetPrice, newMinAmountOut, options = {}) {
        const targetPriceWei = this.calculateValue(newTargetPrice, 'parseToWei');
        const minAmountOutWei = newMinAmountOut ? this.calculateValue(newMinAmountOut, 'parseToWei') : 0;
        const userAddress = await this.getUserAddress();

        const tx = await this.tradingContract.modifyOrder(
            userAddress, orderId, targetPriceWei, minAmountOutWei, options
        );

        await this.handleTransaction(() => tx.wait(), `Modify order ${orderId}`);
        this.logInfo(`Modified order ${orderId}: new price ${newTargetPrice}`);
        return true;
    }

    async executeOrder(orderId, options = {}) {
        const tx = await this.tradingContract.executeOrder(orderId, options);

        const receipt = await this.handleTransaction(() => tx.wait(), `Execute order ${orderId}`);
        const amountOut = this.extractEventData(receipt, 'OrderExecuted', 'amountOut');

        this.logInfo(`Executed order ${orderId}, output: ${amountOut}`);
        return {orderId, amountOut};
    }

    async selfExecuteOrder(orderId, options = {}) {
        const userAddress = await this.getUserAddress();
        const tx = await this.tradingContract.selfExecuteOrder(userAddress, orderId, options);

        const receipt = await this.handleTransaction(() => tx.wait(), `Self-execute order ${orderId}`);
        const amountOut = this.extractEventData(receipt, 'OrderExecuted', 'amountOut');

        this.logInfo(`Self-executed order ${orderId}, output: ${amountOut}`);
        return {orderId, amountOut};
    }

    async liquidatePosition(positionId, options = {}) {
        const tx = await this.tradingContract.liquidatePosition(positionId, options);

        const receipt = await this.handleTransaction(() => tx.wait(), `Liquidate position ${positionId}`);
        const reward = this.extractEventData(receipt, 'PositionLiquidated', 'reward');

        this.logInfo(`Liquidated position ${positionId}, reward: ${reward}`);
        return {positionId, reward};
    }

    async getOrder(orderId) {
        const order = await this.tradingContract.getOrder(orderId);
        return this.formatOrderData(order);
    }

    async getPosition(positionId) {
        const position = await this.tradingContract.getPosition(positionId);
        const currentPrice = await this.getCurrentPrice(position.token);

        return this.formatPositionData(position, currentPrice);
    }

    async getUserOrders(userAddress) {
        const address = userAddress || await this.getUserAddress();
        const orderIds = await this.tradingContract.getUserOrders(address);

        const orders = [];
        for (const orderId of orderIds) {
            const order = await this.safeCall(() => this.getOrder(orderId), null);
            if (order && !order.executed) {
                orders.push(order);
            }
        }

        return orders;
    }

    async getUserPositions(userAddress) {
        const address = userAddress || await this.getUserAddress();
        const positionIds = await this.tradingContract.getUserPositions(address);

        const positions = [];
        for (const positionId of positionIds) {
            const position = await this.safeCall(() => this.getPosition(positionId), null);
            if (position && position.isOpen) {
                positions.push(position);
            }
        }

        return positions;
    }

    async shouldExecuteOrder(orderId) {
        return this.tradingContract.shouldExecuteOrder(orderId);
    }

    async canExecuteOrder(orderId) {
        return this.tradingContract.canExecuteOrder(orderId);
    }

    async getCurrentPrice(tokenAddress) {
        if (this.context.configManager.isETH(tokenAddress)) {
            return this.calculateValue('1', 'parseToWei'); // ETH = 1 ETH
        }
        return this.oracleContract.getPrice(tokenAddress);
    }

    async calculateMinAmountOut(tokenIn, tokenOut, amountIn) {
        return this.tradingContract.calculateMinAmountOut(tokenIn, tokenOut, amountIn);
    }

    async getExecutableOrders() {
        const nextOrderId = await this.tradingContract.nextOrderId();
        const executableOrders = [];

        for (let i = 1; i < nextOrderId; i++) {
            const canExecute = await this.safeCall(() => this.shouldExecuteOrder(i), false);
            if (canExecute) {
                const order = await this.safeCall(() => this.getOrder(i), null);
                if (order && !order.executed) {
                    executableOrders.push({
                        orderId: i,
                        type: 'order_execution',
                        description: `Execute ${order.orderType} order for ${order.tokenPair}`,
                        reward: this.calculateValue({amount: order.amountIn, feePercent: 0.1}, 'calculateFee'),
                        canExecute: true
                    });
                }
            }
        }

        return executableOrders;
    }

    async getLiquidatablePositions() {
        const nextPositionId = await this.tradingContract.nextPositionId();
        const liquidatablePositions = [];

        for (let i = 1; i < nextPositionId; i++) {
            const position = await this.safeCall(() => this.getPosition(i), null);
            if (position && position.isOpen && position.shouldLiquidate) {
                liquidatablePositions.push({
                    positionId: i,
                    type: 'position_liquidation',
                    description: `Liquidate ${position.positionType} position`,
                    reward: this.calculateValue({amount: position.collateralAmount, feePercent: 10}, 'calculateFee'),
                    canExecute: true
                });
            }
        }

        return liquidatablePositions;
    }

    async getTradingStats(userAddress) {
        const address = userAddress || await this.getUserAddress();
        const [orders, positions] = await Promise.all([
            this.getUserOrders(address),
            this.getUserPositions(address)
        ]);

        const totalOrders = orders.length;
        const totalPositions = positions.length;
        const totalVolume = orders.reduce((sum, order) => sum + parseFloat(order.amountIn), 0);
        const totalPnL = positions.reduce((sum, pos) => sum + parseFloat(pos.pnl || 0), 0);

        return {
            activeOrders: totalOrders,
            activePositions: totalPositions,
            totalVolume: totalVolume.toFixed(6),
            totalPnL: totalPnL.toFixed(6),
            avgPositionSize: totalPositions > 0 ? (totalVolume / totalPositions).toFixed(6) : '0'
        };
    }

    formatOrderData(order) {
        const tokenInSymbol = this.getTokenSymbol(order.tokenIn);
        const tokenOutSymbol = this.getTokenSymbol(order.tokenOut);

        return {
            id: order.id.toString(),
            user: order.user,
            tokenIn: order.tokenIn,
            tokenOut: order.tokenOut,
            tokenPair: `${tokenInSymbol}/${tokenOutSymbol}`,
            amountIn: this.calculateValue(order.amountIn, 'formatFromWei'),
            targetPrice: this.calculateValue(order.targetPrice, 'formatFromWei'),
            orderType: order.orderType === 0 ? 'LIMIT' : 'STOP_LOSS',
            direction: order.isLong ? 'LONG' : 'SHORT',
            executed: order.executed,
            createdAt: new Date(order.createdAt * 1000).toISOString()
        };
    }

    formatPositionData(position, currentPrice) {
        const tokenSymbol = this.getTokenSymbol(position.token);
        const entryPrice = this.calculateValue(position.entryPrice, 'formatFromWei');
        const currentPriceFormatted = this.calculateValue(currentPrice, 'formatFromWei');

        const pnl = this.calculateValue({
            entryPrice,
            currentPrice: currentPriceFormatted,
            positionSize: position.size,
            isLong: position.positionType === 0
        }, 'calculatePositionPnL');

        const shouldLiquidate = Math.abs(parseFloat(pnl.pnlPercent)) >= 80;

        return {
            id: position.id.toString(),
            user: position.user,
            token: position.token,
            tokenSymbol,
            collateralAmount: this.calculateValue(position.collateralAmount, 'formatFromWei'),
            leverage: position.leverage.toString() + 'x',
            positionType: position.positionType === 0 ? 'LONG' : 'SHORT',
            entryPrice,
            currentPrice: currentPriceFormatted,
            size: this.calculateValue(position.size, 'formatFromWei'),
            pnl: pnl.pnl,
            pnlPercent: pnl.pnlPercent + '%',
            isOpen: position.isOpen,
            shouldLiquidate,
            createdAt: new Date(position.createdAt * 1000).toISOString()
        };
    }

    getTokenSymbol(tokenAddress) {
        try {
            return this.context.configManager.getToken(tokenAddress).symbol;
        } catch {
            return this.context.configManager.isETH(tokenAddress) ? 'ETH' : 'UNKNOWN';
        }
    }

    extractEventData(receipt, eventName, dataField) {
        const event = receipt.logs.find(log => log.fragment?.name === eventName);
        return event?.args?.[dataField] || null;
    }
}

module.exports = TradingModule;