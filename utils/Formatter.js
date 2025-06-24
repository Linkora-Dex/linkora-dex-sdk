const {ethers} = require('ethers');
const CONSTANTS = require('./constants');

class Formatter {
    constructor(configManager) {
        this.configManager = configManager;
    }

    formatToken(amount, tokenAddress, precision = CONSTANTS.PRECISION.AMOUNT_DECIMALS) {
        try {
            if (this.configManager && this.configManager.isETH(tokenAddress)) {
                return parseFloat(ethers.formatEther(amount)).toFixed(precision);
            }

            let decimals = CONSTANTS.PRECISION.DEFAULT_TOKEN_DECIMALS;
            if (this.configManager) {
                try {
                    const tokenInfo = this.configManager.getToken(tokenAddress);
                    decimals = tokenInfo.decimals || decimals;
                } catch {
                }
            }

            return parseFloat(ethers.formatUnits(amount, decimals)).toFixed(precision);
        } catch {
            return '0.' + '0'.repeat(precision);
        }
    }

    formatPrice(price, precision = CONSTANTS.PRECISION.PRICE_DECIMALS) {
        try {
            if (typeof price === 'string' || typeof price === 'number') {
                return parseFloat(price).toFixed(precision);
            }
            return parseFloat(ethers.formatEther(price)).toFixed(precision);
        } catch {
            return '0.' + '0'.repeat(precision);
        }
    }

    formatPercent(percent, precision = CONSTANTS.PRECISION.PERCENT_DECIMALS) {
        const formatted = parseFloat(percent).toFixed(precision);
        return percent >= 0 ? `+${formatted}%` : `${formatted}%`;
    }

    formatAddress(address, length = 6) {
        if (!address || address.length < 10) return address;
        return `${address.slice(0, length)}...${address.slice(-length)}`;
    }

    formatNumber(number, precision = 2) {
        const num = parseFloat(number);
        if (isNaN(num)) return '0';
        return num.toLocaleString('en-US', {
            minimumFractionDigits: precision,
            maximumFractionDigits: precision
        });
    }

    formatUSD(value, precision = CONSTANTS.PRECISION.USD_DECIMALS) {
        const num = parseFloat(value);
        if (isNaN(num)) return '$0.00';
        return `$${this.formatNumber(num, precision)}`;
    }

    formatTime(timestamp) {
        const date = new Date(timestamp * 1000);
        return date.toLocaleString();
    }

    formatTimeUntil(timestamp) {
        const now = Math.floor(Date.now() / 1000);
        const diff = timestamp - now;

        if (diff <= 0) return 'Now';
        if (diff < 60) return `${diff}s`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
        return `${Math.floor(diff / 86400)}d`;
    }

    formatAge(timestamp) {
        const now = Math.floor(Date.now() / 1000);
        const diff = now - timestamp;

        if (diff < 60) return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }

    formatBytes(bytes) {
        const num = parseFloat(bytes);
        if (isNaN(num)) return '0 B';
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        if (num === 0) return '0 B';
        const i = Math.floor(Math.log(num) / Math.log(1024));
        return `${(num / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
    }

    formatGas(gasUsed, gasPrice) {
        const gas = parseFloat(gasUsed);
        const result = {
            gas: this.formatNumber(gas, 0),
            gasFormatted: gas > 1000000 ? `${(gas / 1000000).toFixed(2)}M` : `${(gas / 1000).toFixed(1)}K`
        };

        if (gasPrice) {
            try {
                const price = parseFloat(gasPrice);
                const cost = gas * price;
                result.cost = ethers.formatEther(cost.toString());
                result.costUSD = this.formatUSD(result.cost);
            } catch {
            }
        }

        return result;
    }

    formatStatus(status, trueText = 'Active', falseText = 'Inactive') {
        return status ? trueText : falseText;
    }

    formatChange(oldValue, newValue, includeColor = false) {
        const change = ((newValue - oldValue) / oldValue) * 100;
        const formatted = this.formatPercent(change);

        if (includeColor) {
            const color = change >= 0 ? '\x1b[32m' : '\x1b[31m';
            const reset = '\x1b[0m';
            return `${color}${formatted}${reset}`;
        }

        return formatted;
    }

    getTokenSymbol(tokenAddress) {
        try {
            if (this.configManager && this.configManager.isETH(tokenAddress)) return 'ETH';
            if (this.configManager) {
                return this.configManager.getToken(tokenAddress).symbol;
            }
            return 'UNKNOWN';
        } catch {
            return 'UNKNOWN';
        }
    }

    formatTransactionHash(hash, length = 8) {
        if (!hash || hash.length < 10) return hash;
        return `${hash.slice(0, length)}...${hash.slice(-length)}`;
    }

    formatCompactNumber(number) {
        const num = parseFloat(number);
        if (isNaN(num)) return '0';

        if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
        if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;

        return num.toFixed(2);
    }

    createTable(data, columns) {
        if (!data.length) return 'No data';

        const colWidths = columns.map(col => Math.max(
            col.length,
            ...data.map(row => String(row[col] || '').length)
        ));

        const separator = colWidths.map(width => '-'.repeat(width)).join('-+-');
        const header = columns.map((col, i) => col.padEnd(colWidths[i])).join(' | ');
        const rows = data.map(row =>
            columns.map((col, i) => String(row[col] || '').padEnd(colWidths[i])).join(' | ')
        );

        return [header, separator, ...rows].join('\n');
    }

    formatBalance(balance, tokenAddress) {
        const amount = this.formatToken(balance.amount || balance, tokenAddress);
        const symbol = this.getTokenSymbol(tokenAddress);
        const usdValue = balance.usdValue ? ` (${this.formatUSD(balance.usdValue)})` : '';
        return `${amount} ${symbol}${usdValue}`;
    }

    formatTransaction(transaction) {
        return {
            hash: this.formatTransactionHash(transaction.hash),
            from: this.formatAddress(transaction.from),
            to: this.formatAddress(transaction.to),
            value: this.formatToken(transaction.value, CONSTANTS.ADDRESSES.ZERO_ADDRESS),
            gas: this.formatGas(transaction.gasUsed, transaction.gasPrice),
            status: this.formatStatus(transaction.status === 1, 'Success', 'Failed'),
            timestamp: this.formatAge(transaction.timestamp)
        };
    }

    formatNetworkInfo(network) {
        return {
            name: network.name || 'Unknown',
            chainId: network.chainId.toString(),
            blockNumber: network.blockNumber ? this.formatCompactNumber(network.blockNumber) : 'Unknown'
        };
    }

    formatError(error) {
        if (typeof error === 'string') return error;
        if (error.message) return error.message;
        if (error.reason) return error.reason;
        return 'Unknown error';
    }

    toJSON(data, pretty = false) {
        try {
            return JSON.stringify(data, null, pretty ? 2 : 0);
        } catch {
            return '{}';
        }
    }
}

module.exports = Formatter;