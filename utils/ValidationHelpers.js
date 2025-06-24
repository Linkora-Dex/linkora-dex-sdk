class ValidationHelpers {
 static validateAddress(address) {
 if (!address || typeof address !== 'string') return false;
 return /^0x[a-fA-F0-9]{40}$/.test(address);
 }

 static isETH(address) {
 return address === '0x0000000000000000000000000000000000000000' ||
 address === '0x' ||
 address.toLowerCase() === 'eth';
 }

 static validateAmount(amount) {
 if (!amount) return { valid: false, error: 'Amount required' };

 const num = parseFloat(amount);
 if (isNaN(num) || num <= 0) return { valid: false, error: 'Amount must be positive number' };
 if (num > 1e18) return { valid: false, error: 'Amount too large' };

 return { valid: true };
 }

 static validateSwapParams(params) {
 const errors = [];

 if (!this.validateAddress(params.tokenIn)) errors.push('Invalid tokenIn address');
 if (!this.validateAddress(params.tokenOut)) errors.push('Invalid tokenOut address');
 if (params.tokenIn === params.tokenOut) errors.push('Cannot swap same token');

 const amountCheck = this.validateAmount(params.amountIn);
 if (!amountCheck.valid) errors.push(amountCheck.error);

 if (params.slippage !== undefined) {
 const slippage = parseFloat(params.slippage);
 if (isNaN(slippage) || slippage < 0 || slippage > 50) {
 errors.push('Slippage must be between 0-50%');
 }
 }

 return { isValid: errors.length === 0, errors };
 }

 static validateTokenParams(params) {
 const errors = [];

 if (!this.validateAddress(params.tokenAddress)) errors.push('Invalid token address');

 const amountCheck = this.validateAmount(params.amount);
 if (!amountCheck.valid) errors.push(amountCheck.error);

 return { isValid: errors.length === 0, errors };
 }

 static validateOrderParams(params) {
 const swapValidation = this.validateSwapParams(params);
 if (!swapValidation.isValid) return swapValidation;

 const errors = [];

 const priceCheck = this.validateAmount(params.targetPrice);
 if (!priceCheck.valid) errors.push('Invalid target price');

 if (params.orderType !== undefined) {
 if (!['LIMIT', 'STOP_LOSS', 'MARKET'].includes(params.orderType)) {
 errors.push('Invalid order type');
 }
 }

 return { isValid: errors.length === 0, errors };
 }

 static validatePositionParams(params) {
 const errors = [];

 if (!this.validateAddress(params.token)) errors.push('Invalid token address');

 const collateralCheck = this.validateAmount(params.collateralAmount);
 if (!collateralCheck.valid) errors.push(collateralCheck.error);

 const leverage = parseFloat(params.leverage);
 if (isNaN(leverage) || leverage < 1 || leverage > 100) {
 errors.push('Leverage must be between 1-100');
 }

 if (params.isLong !== undefined && typeof params.isLong !== 'boolean') {
 errors.push('isLong must be boolean');
 }

 return { isValid: errors.length === 0, errors };
 }

 static validateLiquidityParams(params) {
 const errors = [];

 if (!this.validateAddress(params.tokenA)) errors.push('Invalid tokenA address');
 if (!this.validateAddress(params.tokenB)) errors.push('Invalid tokenB address');
 if (params.tokenA === params.tokenB) errors.push('Cannot pair same token');

 const amountACheck = this.validateAmount(params.amountA);
 if (!amountACheck.valid) errors.push('Invalid amountA');

 const amountBCheck = this.validateAmount(params.amountB);
 if (!amountBCheck.valid) errors.push('Invalid amountB');

 return { isValid: errors.length === 0, errors };
 }

 static validateStakingParams(params) {
 const errors = [];

 const amountCheck = this.validateAmount(params.amount);
 if (!amountCheck.valid) errors.push(amountCheck.error);

 return { isValid: errors.length === 0, errors };
 }

 static validateProposalParams(params) {
 const errors = [];

 if (!params.description || params.description.length < 10) {
 errors.push('Description must be at least 10 characters');
 }

 if (params.description && params.description.length > 1000) {
 errors.push('Description too long (max 1000 characters)');
 }

 if (params.target && !this.validateAddress(params.target)) {
 errors.push('Invalid target address');
 }

 return { isValid: errors.length === 0, errors };
 }

 static validateGasParams(params) {
 const errors = [];

 if (params.gasLimit !== undefined) {
 const gasLimit = parseInt(params.gasLimit);
 if (isNaN(gasLimit) || gasLimit < 21000 || gasLimit > 10000000) {
 errors.push('Gas limit must be between 21,000 and 10,000,000');
 }
 }

 if (params.gasPrice !== undefined) {
 const gasPrice = parseFloat(params.gasPrice);
 if (isNaN(gasPrice) || gasPrice < 0) {
 errors.push('Gas price must be positive');
 }
 }

 return { isValid: errors.length === 0, errors };
 }

 static validateTransactionOptions(options) {
 const errors = [];

 if (options.value !== undefined) {
 const valueCheck = this.validateAmount(options.value);
 if (!valueCheck.valid) errors.push('Invalid transaction value');
 }

 const gasValidation = this.validateGasParams(options);
 if (!gasValidation.isValid) errors.push(...gasValidation.errors);

 if (options.nonce !== undefined) {
 const nonce = parseInt(options.nonce);
 if (isNaN(nonce) || nonce < 0) errors.push('Invalid nonce');
 }

 return { isValid: errors.length === 0, errors };
 }

 static validatePriceData(params) {
 const errors = [];

 if (!this.validateAddress(params.tokenAddress)) errors.push('Invalid token address');

 const priceCheck = this.validateAmount(params.price);
 if (!priceCheck.valid) errors.push(priceCheck.error);

 if (params.timestamp !== undefined) {
 const timestamp = parseInt(params.timestamp);
 const now = Math.floor(Date.now() / 1000);
 if (isNaN(timestamp) || timestamp > now + 300) { // max 5 min future
 errors.push('Invalid timestamp');
 }
 }

 return { isValid: errors.length === 0, errors };
 }

 static validateBatchParams(items, validatorType) {
 if (!Array.isArray(items)) return { isValid: false, errors: ['Must be array'] };
 if (items.length === 0) return { isValid: false, errors: ['Array cannot be empty'] };
 if (items.length > 50) return { isValid: false, errors: ['Too many items (max 50)'] };

 const allErrors = [];
 const validators = {
 'swap': this.validateSwapParams,
 'token': this.validateTokenParams,
 'order': this.validateOrderParams,
 'position': this.validatePositionParams,
 'price': this.validatePriceData
 };

 const validator = validators[validatorType];
 if (!validator) return { isValid: false, errors: ['Unknown validator type'] };

 items.forEach((item, index) => {
 const validation = validator.call(this, item);
 if (!validation.isValid) {
 allErrors.push(`Item ${index}: ${validation.errors.join(', ')}`);
 }
 });

 return { isValid: allErrors.length === 0, errors: allErrors };
 }

 static sanitizeInput(input, type = 'string') {
 if (!input) return input;

 switch (type) {
 case 'address':
 return typeof input === 'string' ? input.toLowerCase().trim() : input;
 case 'amount':
 return typeof input === 'string' ? input.trim() : input;
 case 'string':
 return typeof input === 'string' ? input.trim() : input;
 default:
 return input;
 }
 }

 static validateUserPermissions(userAddress, requiredRole, userRoles = []) {
 if (!this.validateAddress(userAddress)) return { valid: false, error: 'Invalid user address' };

 const roles = {
 'user': 0,
 'premium': 1,
 'keeper': 2,
 'admin': 3
 };

 const userLevel = Math.max(...userRoles.map(role => roles[role] || 0));
 const requiredLevel = roles[requiredRole] || 0;

 return {
 valid: userLevel >= requiredLevel,
 error: userLevel < requiredLevel ? `Insufficient permissions (need ${requiredRole})` : null
 };
 }

 static validateRiskParams(params) {
 const errors = [];

 if (params.maxSlippage !== undefined) {
 const slippage = parseFloat(params.maxSlippage);
 if (isNaN(slippage) || slippage < 0 || slippage > 100) {
 errors.push('Max slippage must be 0-100%');
 }
 }

 if (params.maxGasPrice !== undefined) {
 const gasPrice = parseFloat(params.maxGasPrice);
 if (isNaN(gasPrice) || gasPrice < 0) {
 errors.push('Max gas price must be positive');
 }
 }

 if (params.deadline !== undefined) {
 const deadline = parseInt(params.deadline);
 const now = Math.floor(Date.now() / 1000);
 if (isNaN(deadline) || deadline <= now) {
 errors.push('Deadline must be in the future');
 }
 }

 return { isValid: errors.length === 0, errors };
 }

 static createValidator(schema) {
 return (params) => {
 const errors = [];

 for (const [field, rules] of Object.entries(schema)) {
 const value = params[field];

 if (rules.required && (value === undefined || value === null)) {
 errors.push(`${field} is required`);
 continue;
 }

 if (value !== undefined && rules.type) {
 const typeCheck = this.validateType(value, rules.type);
 if (!typeCheck.valid) errors.push(`${field}: ${typeCheck.error}`);
 }

 if (value !== undefined && rules.validator) {
 const customCheck = rules.validator(value);
 if (!customCheck.valid) errors.push(`${field}: ${customCheck.error}`);
 }
 }

 return { isValid: errors.length === 0, errors };
 };
 }

 static validateType(value, type) {
 switch (type) {
 case 'address':
 return { valid: this.validateAddress(value), error: 'Invalid address' };
 case 'amount':
 return this.validateAmount(value);
 case 'boolean':
 return { valid: typeof value === 'boolean', error: 'Must be boolean' };
 case 'number':
 return { valid: !isNaN(parseFloat(value)), error: 'Must be number' };
 case 'string':
 return { valid: typeof value === 'string', error: 'Must be string' };
 default:
 return { valid: true };
 }
 }
}

module.exports = ValidationHelpers;