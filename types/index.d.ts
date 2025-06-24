import { ethers } from 'ethers';

export interface DexConfig {
  configPath?: string;
  provider?: ethers.Provider;
  signer?: ethers.Signer;
}

export interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl?: string;
}

export interface TokenConfig {
  symbol: string;
  address: string;
  decimals: number;
  name?: string;
}

export interface ContractConfig {
  [contractName: string]: string;
}

export interface Config {
  network: string;
  chainId: number;
  contracts: ContractConfig;
  tokens: { [symbol: string]: TokenConfig };
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippage?: number;
}

export interface TransactionParams {
  to: string;
  value: string;
  gasLimit?: string;
  gasPrice?: string;
  data?: string;
}

export interface GasEstimate {
  gasLimit: string;
  gasPrice: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface ContractInfo {
  address: string;
  methods: string[];
}

export interface SystemInfo {
  network: NetworkConfig;
  contracts: { [name: string]: string };
  tokens: { [symbol: string]: TokenConfig };
  signer: string | null;
  modules: string[];
  initialized: boolean;
}

export interface BalanceInfo {
  amount: string;
  symbol: string;
  address: string;
  usdValue?: string;
}

export interface TransactionInfo {
  hash: string;
  from: string;
  to: string;
  value: string;
  gasUsed?: string;
  gasPrice?: string;
  status: number;
  timestamp: number;
}

export interface ModuleContext {
  contractManager: ContractManager;
  configManager: ConfigManager;
  provider: ethers.Provider;
  signer: ethers.Signer | null;
  client: DexClient;
}

export interface BaseModuleInterface {
  initialize(context: ModuleContext): void;
  getName(): string;
  getVersion(): string;
}

export declare class ConfigManager {
  constructor(configPath?: string);
  load(): Config;
  getConfig(): Config;
  getContracts(): ContractConfig;
  getContract(name: string): string;
  setContract(name: string, address: string): void;
  getTokens(): { [symbol: string]: TokenConfig };
  getToken(symbolOrAddress: string): TokenConfig;
  addToken(symbol: string, config: TokenConfig): void;
  isETH(address: string): boolean;
  validateAddress(address: string): boolean;
  getNetworkConfig(): NetworkConfig;
  save(): void;
  update(updates: Partial<Config>): void;
  static createDefault(outputPath: string): Config;
}

export declare class ContractManager {
  constructor(config: ConfigManager, provider: ethers.Provider, signer?: ethers.Signer);
  initialize(): Promise<void>;
  loadContract(name: string, address: string, abiPath?: string): Promise<ethers.Contract>;
  loadABI(contractName: string): any[];
  loadABIFromFile(filePath: string): any[];
  getContract(name: string): ethers.Contract;
  hasContract(name: string): boolean;
  addContract(name: string, address: string, abi: any[]): ethers.Contract;
  connectSigner(signer: ethers.Signer): Promise<void>;
  validateContract(name: string): Promise<{ name: string; address: string; isDeployed: boolean; network?: ethers.Network; error?: string }>;
  validateAllContracts(): Promise<Map<string, any>>;
  getContractAddress(name: string): string;
  getAllAddresses(): { [name: string]: string };
  estimateGas(contractName: string, methodName: string, args?: any[], options?: any): Promise<GasEstimate>;
  callMethod(contractName: string, methodName: string, args?: any[], options?: any): Promise<any>;
  getContractInfo(): { [name: string]: ContractInfo };
  clearCache(): void;
}

export declare class DexClient {
  constructor(config?: DexConfig);
  initialize(): Promise<void>;
  connectSigner(signer: ethers.Signer): Promise<void>;
  addModule(name: string, moduleInstance: BaseModuleInterface): void;
  getModule(name: string): BaseModuleInterface;
  hasModule(name: string): boolean;
  getSystemInfo(): Promise<SystemInfo>;
  getContract(name: string): Promise<ethers.Contract>;
  addContract(name: string, address: string, abiPath?: string): Promise<ethers.Contract>;
  callContract(contractName: string, methodName: string, args?: any[], options?: any): Promise<any>;
  estimateGas(contractName: string, methodName: string, args?: any[], options?: any): Promise<GasEstimate>;
  getConfig(): Config;
  updateConfig(updates: Partial<Config>): void;
  addToken(symbol: string, config: TokenConfig): void;
  getToken(symbolOrAddress: string): TokenConfig;
  validateContracts(): Promise<Map<string, any>>;
  getBalance(address: string, tokenAddress: string): Promise<bigint>;
  getUserAddress(): Promise<string>;
  executeModule(moduleName: string, methodName: string, ...args: any[]): Promise<any>;
  dispose(): void;
}

export declare class Validator {
  constructor(configManager?: ConfigManager);
  isValidAddress(address: string): boolean;
  isValidAmount(amount: string, decimals?: number): boolean;
  isValidSlippage(slippage: number): boolean;
  isValidToken(tokenAddress: string): boolean;
  isValidNetwork(chainId: number): boolean;
  validateSwapParams(params: SwapParams): ValidationResult;
  validateTransactionParams(params: TransactionParams): ValidationResult;
  validateTokenParams(params: TokenConfig): ValidationResult;
  validateBalance(balance: string, requiredAmount: string): ValidationResult;
  validateFilters(filters: any): ValidationResult;
  validateContractCall(params: { contractName: string; methodName: string; args?: any[] }): ValidationResult;
  validateId(id: string | number, type?: string): ValidationResult & { validId?: number };
  generateWarnings(params: any): string[];
  validateAll(params: any): ValidationResult;
}

export declare class Calculator {
  constructor();
  isValidAmount(amount: string | number, decimals?: number): boolean;
  applySlippage(amount: string | number, slippagePercent: number, isMinimum?: boolean): string;
  calculateAmountOut(amountIn: string | number, reserveIn: string | number, reserveOut: string | number, feePercent?: number): string;
  calculateAmountIn(amountOut: string | number, reserveIn: string | number, reserveOut: string | number, feePercent?: number): string;
  calculatePriceImpact(reserveIn: string | number, reserveOut: string | number, amountIn: string | number): number;
  calculateFee(amount: string | number, feePercent?: number): string;
  calculateNetAmount(amount: string | number, feePercent?: number): string;
  convertByPrice(amount: string | number, fromPrice: string | number, toPrice: string | number): string;
  calculatePercentChange(oldValue: string | number, newValue: string | number): number;
  calculateAverage(values: (string | number)[]): number;
  calculateWeightedAverage(values: (string | number)[], weights: (string | number)[]): number;
  formatFromWei(wei: bigint | string, decimals?: number): string;
  parseToWei(amount: string | number, decimals?: number): bigint;
  hasSufficientBalance(available: string | number, required: string | number, buffer?: number): boolean;
  normalizeAmount(amount: string | number, decimals?: number): string;
  safeDivide(numerator: number, denominator: number, defaultValue?: number): number;
  toSignificantDigits(value: number, digits?: number): string;
  clamp(value: string | number, min: number, max: number): number;
  calculateGasCost(gasUsed: string | number | bigint, gasPrice: string | number | bigint): string;
  isWithinTolerance(value1: string | number, value2: string | number, tolerancePercent?: number): boolean;
}

export declare class Formatter {
  constructor(configManager?: ConfigManager);
  formatToken(amount: string | number | bigint, tokenAddress: string, precision?: number): string;
  formatPrice(price: string | number | bigint, precision?: number): string;
  formatPercent(percent: string | number, precision?: number): string;
  formatAddress(address: string, length?: number): string;
  formatNumber(number: string | number, precision?: number): string;
  formatUSD(value: string | number, precision?: number): string;
  formatTime(timestamp: number): string;
  formatTimeUntil(timestamp: number): string;
  formatAge(timestamp: number): string;
  formatBytes(bytes: string | number): string;
  formatGas(gasUsed: string | number, gasPrice?: string | number): { gas: string; gasFormatted: string; cost?: string; costUSD?: string };
  formatStatus(status: boolean, trueText?: string, falseText?: string): string;
  formatChange(oldValue: number, newValue: number, includeColor?: boolean): string;
  getTokenSymbol(tokenAddress: string): string;
  formatTransactionHash(hash: string, length?: number): string;
  formatCompactNumber(number: string | number): string;
  createTable(data: any[], columns: string[]): string;
  formatBalance(balance: BalanceInfo | string | number, tokenAddress: string): string;
  formatTransaction(transaction: TransactionInfo): any;
  formatNetworkInfo(network: ethers.Network): any;
  formatError(error: any): string;
  toJSON(data: any, pretty?: boolean): string;
}

export declare class BaseModule implements BaseModuleInterface {
  protected context: ModuleContext;
  protected name: string;
  protected version: string;

  constructor(name: string, version?: string);
  initialize(context: ModuleContext): void;
  getName(): string;
  getVersion(): string;
  getContract(name: string): ethers.Contract;
  callContract(contractName: string, methodName: string, args?: any[], options?: any): Promise<any>;
  estimateGas(contractName: string, methodName: string, args?: any[], options?: any): Promise<GasEstimate>;
  validateParams(params: any, validationRules: any): ValidationResult;
  formatResult(result: any): any;
}

export declare const constants: {
  FEES: {
    DEFAULT_FEE_PERCENT: number;
    MAX_FEE_PERCENT: number;
    MIN_FEE_PERCENT: number;
  };
  TIMEOUTS: {
    TRANSACTION_TIMEOUT_MS: number;
    BLOCK_CONFIRMATION_TIMEOUT_MS: number;
    NETWORK_REQUEST_TIMEOUT_MS: number;
    RETRY_INTERVAL_MS: number;
  };
  LIMITS: {
    MAX_SLIPPAGE_PERCENT: number;
    MIN_SLIPPAGE_PERCENT: number;
    MIN_TRANSACTION_VALUE_USD: number;
    MAX_TRANSACTION_VALUE_USD: number;
    MAX_GAS_LIMIT: number;
    MIN_GAS_LIMIT: number;
    MAX_GAS_PRICE_GWEI: number;
    MAX_BATCH_SIZE: number;
    MAX_RETRY_ATTEMPTS: number;
  };
  PRECISION: {
    PRICE_DECIMALS: number;
    AMOUNT_DECIMALS: number;
    PERCENT_DECIMALS: number;
    GAS_DECIMALS: number;
    USD_DECIMALS: number;
    DEFAULT_TOKEN_DECIMALS: number;
  };
  ADDRESSES: {
    ZERO_ADDRESS: string;
    DEAD_ADDRESS: string;
  };
  NETWORKS: {
    [key: string]: NetworkConfig;
  };
  ERRORS: {
    [key: string]: string;
  };
  EVENTS: {
    [key: string]: string;
  };
  TOKEN_TYPES: {
    [key: string]: string;
  };
  TRANSACTION_TYPES: {
    [key: string]: string;
  };
  STATUS: {
    [key: string]: string;
  };
};

export declare function createClient(config?: DexConfig): DexClient;
export declare function createConfig(configPath?: string): ConfigManager;
export declare function createValidator(configManager?: ConfigManager): Validator;
export declare function createFormatter(configManager?: ConfigManager): Formatter;
export declare function createCalculator(): Calculator;

export declare const version: string;