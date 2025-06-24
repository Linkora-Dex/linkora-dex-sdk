class SwapModule extends BaseModule {
  constructor() {
    super('SwapModule', '1.0.0');
  }

  async swap(tokenIn, tokenOut, amountIn, slippage = 0.5) {
    // Валидация
    const validation = this.validateParams(
      { tokenIn, tokenOut, amountIn, slippage },
      'validateSwapParams'
    );
    if (!validation.isValid) {
      throw this.createError(`Invalid params: ${validation.errors.join(', ')}`);
    }

    // Вызов контракта
    return this.handleTransaction(
      () => this.callContract('Router', 'swap', [tokenIn, tokenOut, amountIn]),
      'Token swap'
    );
  }
}