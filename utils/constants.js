module.exports = {
    FEES: {
        DEFAULT_FEE_PERCENT: 0.3,
        MAX_FEE_PERCENT: 5.0,
        MIN_FEE_PERCENT: 0.01
    },

    TIMEOUTS: {
        TRANSACTION_TIMEOUT_MS: 60000,
        BLOCK_CONFIRMATION_TIMEOUT_MS: 120000,
        NETWORK_REQUEST_TIMEOUT_MS: 30000,
        RETRY_INTERVAL_MS: 5000
    },

    LIMITS: {
        MAX_SLIPPAGE_PERCENT: 50,
        MIN_SLIPPAGE_PERCENT: 0.01,
        MIN_TRANSACTION_VALUE_USD: 0.01,
        MAX_TRANSACTION_VALUE_USD: 10000000,
        MAX_GAS_LIMIT: 10000000,
        MIN_GAS_LIMIT: 21000,
        MAX_GAS_PRICE_GWEI: 1000,
        MAX_BATCH_SIZE: 100,
        MAX_RETRY_ATTEMPTS: 3
    },

    PRECISION: {
        PRICE_DECIMALS: 6,
        AMOUNT_DECIMALS: 6,
        PERCENT_DECIMALS: 2,
        GAS_DECIMALS: 0,
        USD_DECIMALS: 2,
        DEFAULT_TOKEN_DECIMALS: 18
    },

    ADDRESSES: {
        ZERO_ADDRESS: '0x0000000000000000000000000000000000000000',
        DEAD_ADDRESS: '0x000000000000000000000000000000000000dEaD'
    },

    NETWORKS: {
        MAINNET: {
            chainId: 1,
            name: 'mainnet',
            rpcUrl: 'https://mainnet.infura.io/v3/'
        },
        SEPOLIA: {
            chainId: 11155111,
            name: 'sepolia',
            rpcUrl: 'https://sepolia.infura.io/v3/'
        },
        LOCALHOST: {
            chainId: 31337,
            name: 'localhost',
            rpcUrl: 'http://localhost:8545'
        }
    },

    ERRORS: {
        INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
        INVALID_TOKEN: 'INVALID_TOKEN',
        INVALID_ADDRESS: 'INVALID_ADDRESS',
        INVALID_AMOUNT: 'INVALID_AMOUNT',
        SLIPPAGE_TOO_HIGH: 'SLIPPAGE_TOO_HIGH',
        TRANSACTION_FAILED: 'TRANSACTION_FAILED',
        CONTRACT_NOT_FOUND: 'CONTRACT_NOT_FOUND',
        METHOD_NOT_FOUND: 'METHOD_NOT_FOUND',
        NETWORK_ERROR: 'NETWORK_ERROR',
        TIMEOUT_ERROR: 'TIMEOUT_ERROR',
        UNAUTHORIZED: 'UNAUTHORIZED',
        VALIDATION_ERROR: 'VALIDATION_ERROR'
    },

    EVENTS: {
        TRANSFER: 'Transfer',
        APPROVAL: 'Approval',
        DEPOSIT: 'Deposit',
        WITHDRAW: 'Withdraw',
        SWAP: 'Swap'
    },

    TOKEN_TYPES: {
        ERC20: 'ERC20',
        ERC721: 'ERC721',
        ERC1155: 'ERC1155',
        NATIVE: 'NATIVE'
    },

    TRANSACTION_TYPES: {
        SEND: 'send',
        APPROVE: 'approve',
        SWAP: 'swap',
        DEPOSIT: 'deposit',
        WITHDRAW: 'withdraw'
    },

    STATUS: {
        PENDING: 'pending',
        SUCCESS: 'success',
        FAILED: 'failed',
        CANCELLED: 'cancelled'
    }
};