const BaseModule = require('./BaseModule');
const ContractHelpers = require('../utils/ContractHelpers');

class EventModule extends BaseModule {
    constructor() {
        super('EventModule', '1.0.0');
        this.subscriptions = new Map();
        this.eventHistory = new Map();
        this.filters = new Map();
        this.isListening = false;
    }

    initialize(context) {
        super.initialize(context);
        this.startEventListener();
    }

    async subscribeToSwaps(callback, userAddress = null) {
        const poolContract = this.getContract('Pool');
        const filter = userAddress
            ? poolContract.filters.Swap(userAddress)
            : poolContract.filters.Swap();

        return this.createSubscription('swaps', poolContract, filter, (event) => {
            callback({
                type: 'swap',
                user: event.args.user,
                tokenIn: event.args.tokenIn,
                tokenOut: event.args.tokenOut,
                amountIn: this.calculateValue(event.args.amountIn, 'formatFromWei'),
                amountOut: this.calculateValue(event.args.amountOut, 'formatFromWei'),
                blockNumber: event.blockNumber,
                transactionHash: event.transactionHash,
                timestamp: Date.now()
            });
        });
    }

    async subscribeToOrders(callback, userAddress = null) {
        const tradingContract = this.getContract('Trading');

        const subscriptions = [];

        // Order Created
        const createdFilter = userAddress
            ? tradingContract.filters.OrderCreated(null, userAddress)
            : tradingContract.filters.OrderCreated();

        subscriptions.push(this.createSubscription('orderCreated', tradingContract, createdFilter, (event) => {
            callback({
                type: 'order_created',
                orderId: event.args.orderId.toString(),
                user: event.args.user,
                tokenIn: event.args.tokenIn,
                tokenOut: event.args.tokenOut,
                amountIn: this.calculateValue(event.args.amountIn, 'formatFromWei'),
                blockNumber: event.blockNumber,
                transactionHash: event.transactionHash,
                timestamp: Date.now()
            });
        }));

        // Order Executed
        const executedFilter = tradingContract.filters.OrderExecuted();
        subscriptions.push(this.createSubscription('orderExecuted', tradingContract, executedFilter, (event) => {
            callback({
                type: 'order_executed',
                orderId: event.args.orderId.toString(),
                executor: event.args.executor,
                amountOut: this.calculateValue(event.args.amountOut, 'formatFromWei'),
                blockNumber: event.blockNumber,
                transactionHash: event.transactionHash,
                timestamp: Date.now()
            });
        }));

        return subscriptions;
    }

    async subscribeToPositions(callback, userAddress = null) {
        const tradingContract = this.getContract('Trading');
        const subscriptions = [];

        // Position Opened
        const openedFilter = userAddress
            ? tradingContract.filters.PositionOpened(null, userAddress)
            : tradingContract.filters.PositionOpened();

        subscriptions.push(this.createSubscription('positionOpened', tradingContract, openedFilter, (event) => {
            callback({
                type: 'position_opened',
                positionId: event.args.positionId.toString(),
                user: event.args.user,
                token: event.args.token,
                size: this.calculateValue(event.args.size, 'formatFromWei'),
                blockNumber: event.blockNumber,
                transactionHash: event.transactionHash,
                timestamp: Date.now()
            });
        }));

        // Position Closed
        const closedFilter = userAddress
            ? tradingContract.filters.PositionClosed(null, userAddress)
            : tradingContract.filters.PositionClosed();

        subscriptions.push(this.createSubscription('positionClosed', tradingContract, closedFilter, (event) => {
            callback({
                type: 'position_closed',
                positionId: event.args.positionId.toString(),
                user: event.args.user,
                pnl: this.calculateValue(event.args.pnl, 'formatFromWei'),
                blockNumber: event.blockNumber,
                transactionHash: event.transactionHash,
                timestamp: Date.now()
            });
        }));

        // Position Liquidated
        const liquidatedFilter = tradingContract.filters.PositionLiquidated();
        subscriptions.push(this.createSubscription('positionLiquidated', tradingContract, liquidatedFilter, (event) => {
            callback({
                type: 'position_liquidated',
                positionId: event.args.positionId.toString(),
                user: event.args.user,
                liquidator: event.args.liquidator,
                blockNumber: event.blockNumber,
                transactionHash: event.transactionHash,
                timestamp: Date.now()
            });
        }));

        return subscriptions;
    }

    async subscribeToPriceUpdates(callback, tokenAddresses = []) {
        const oracleContract = this.getContract('Oracle');

        const filter = tokenAddresses.length > 0
            ? oracleContract.filters.PriceUpdated(tokenAddresses)
            : oracleContract.filters.PriceUpdated();

        return this.createSubscription('priceUpdates', oracleContract, filter, (event) => {
            callback({
                type: 'price_updated',
                token: event.args.token,
                oldPrice: this.calculateValue(event.args.oldPrice, 'formatFromWei'),
                newPrice: this.calculateValue(event.args.newPrice, 'formatFromWei'),
                change: this.calculateValue({
                    oldValue: event.args.oldPrice,
                    newValue: event.args.newPrice
                }, 'calculatePercentChange'),
                blockNumber: event.blockNumber,
                transactionHash: event.transactionHash,
                timestamp: Date.now()
            });
        });
    }

    async subscribeToGovernance(callback, userAddress = null) {
        const governanceContract = this.getContract('GovernanceToken');
        const subscriptions = [];

        // Proposal Created
        const proposalFilter = userAddress
            ? governanceContract.filters.ProposalCreated(null, userAddress)
            : governanceContract.filters.ProposalCreated();

        subscriptions.push(this.createSubscription('proposalCreated', governanceContract, proposalFilter, (event) => {
            callback({
                type: 'proposal_created',
                proposalId: event.args.proposalId.toString(),
                proposer: event.args.proposer,
                description: event.args.description,
                startTime: new Date(event.args.startTime * 1000).toISOString(),
                endTime: new Date(event.args.endTime * 1000).toISOString(),
                blockNumber: event.blockNumber,
                transactionHash: event.transactionHash,
                timestamp: Date.now()
            });
        }));

        // Voted
        const votedFilter = userAddress
            ? governanceContract.filters.Voted(null, userAddress)
            : governanceContract.filters.Voted();

        subscriptions.push(this.createSubscription('voted', governanceContract, votedFilter, (event) => {
            callback({
                type: 'voted',
                proposalId: event.args.proposalId.toString(),
                voter: event.args.voter,
                support: event.args.support,
                votes: this.calculateValue(event.args.votes, 'formatFromWei'),
                blockNumber: event.blockNumber,
                transactionHash: event.transactionHash,
                timestamp: Date.now()
            });
        }));

        return subscriptions;
    }

    createSubscription(name, contract, filter, callback) {
        const subscriptionId = `${name}_${Date.now()}`;

        const unsubscribe = ContractHelpers.subscribeToEvents(contract, filter.fragment.name, callback, filter);

        this.subscriptions.set(subscriptionId, {
            name,
            contract: contract.target,
            filter,
            unsubscribe,
            createdAt: Date.now()
        });

        this.logInfo(`Created subscription: ${name}`);
        return subscriptionId;
    }

    unsubscribe(subscriptionId) {
        const subscription = this.subscriptions.get(subscriptionId);
        if (subscription) {
            subscription.unsubscribe();
            this.subscriptions.delete(subscriptionId);
            this.logInfo(`Unsubscribed: ${subscription.name}`);
            return true;
        }
        return false;
    }

    unsubscribeAll() {
        for (const [id, subscription] of this.subscriptions) {
            subscription.unsubscribe();
        }
        this.subscriptions.clear();
        this.logInfo('Unsubscribed from all events');
    }

    async getHistoricalEvents(contractName, eventName, filters = {}, fromBlock = 0, toBlock = 'latest') {
        const contract = this.getContract(contractName);

        try {
            const events = await ContractHelpers.getEventLogs(contract, eventName, filters, fromBlock, toBlock);

            const formattedEvents = events.map(event => ({
                ...event,
                contractName,
                timestamp: Date.now() // Real implementation would get block timestamp
            }));

            this.cacheEvents(contractName, eventName, formattedEvents);
            return formattedEvents;
        } catch (error) {
            this.logError(`Failed to get historical events: ${error.message}`);
            return [];
        }
    }

    async getRecentActivity(userAddress, limit = 50) {
        const activities = [];

        try {
            // Get recent swaps
            const swaps = await this.getHistoricalEvents('Pool', 'Swap', {user: userAddress}, -1000);
            activities.push(...swaps.map(e => ({...e, type: 'swap'})));

            // Get recent orders
            const orders = await this.getHistoricalEvents('Trading', 'OrderCreated', {user: userAddress}, -1000);
            activities.push(...orders.map(e => ({...e, type: 'order'})));

            // Get recent positions
            const positions = await this.getHistoricalEvents('Trading', 'PositionOpened', {user: userAddress}, -1000);
            activities.push(...positions.map(e => ({...e, type: 'position'})));

            // Sort by block number and limit
            return activities
                .sort((a, b) => b.blockNumber - a.blockNumber)
                .slice(0, limit);
        } catch (error) {
            this.logError(`Failed to get recent activity: ${error.message}`);
            return [];
        }
    }

    createEventAggregator(eventTypes, aggregationWindow = 5000) {
        const aggregator = {
            events: [],
            timer: null,
            callback: null
        };

        const processEvents = () => {
            if (aggregator.events.length > 0 && aggregator.callback) {
                aggregator.callback([...aggregator.events]);
                aggregator.events = [];
            }
        };

        aggregator.timer = setInterval(processEvents, aggregationWindow);

        aggregator.addEvent = (event) => {
            aggregator.events.push(event);
        };

        aggregator.setCallback = (callback) => {
            aggregator.callback = callback;
        };

        aggregator.stop = () => {
            if (aggregator.timer) {
                clearInterval(aggregator.timer);
                processEvents(); // Process remaining events
            }
        };

        return aggregator;
    }

    async waitForTransaction(transactionHash, confirmations = 1) {
        return new Promise((resolve, reject) => {
            let confirmedBlocks = 0;

            const handleBlock = async (blockNumber) => {
                try {
                    const receipt = await this.context.provider.getTransactionReceipt(transactionHash);
                    if (receipt && receipt.blockNumber) {
                        confirmedBlocks = blockNumber - receipt.blockNumber + 1;

                        if (confirmedBlocks >= confirmations) {
                            this.context.provider.off('block', handleBlock);
                            resolve({
                                receipt,
                                confirmations: confirmedBlocks,
                                events: ContractHelpers.parseAllEvents(receipt)
                            });
                        }
                    }
                } catch (error) {
                    this.context.provider.off('block', handleBlock);
                    reject(error);
                }
            };

            this.context.provider.on('block', handleBlock);

            // Timeout after 5 minutes
            setTimeout(() => {
                this.context.provider.off('block', handleBlock);
                reject(new Error('Transaction confirmation timeout'));
            }, 300000);
        });
    }

    cacheEvents(contractName, eventName, events) {
        const key = `${contractName}_${eventName}`;
        if (!this.eventHistory.has(key)) {
            this.eventHistory.set(key, []);
        }

        const cached = this.eventHistory.get(key);
        cached.push(...events);

        // Keep only last 1000 events
        if (cached.length > 1000) {
            cached.splice(0, cached.length - 1000);
        }
    }

    getCachedEvents(contractName, eventName) {
        const key = `${contractName}_${eventName}`;
        return this.eventHistory.get(key) || [];
    }

    startEventListener() {
        if (this.isListening) return;

        this.isListening = true;
        this.logInfo('Event listener started');
    }

    stopEventListener() {
        this.unsubscribeAll();
        this.isListening = false;
        this.logInfo('Event listener stopped');
    }

    getSubscriptionStats() {
        return {
            activeSubscriptions: this.subscriptions.size,
            subscriptions: Array.from(this.subscriptions.values()).map(sub => ({
                name: sub.name,
                contract: sub.contract,
                createdAt: new Date(sub.createdAt).toISOString()
            })),
            eventHistorySize: Array.from(this.eventHistory.values()).reduce((sum, events) => sum + events.length, 0)
        };
    }
}

module.exports = EventModule;