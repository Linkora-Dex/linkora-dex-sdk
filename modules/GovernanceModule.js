const BaseModule = require('./BaseModule');

class GovernanceModule extends BaseModule {
    constructor() {
        super('GovernanceModule', '1.0.0');
        this.governanceContract = null;
    }

initialize(context) {
    super.initialize(context);
    if (this.hasContract('GovernanceToken')) {
        this.governanceContract = this.getContract('GovernanceToken');
    } else {
        this.governanceContract = null;
        console.warn('⚠️  GovernanceToken contract not found - governance features disabled');
    }
}

    async stake(amount, options = {}) {
        const amountWei = this.calculateValue(amount, 'parseToWei');
        const tx = await this.governanceContract.stake(amountWei, options);

        await this.handleTransaction(() => tx.wait(), `Stake ${amount} tokens`);
        this.logInfo(`Staked ${amount} governance tokens`);
        return true;
    }

    async unstake(amount, options = {}) {
        const amountWei = this.calculateValue(amount, 'parseToWei');
        const tx = await this.governanceContract.unstake(amountWei, options);

        await this.handleTransaction(() => tx.wait(), `Unstake ${amount} tokens`);
        this.logInfo(`Unstaked ${amount} governance tokens`);
        return true;
    }

    async claimRewards(options = {}) {
        const tx = await this.governanceContract.claimRewards(options);

        const receipt = await this.handleTransaction(() => tx.wait(), 'Claim staking rewards');
        const reward = this.extractEventData(receipt, 'RewardClaimed', 'reward');

        this.logInfo(`Claimed rewards: ${this.calculateValue(reward || 0, 'formatFromWei')} tokens`);
        return this.calculateValue(reward || 0, 'formatFromWei');
    }

    async claimFees(tokenAddress, options = {}) {
        const tx = await this.governanceContract.claimFees(tokenAddress, options);

        const receipt = await this.handleTransaction(() => tx.wait(), `Claim fees for ${this.getTokenSymbol(tokenAddress)}`);
        const amount = this.extractEventData(receipt, 'FeesClaimed', 'amount');

        this.logInfo(`Claimed fees: ${this.calculateValue(amount || 0, 'formatFromWei')} ${this.getTokenSymbol(tokenAddress)}`);
        return this.calculateValue(amount || 0, 'formatFromWei');
    }

    async getBalance(userAddress) {
        const address = userAddress || await this.getUserAddress();
        const balance = await this.governanceContract.balanceOf(address);
        return this.calculateValue(balance, 'formatFromWei');
    }

    async getStakingBalance(userAddress) {
        const address = userAddress || await this.getUserAddress();
        const balance = await this.governanceContract.stakingBalance(address);
        return this.calculateValue(balance, 'formatFromWei');
    }

    async calculateRewards(userAddress) {
        const address = userAddress || await this.getUserAddress();
        const rewards = await this.governanceContract.calculateRewards(address);
        return this.calculateValue(rewards, 'formatFromWei');
    }

    async getUserStakingInfo(userAddress) {
        const address = userAddress || await this.getUserAddress();
        const info = await this.governanceContract.getUserStakingInfo(address);

        return {
            balance: this.calculateValue(info.balance, 'formatFromWei'),
            staked: this.calculateValue(info.staked, 'formatFromWei'),
            rewards: this.calculateValue(info.rewards, 'formatFromWei'),
            discountBps: info.discountBps.toString()
        };
    }

    async getTradingDiscount(userAddress) {
        const address = userAddress || await this.getUserAddress();
        const discount = await this.governanceContract.getTradingDiscount(address);
        return (parseFloat(discount.toString()) / 100).toFixed(2) + '%';
    }

    async isPremiumUser(userAddress) {
        const address = userAddress || await this.getUserAddress();
        return this.governanceContract.isPremiumUser(address);
    }

    async getVotingPower(userAddress) {
        const address = userAddress || await this.getUserAddress();
        const power = await this.governanceContract.getVotingPower(address);
        return this.calculateValue(power, 'formatFromWei');
    }

    async canCreateProposal(userAddress) {
        const address = userAddress || await this.getUserAddress();
        return this.governanceContract.canCreateProposal(address);
    }

    async createProposal(description, target, data, options = {}) {
        if (!description || description.length < 10) {
            throw this.createError('Proposal description must be at least 10 characters');
        }

        const tx = await this.governanceContract.createProposal(
            description,
            target || '0x0000000000000000000000000000000000000000',
            data || '0x',
            options
        );

        const receipt = await this.handleTransaction(() => tx.wait(), 'Create proposal');
        const proposalId = this.extractEventData(receipt, 'ProposalCreated', 'proposalId');

        this.logInfo(`Created proposal ${proposalId}: ${description.substring(0, 50)}...`);
        return proposalId.toString();
    }

    async vote(proposalId, support, options = {}) {
        const tx = await this.governanceContract.vote(proposalId, support, options);

        const receipt = await this.handleTransaction(() => tx.wait(), `Vote on proposal ${proposalId}`);
        const votes = this.extractEventData(receipt, 'Voted', 'votes');

        this.logInfo(`Voted ${support ? 'FOR' : 'AGAINST'} proposal ${proposalId} with ${this.calculateValue(votes || 0, 'formatFromWei')} votes`);
        return true;
    }

    async executeProposal(proposalId, options = {}) {
        const tx = await this.governanceContract.executeProposal(proposalId, options);

        await this.handleTransaction(() => tx.wait(), `Execute proposal ${proposalId}`);
        this.logInfo(`Executed proposal ${proposalId}`);
        return true;
    }

    async cancelProposal(proposalId, options = {}) {
        const tx = await this.governanceContract.cancelProposal(proposalId, options);

        await this.handleTransaction(() => tx.wait(), `Cancel proposal ${proposalId}`);
        this.logInfo(`Cancelled proposal ${proposalId}`);
        return true;
    }

    async getProposal(proposalId) {
        const proposal = await this.governanceContract.getProposal(proposalId);
        return this.formatProposalData(proposal);
    }

    async getClaimableFees(userAddress, tokenAddress) {
        const address = userAddress || await this.getUserAddress();
        const fees = await this.governanceContract.getClaimableFees(address, tokenAddress);
        return this.calculateValue(fees, 'formatFromWei');
    }

    async getUserInfo(userAddress) {
        const address = userAddress || await this.getUserAddress();
        const info = await this.governanceContract.getUserInfo(address);

        return {
            balance: this.calculateValue(info.balance, 'formatFromWei'),
            staked: this.calculateValue(info.staked, 'formatFromWei'),
            rewards: this.calculateValue(info.rewards, 'formatFromWei'),
            votingPower: this.calculateValue(info.votingPower, 'formatFromWei'),
            discountBps: (parseFloat(info.discountBps.toString()) / 100).toFixed(2) + '%',
            premium: info.premium
        };
    }

    async getTokenStats() {
        const stats = await this.governanceContract.getTokenStats();

        return {
            totalSupply: this.calculateValue(stats.totalSupply_, 'formatFromWei'),
            maxSupply: this.calculateValue(stats.maxSupply_, 'formatFromWei'),
            totalStaked: this.calculateValue(stats.totalStaked_, 'formatFromWei'),
            totalFeesDistributed: this.calculateValue(stats.totalFeesDistributed_, 'formatFromWei'),
            circulatingSupply: this.calculateValue(stats.circulatingSupply, 'formatFromWei'),
            nextProposalId: stats.nextProposalId_.toString(),
            stakingAPR: this.calculateStakingAPR(stats)
        };
    }

    async getDistributionInfo(category) {
        const categoryHash = this.calculateValue(category.toUpperCase(), 'keccak256');
        const info = await this.governanceContract.getDistributionInfo(categoryHash);

        return {
            category: category.toUpperCase(),
            allocated: this.calculateValue(info.allocated, 'formatFromWei'),
            claimed: this.calculateValue(info.claimed, 'formatFromWei'),
            remaining: this.calculateValue(info.remaining, 'formatFromWei'),
            progress: info.allocated > 0 ? ((parseFloat(info.claimed) / parseFloat(info.allocated)) * 100).toFixed(2) + '%' : '0%'
        };
    }

    async getAllDistributions() {
        const categories = ['USERS', 'TEAM', 'LIQUIDITY', 'RESERVE', 'PARTNERS'];
        const distributions = [];

        for (const category of categories) {
            const info = await this.safeCall(() => this.getDistributionInfo(category), null);
            if (info) {
                distributions.push(info);
            }
        }

        return distributions;
    }

    async getActiveProposals() {
        const stats = await this.getTokenStats();
        const nextId = parseInt(stats.nextProposalId);
        const activeProposals = [];

        for (let i = 1; i < nextId; i++) {
            const proposal = await this.safeCall(() => this.getProposal(i), null);
            if (proposal && proposal.status === 'Active') {
                activeProposals.push(proposal);
            }
        }

        return activeProposals;
    }

    async getUserRewardsHistory(userAddress) {
        const address = userAddress || await this.getUserAddress();
        const currentRewards = await this.calculateRewards(address);
        const stakingInfo = await this.getUserStakingInfo(address);

        return {
            currentRewards,
            pendingClaim: currentRewards,
            stakingBalance: stakingInfo.staked,
            estimatedDailyReward: this.calculateDailyReward(stakingInfo.staked),
            totalEarned: '0' // Historical data would require event indexing
        };
    }

    async getGovernanceStats() {
        const [tokenStats, proposals] = await Promise.all([
            this.getTokenStats(),
            this.getActiveProposals()
        ]);

        const stakingRatio = tokenStats.totalStaked && tokenStats.totalSupply
            ? (parseFloat(tokenStats.totalStaked) / parseFloat(tokenStats.totalSupply) * 100).toFixed(2) + '%'
            : '0%';

        return {
            ...tokenStats,
            activeProposals: proposals.length,
            stakingRatio,
            governanceHealth: this.calculateGovernanceHealth(tokenStats, proposals.length)
        };
    }

    formatProposalData(proposal) {
        const now = Math.floor(Date.now() / 1000);
        let status = 'Unknown';

        if (proposal.cancelled) status = 'Cancelled';
        else if (proposal.executed) status = 'Executed';
        else if (now < proposal.startTime) status = 'Pending';
        else if (now <= proposal.endTime) status = 'Active';
        else if (now < proposal.executionTime) status = 'Queued';
        else status = 'Expired';

        const totalVotes = parseFloat(proposal.votesFor) + parseFloat(proposal.votesAgainst);

        return {
            id: proposal.id.toString(),
            proposer: proposal.proposer,
            description: proposal.description,
            target: proposal.target,
            votesFor: this.calculateValue(proposal.votesFor, 'formatFromWei'),
            votesAgainst: this.calculateValue(proposal.votesAgainst, 'formatFromWei'),
            totalVotes: this.calculateValue(totalVotes, 'formatFromWei'),
            forPercentage: totalVotes > 0 ? (parseFloat(proposal.votesFor) / totalVotes * 100).toFixed(2) + '%' : '0%',
            startTime: new Date(proposal.startTime * 1000).toISOString(),
            endTime: new Date(proposal.endTime * 1000).toISOString(),
            executionTime: new Date(proposal.executionTime * 1000).toISOString(),
            status,
            executed: proposal.executed,
            cancelled: proposal.cancelled
        };
    }

    calculateStakingAPR(stats) {
        const stakingRatio = parseFloat(stats.totalStaked_) / parseFloat(stats.totalSupply_);
        const baseAPR = 12; // Base 12% APR
        return stakingRatio > 0 ? (baseAPR / stakingRatio).toFixed(2) + '%' : '0%';
    }

    calculateDailyReward(stakedAmount) {
        const apr = 0.12; // 12% APR
        const dailyRate = apr / 365;
        return (parseFloat(stakedAmount) * dailyRate).toFixed(6);
    }

    calculateGovernanceHealth(tokenStats, activeProposals) {
        const stakingRatio = parseFloat(tokenStats.totalStaked) / parseFloat(tokenStats.totalSupply);
        const proposalActivity = activeProposals > 0 ? 1 : 0.5;
        const supplyHealth = parseFloat(tokenStats.totalSupply) / parseFloat(tokenStats.maxSupply);

        const score = Math.round((stakingRatio * 0.5 + proposalActivity * 0.3 + supplyHealth * 0.2) * 100);

        return {
            score,
            status: score > 80 ? 'Excellent' : score > 60 ? 'Good' : score > 40 ? 'Fair' : 'Poor',
            factors: {
                stakingParticipation: Math.round(stakingRatio * 100) + '%',
                proposalActivity: activeProposals > 0 ? 'Active' : 'Low',
                tokenomicsHealth: Math.round(supplyHealth * 100) + '%'
            }
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

module.exports = GovernanceModule;