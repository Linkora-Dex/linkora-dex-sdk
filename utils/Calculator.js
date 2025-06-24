const {ethers} = require('ethers');
const CONSTANTS = require('./constants');

class Calculator {
    constructor() {
        this.PRECISION = CONSTANTS.PRECISION.PRICE_DECIMALS;
    }

    isValidAmount(amount, decimals = 18) {
        if (amount === null || amount === undefined) return false;
        let amountStr = amount.toString().trim();
        if (amountStr === '' || isNaN(amountStr)) return false;
        const num = Number(amountStr);
        if (num <= 0) return false;
        if (amountStr.includes('.')) {
            const decimalPart = amountStr.split('.')[1];
            if (decimalPart.length > decimals) return false;
        }
        return true;
    }

    applySlippage(amount, slippagePercent, isMinimum = true) {
        const amountNum = parseFloat(amount.toString());
        const slippage = Math.abs(slippagePercent) / 100;
        if (isMinimum) {
            return (amountNum * (1 - slippage)).toFixed(this.PRECISION);
        } else {
            return (amountNum * (1 + slippage)).toFixed(this.PRECISION);
        }
    }

    calculateAmountOut(amountIn, reserveIn, reserveOut, feePercent = CONSTANTS.FEES.DEFAULT_FEE_PERCENT) {
        const amountInNum = parseFloat(amountIn);
        const reserveInNum = parseFloat(reserveIn);
        const reserveOutNum = parseFloat(reserveOut);

        if (reserveInNum === 0 || reserveOutNum === 0) return '0';

        const amountInWithFee = amountInNum * (1 - feePercent / 100);
        const amountOut = (amountInWithFee * reserveOutNum) / (reserveInNum + amountInWithFee);

        return amountOut.toFixed(this.PRECISION);
    }

    calculateAmountIn(amountOut, reserveIn, reserveOut, feePercent = CONSTANTS.FEES.DEFAULT_FEE_PERCENT) {
        const amountOutNum = parseFloat(amountOut);
        const reserveInNum = parseFloat(reserveIn);
        const reserveOutNum = parseFloat(reserveOut);

        if (reserveInNum === 0 || reserveOutNum === 0 || amountOutNum >= reserveOutNum) return '0';

        const numerator = amountOutNum * reserveInNum;
        const denominator = (reserveOutNum - amountOutNum) * (1 - feePercent / 100);
        const amountIn = numerator / denominator;

        return amountIn.toFixed(this.PRECISION);
    }

    calculatePriceImpact(reserveIn, reserveOut, amountIn) {
        const reserveInNum = parseFloat(reserveIn);
        const reserveOutNum = parseFloat(reserveOut);
        const amountInNum = parseFloat(amountIn);

        if (reserveInNum === 0 || reserveOutNum === 0) return 0;

        const k = reserveInNum * reserveOutNum;
        const newReserveIn = reserveInNum + amountInNum;
        const newReserveOut = k / newReserveIn;
        const amountOut = reserveOutNum - newReserveOut;

        const priceBefore = reserveOutNum / reserveInNum;
        const priceAfter = amountOut / amountInNum;
        const impact = Math.abs((priceBefore - priceAfter) / priceBefore) * 100;

        return parseFloat(impact.toFixed(2));
    }

    calculateFee(amount, feePercent = CONSTANTS.FEES.DEFAULT_FEE_PERCENT) {
        const amountNum = parseFloat(amount);
        const fee = amountNum * (feePercent / 100);
        return fee.toFixed(this.PRECISION);
    }

    calculateNetAmount(amount, feePercent = CONSTANTS.FEES.DEFAULT_FEE_PERCENT) {
        const amountNum = parseFloat(amount);
        const fee = this.calculateFee(amount, feePercent);
        const netAmount = amountNum - parseFloat(fee);
        return netAmount.toFixed(this.PRECISION);
    }

    convertByPrice(amount, fromPrice, toPrice) {
        const amountNum = parseFloat(amount);
        const fromPriceNum = parseFloat(fromPrice);
        const toPriceNum = parseFloat(toPrice);

        if (toPriceNum === 0) return '0';

        const usdValue = amountNum * fromPriceNum;
        const convertedAmount = usdValue / toPriceNum;

        return convertedAmount.toFixed(this.PRECISION);
    }

    calculatePercentChange(oldValue, newValue) {
        const oldNum = parseFloat(oldValue);
        const newNum = parseFloat(newValue);

        if (oldNum === 0) return 0;

        const change = ((newNum - oldNum) / oldNum) * 100;
        return parseFloat(change.toFixed(CONSTANTS.PRECISION.PERCENT_DECIMALS));
    }

    calculateAverage(values) {
        if (!Array.isArray(values) || values.length === 0) return 0;

        const sum = values.reduce((acc, val) => acc + parseFloat(val), 0);
        const average = sum / values.length;

        return parseFloat(average.toFixed(this.PRECISION));
    }

    calculateWeightedAverage(values, weights) {
        if (!Array.isArray(values) || !Array.isArray(weights) || values.length !== weights.length) return 0;

        let weightedSum = 0;
        let totalWeight = 0;

        for (let i = 0; i < values.length; i++) {
            weightedSum += parseFloat(values[i]) * parseFloat(weights[i]);
            totalWeight += parseFloat(weights[i]);
        }

        if (totalWeight === 0) return 0;

        return parseFloat((weightedSum / totalWeight).toFixed(this.PRECISION));
    }

    formatFromWei(wei, decimals = 18) {
        try {
            return ethers.formatUnits(wei, decimals);
        } catch (error) {
            return '0';
        }
    }

    parseToWei(amount, decimals = 18) {
        try {
            return ethers.parseUnits(amount.toString(), decimals);
        } catch (error) {
            return BigInt(0);
        }
    }

    hasSufficientBalance(available, required, buffer = 0.01) {
        const availableNum = parseFloat(available);
        const requiredNum = parseFloat(required);
        const requiredWithBuffer = requiredNum * (1 + buffer);
        return availableNum >= requiredWithBuffer;
    }

    normalizeAmount(amount, decimals = 18) {
        try {
            const wei = this.parseToWei(amount, decimals);
            return this.formatFromWei(wei, decimals);
        } catch (error) {
            return '0';
        }
    }

    safeDivide(numerator, denominator, defaultValue = 0) {
        if (denominator === 0 || !isFinite(denominator)) {
            return defaultValue;
        }
        return numerator / denominator;
    }

    toSignificantDigits(value, digits = 6) {
        if (value === 0) return '0';
        const magnitude = Math.floor(Math.log10(Math.abs(value)));
        const scale = Math.pow(10, digits - 1 - magnitude);
        const rounded = Math.round(value * scale) / scale;
        return rounded.toString();
    }

    clamp(value, min, max) {
        return Math.min(Math.max(parseFloat(value), min), max);
    }

    calculateGasCost(gasUsed, gasPrice) {
        try {
            const gasUsedBig = BigInt(gasUsed);
            const gasPriceBig = BigInt(gasPrice);
            const costWei = gasUsedBig * gasPriceBig;
            return this.formatFromWei(costWei, 18);
        } catch (error) {
            return '0';
        }
    }

    isWithinTolerance(value1, value2, tolerancePercent = 1) {
        const val1 = parseFloat(value1);
        const val2 = parseFloat(value2);

        if (val1 === 0 && val2 === 0) return true;
        if (val1 === 0 || val2 === 0) return false;

        const diff = Math.abs(val1 - val2);
        const tolerance = Math.abs(val1) * (tolerancePercent / 100);

        return diff <= tolerance;
    }
}

module.exports = Calculator;