const BaseModule = require('./BaseModule');

class PoolModule extends BaseModule {
    constructor() {
        super('PoolModule', '1.0.0');
        this.poolContract = null;
    }

    initialize(context) {
        super.initialize(context);
        this.poolContract = this.getContract('Pool');
    }

    async depositETH(amount, options = {}) {
        const amountWei = this.calculateValue(amount, 'parseToWei');
        const tx = await this.poolContract.depositETH({value: amountWei, ...options});
        return this.handleTransaction(() => tx.wait(), `Deposit ${amount} ETH to pool`);
    }

    async depositToken(tokenAddress, amount, options = {}) {
        const validation = this.validateParams({tokenAddress, amount}, 'validateTokenParams');
        if (!validation.isValid) throw this.createError(`Invalid params: ${validation.errors.join(', ')}`);

        const tokenContract = await this.context.contractManager.loadContract('ERC20', tokenAddress, [
            'function approve(address,uint256) returns (bool)',
            'function allowance(address,address) view returns (uint256)'
        ]);

        const amountWei = this.calculateValue(amount, 'parseToWei');
        const userAddress = await this.getUserAddress();

        const allowance = await tokenContract.allowance(userAddress, this.poolContract.target);
        if (allowance < amountWei) {
            const approveTx = await tokenContract.approve(this.poolContract.target, amountWei);
            await approveTx.wait();
            this.logInfo(`Approved ${amount} tokens for pool`);
        }

        const tx = await this.poolContract.depositToken(tokenAddress, amountWei, options);
        return this.handleTransaction(() => tx.wait(), `Deposit ${amount} tokens to pool`);
    }

    async withdrawETH(amount, options = {}) {
        const amountWei = this.calculateValue(amount, 'parseToWei');
        const tx = await this.poolContract.withdrawETH(amountWei, options);
        return this.handleTransaction(() => tx.wait(), `Withdraw ${amount} ETH from pool`);
    }

    async withdrawToken(tokenAddress, amount, options = {}) {
        const amountWei = this.calculateValue(amount, 'parseToWei');
        const tx = await this.poolContract.withdrawToken(tokenAddress, amountWei, options);
        return this.handleTransaction(() => tx.wait(), `Withdraw ${amount} tokens from pool`);
    }

    async swapTokens(tokenIn, tokenOut, amountIn, slippage = 0.5, options = {}) {
        const validation = this.validateParams({tokenIn, tokenOut, amountIn, slippage}, 'validateSwapParams');
        if (!validation.isValid) throw this.createError(`Invalid swap: ${validation.errors.join(', ')}`);

        const amountInWei = this.calculateValue(amountIn, 'parseToWei');
        const minAmountOut = await this.calculateMinAmountOut(tokenIn, tokenOut, amountInWei, slippage);

        const userAddress = await this.getUserAddress();
        const tx = await this.poolContract.swapTokens(userAddress, tokenIn, tokenOut, amountInWei, minAmountOut, options);
        return this.handleTransaction(() => tx.wait(), `Swap ${amountIn} tokens`);
    }

    async addLiquidity(tokenA, tokenB, amountA, amountB, slippage = 1, options = {}) {
        const amountAWei = this.calculateValue(amountA, 'parseToWei');
        const amountBWei = this.calculateValue(amountB, 'parseToWei');

        const amountAMin = this.calculateValue({amount: amountA, slippage, isMinimum: true}, 'applySlippage');
        const amountBMin = this.calculateValue({amount: amountB, slippage, isMinimum: true}, 'applySlippage');

        const amountAMinWei = this.calculateValue(amountAMin, 'parseToWei');
        const amountBMinWei = this.calculateValue(amountBMin, 'parseToWei');

        const tx = await this.poolContract.addLiquidity(
            tokenA, tokenB, amountAWei, amountBWei, amountAMinWei, amountBMinWei, options
        );
        return this.handleTransaction(() => tx.wait(), `Add liquidity ${amountA}/${amountB}`);
    }

    async removeLiquidity(tokenA, tokenB, liquidity, slippage = 1, options = {}) {
        const liquidityWei = this.calculateValue(liquidity, 'parseToWei');

        const amountAMin = this.calculateValue({amount: 1, slippage, isMinimum: true}, 'applySlippage');
        const amountBMin = this.calculateValue({amount: 1, slippage, isMinimum: true}, 'applySlippage');

        const amountAMinWei = this.calculateValue(amountAMin, 'parseToWei');
        const amountBMinWei = this.calculateValue(amountBMin, 'parseToWei');

        const tx = await this.poolContract.removeLiquidity(
            tokenA, tokenB, liquidityWei, amountAMinWei, amountBMinWei, options
        );
        return this.handleTransaction(() => tx.wait(), `Remove liquidity ${liquidity}`);
    }

    async getBalance(userAddress, tokenAddress) {
        const address = userAddress || await this.getUserAddress();
        const balance = await this.poolContract.getBalance(address, tokenAddress);
        return this.formatResult(balance, (result, formatter) =>
            formatter.formatToken(result, tokenAddress)
        );
    }

    async getAvailableBalance(userAddress, tokenAddress) {
        const address = userAddress || await this.getUserAddress();
        const balance = await this.poolContract.getAvailableBalance(address, tokenAddress);
        return this.formatResult(balance, (result, formatter) =>
            formatter.formatToken(result, tokenAddress)
        );
    }

    async getUserBalances(userAddress) {
        const address = userAddress || await this.getUserAddress();
        const tokens = this.context.configManager.getTokens();
        const balances = [];

        const ethBalance = await this.getBalance(address, '0x0000000000000000000000000000000000000000');
        balances.push({
            symbol: 'ETH',
            address: '0x0000000000000000000000000000000000000000',
            balance: ethBalance,
            available: await this.getAvailableBalance(address, '0x0000000000000000000000000000000000000000')
        });

        for (const [symbol, tokenInfo] of Object.entries(tokens)) {
            if (tokenInfo.address) {
                const balance = await this.safeCall(() => this.getBalance(address, tokenInfo.address), '0');
                const available = await this.safeCall(() => this.getAvailableBalance(address, tokenInfo.address), '0');

                balances.push({
                    symbol,
                    address: tokenInfo.address,
                    balance,
                    available
                });
            }
        }

        return balances;
    }

    async getAmountOut(amountIn, tokenIn, tokenOut) {
        const amountInWei = this.calculateValue(amountIn, 'parseToWei');
        const amountOut = await this.poolContract.getAmountOut(amountInWei, tokenIn, tokenOut);
        return this.formatResult(amountOut, (result, formatter) =>
            formatter.formatToken(result, tokenOut)
        );
    }

    async calculateMinAmountOut(tokenIn, tokenOut, amountIn, slippagePercent) {
        const amountOut = await this.poolContract.getAmountOut(amountIn, tokenIn, tokenOut);
        return this.calculateValue({amount: amountOut, slippage: slippagePercent, isMinimum: true}, 'applySlippage');
    }

    async getPoolReserves(tokenA, tokenB) {
        const [reserveA, reserveB] = await Promise.all([
            this.poolContract.totalTokenBalances(tokenA),
            this.poolContract.totalTokenBalances(tokenB)
        ]);

        return {
            reserveA: this.formatResult(reserveA, (result, formatter) => formatter.formatToken(result, tokenA)),
            reserveB: this.formatResult(reserveB, (result, formatter) => formatter.formatToken(result, tokenB)),
            tokenA,
            tokenB
        };
    }

    async getETHBalance() {
        const ethBalance = await this.poolContract.ethBalance();
        return this.formatResult(ethBalance, (result, formatter) => formatter.formatToken(result, '0x0000000000000000000000000000000000000000'));
    }

    async claimFees(tokenAddress, options = {}) {
        const tx = await this.poolContract.claimFees(tokenAddress, options);
        return this.handleTransaction(() => tx.wait(), `Claim fees for ${tokenAddress}`);
    }

    async getClaimableFees(userAddress, tokenAddress) {
        const address = userAddress || await this.getUserAddress();
        const fees = await this.poolContract.getClaimableFees(address, tokenAddress);
        return this.formatResult(fees, (result, formatter) => formatter.formatToken(result, tokenAddress));
    }

    async getLiquidityStats(tokenAddress) {
        const stats = await this.poolContract.getLiquidityStats(tokenAddress);
        return {
            totalContributions: this.formatResult(stats.totalContributions, (result, formatter) =>
                formatter.formatToken(result, tokenAddress)
            ),
            totalFeesAccumulated: this.formatResult(stats.totalFeesAcc, (result, formatter) =>
                formatter.formatToken(result, tokenAddress)
            ),
            totalFeesClaimed: this.formatResult(stats.totalFeesCla, (result, formatter) =>
                formatter.formatToken(result, tokenAddress)
            ),
            availableFees: this.formatResult(stats.availableFees, (result, formatter) =>
                formatter.formatToken(result, tokenAddress)
            )
        };
    }

    async getUserLiquidityInfo(userAddress, tokenAddress) {
        const address = userAddress || await this.getUserAddress();
        const info = await this.poolContract.getUserLiquidityInfo(address, tokenAddress);

        return {
            contribution: this.formatResult(info.contribution, (result, formatter) =>
                formatter.formatToken(result, tokenAddress)
            ),
            sharePercentage: (parseFloat(info.sharePercentage) / 100).toFixed(2) + '%',
            claimableFees: this.formatResult(info.claimableFees, (result, formatter) =>
                formatter.formatToken(result, tokenAddress)
            ),
            totalClaimed: this.formatResult(info.totalClaimed, (result, formatter) =>
                formatter.formatToken(result, tokenAddress)
            )
        };
    }

    async estimateSwap(tokenIn, tokenOut, amountIn) {
        try {
            const amountInWei = this.calculateValue(amountIn, 'parseToWei');
            const amountOut = await this.poolContract.getAmountOut(amountInWei, tokenIn, tokenOut);

            const reserves = await this.getPoolReserves(tokenIn, tokenOut);
            const priceImpact = this.calculateValue({
                reserveIn: reserves.reserveA,
                reserveOut: reserves.reserveB,
                amountIn
            }, 'calculatePriceImpact');

            return {
                amountIn,
                amountOut: this.formatResult(amountOut, (result, formatter) => formatter.formatToken(result, tokenOut)),
                priceImpact: priceImpact.toFixed(2) + '%',
                route: [tokenIn, tokenOut],
                fee: this.calculateValue({amount: amountIn, feePercent: 0.3}, 'calculateFee')
            };
        } catch (error) {
            throw this.createError(`Swap estimation failed: ${error.message}`);
        }
    }

    async getAllPoolStats() {
        const tokens = this.context.configManager.getTokens();
        const stats = [];

        const ethStats = await this.safeCall(() => this.getLiquidityStats('0x0000000000000000000000000000000000000000'), null);
        if (ethStats) {
            stats.push({symbol: 'ETH', address: '0x0000000000000000000000000000000000000000', ...ethStats});
        }

        for (const [symbol, tokenInfo] of Object.entries(tokens)) {
            if (tokenInfo.address) {
                const tokenStats = await this.safeCall(() => this.getLiquidityStats(tokenInfo.address), null);
                if (tokenStats) {
                    stats.push({symbol, address: tokenInfo.address, ...tokenStats});
                }
            }
        }

        return stats;
    }

    async getPoolHealth() {
        const ethBalance = await this.getETHBalance();
        const tokens = this.context.configManager.getTokens();
        let totalValueLocked = parseFloat(ethBalance) * 2500; // Assume ETH price
        let healthyAssets = 0;
        let totalAssets = 1;

        for (const [symbol, tokenInfo] of Object.entries(tokens)) {
            if (tokenInfo.address) {
                totalAssets++;
                const balance = await this.safeCall(() =>
                    this.poolContract.totalTokenBalances(tokenInfo.address), 0
                );
                if (parseFloat(balance) > 0) {
                    healthyAssets++;
                    totalValueLocked += parseFloat(balance);
                }
            }
        }

        const healthScore = Math.round((healthyAssets / totalAssets) * 100);

        return {
            ethBalance,
            totalValueLocked: totalValueLocked.toFixed(2),
            healthScore: {
                score: healthScore,
                status: healthScore > 80 ? 'Healthy' : healthScore > 50 ? 'Warning' : 'Critical',
                healthyAssets,
                totalAssets
            }
        };
    }
}

module.exports = PoolModule;