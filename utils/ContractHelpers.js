class ContractHelpers {
 static parseEventData(receipt, eventName, dataField) {
 if (!receipt?.logs) return null;

 const event = receipt.logs.find(log =>
 log.fragment?.name === eventName ||
 log.topics?.[0] === this.getEventTopic(eventName)
 );

 return event?.args?.[dataField] || event?.data || null;
 }

 static parseAllEvents(receipt, eventNames = []) {
 if (!receipt?.logs) return [];

 return receipt.logs
 .filter(log => eventNames.length === 0 || eventNames.includes(log.fragment?.name))
 .map(log => ({
 name: log.fragment?.name,
 args: log.args,
 data: log.data,
 topics: log.topics,
 address: log.address,
 blockNumber: log.blockNumber,
 transactionHash: log.transactionHash
 }));
 }

 static extractTransactionData(receipt) {
 return {
 hash: receipt.hash,
 blockNumber: receipt.blockNumber,
 gasUsed: receipt.gasUsed?.toString(),
 effectiveGasPrice: receipt.effectiveGasPrice?.toString(),
 status: receipt.status,
 events: this.parseAllEvents(receipt),
 timestamp: Math.floor(Date.now() / 1000)
 };
 }

 static async handleContractCall(contractCall, description = 'Contract call') {
 try {
 const result = await contractCall();
 return { success: true, data: result, error: null };
 } catch (error) {
 const errorInfo = this.parseContractError(error);
 return {
 success: false,
 data: null,
 error: errorInfo,
 description
 };
 }
 }

 static parseContractError(error) {
 if (error?.reason) return { type: 'revert', message: error.reason };
 if (error?.code === 'INSUFFICIENT_FUNDS') return { type: 'funds', message: 'Insufficient balance' };
 if (error?.code === 'UNPREDICTABLE_GAS_LIMIT') return { type: 'gas', message: 'Transaction may fail' };
 if (error?.message?.includes('user rejected')) return { type: 'rejected', message: 'User rejected transaction' };
 if (error?.message?.includes('nonce')) return { type: 'nonce', message: 'Transaction nonce error' };

 return {
 type: 'unknown',
 message: error?.message || 'Unknown contract error',
 code: error?.code
 };
 }

 static formatContractResult(result, formatter) {
 if (!result) return null;

 if (typeof formatter === 'function') {
 return formatter(result);
 }

 if (Array.isArray(result)) {
 return result.map(item => this.formatSingleValue(item));
 }

 return this.formatSingleValue(result);
 }

 static formatSingleValue(value) {
 if (!value) return '0';

 if (value._isBigNumber || typeof value === 'bigint') {
 return value.toString();
 }

 if (typeof value === 'object' && value.toString) {
 return value.toString();
 }

 return value;
 }

 static encodeCallData(contractInterface, functionName, params = []) {
 try {
 return contractInterface.encodeFunctionData(functionName, params);
 } catch (error) {
 throw new Error(`Failed to encode call data: ${error.message}`);
 }
 }

 static decodeCallData(contractInterface, data) {
 try {
 return contractInterface.decodeFunctionData(data);
 } catch (error) {
 return null;
 }
 }

 static calculateGasEstimate(gasUsed, gasPrice, ethPrice = 2500) {
 const gasCost = (parseFloat(gasUsed) * parseFloat(gasPrice)) / 1e18;
 return {
 gasUsed: gasUsed.toString(),
 gasCostETH: gasCost.toFixed(8),
 gasCostUSD: (gasCost * ethPrice).toFixed(2)
 };
 }

 static createBatchCall(calls) {
 return calls.map(call => ({
 target: call.contract.target,
 callData: this.encodeCallData(call.contract.interface, call.method, call.params),
 value: call.value || 0
 }));
 }

 static async executeBatchCall(multicallContract, calls, options = {}) {
 const batchCalls = this.createBatchCall(calls);

 try {
 const results = await multicallContract.aggregate(batchCalls, options);
 return results.map((result, index) => ({
 success: result.success,
 data: result.returnData,
 call: calls[index]
 }));
 } catch (error) {
 throw new Error(`Batch call failed: ${error.message}`);
 }
 }

 static monitorTransaction(txHash, provider, callback) {
 let attempts = 0;
 const maxAttempts = 120; // 10 minutes with 5s intervals

 const checkStatus = async () => {
 try {
 const receipt = await provider.getTransactionReceipt(txHash);
 if (receipt) {
 callback({ status: 'confirmed', receipt, attempts });
 return;
 }

 attempts++;
 if (attempts >= maxAttempts) {
 callback({ status: 'timeout', receipt: null, attempts });
 return;
 }

 setTimeout(checkStatus, 5000);
 } catch (error) {
 callback({ status: 'error', error, attempts });
 }
 };

 checkStatus();
 }

 static createEventFilter(contract, eventName, filters = {}, fromBlock = 'latest') {
 const filter = contract.filters[eventName](...Object.values(filters));
 filter.fromBlock = fromBlock;
 return filter;
 }

 static async getEventLogs(contract, eventName, filters = {}, fromBlock = 0, toBlock = 'latest') {
 try {
 const filter = this.createEventFilter(contract, eventName, filters, fromBlock);
 filter.toBlock = toBlock;

 const logs = await contract.queryFilter(filter);
 return logs.map(log => ({
 event: eventName,
 args: log.args,
 blockNumber: log.blockNumber,
 transactionHash: log.transactionHash,
 logIndex: log.logIndex
 }));
 } catch (error) {
 throw new Error(`Failed to get event logs: ${error.message}`);
 }
 }

 static subscribeToEvents(contract, eventName, callback, filters = {}) {
 const filter = this.createEventFilter(contract, eventName, filters);

 const listener = (...args) => {
 const event = args[args.length - 1];
 callback({
 event: eventName,
 args: args.slice(0, -1),
 blockNumber: event.blockNumber,
 transactionHash: event.transactionHash
 });
 };

 contract.on(filter, listener);

 return () => contract.off(filter, listener);
 }

 static getEventTopic(eventName) {
 const eventTopics = {
 'Transfer': '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
 'Approval': '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925',
 'Swap': '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822',
 'Deposit': '0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c',
 'Withdrawal': '0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65'
 };
 return eventTopics[eventName] || null;
 }

 static retryCall(fn, maxRetries = 3, delay = 1000) {
 return new Promise(async (resolve, reject) => {
 for (let i = 0; i < maxRetries; i++) {
 try {
 const result = await fn();
 resolve(result);
 return;
 } catch (error) {
 if (i === maxRetries - 1) {
 reject(error);
 return;
 }
 await new Promise(res => setTimeout(res, delay * (i + 1)));
 }
 }
 });
 }

 static async safeContractCall(contract, method, params = [], defaultValue = null) {
 try {
 return await this.retryCall(() => contract[method](...params));
 } catch (error) {
 console.warn(`Safe call failed for ${method}:`, error.message);
 return defaultValue;
 }
 }

 static createContractInterface(abi) {
 try {
 const { Interface } = require('ethers');
 return new Interface(abi);
 } catch (error) {
 throw new Error(`Failed to create interface: ${error.message}`);
 }
 }
}

module.exports = ContractHelpers;