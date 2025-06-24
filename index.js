const DexClient = require('./core/DexClient');
const ConfigManager = require('./core/ConfigManager');
const ContractManager = require('./core/ContractManager');

// Core modules
const RouterModule = require('./modules/RouterModule');
const PoolModule = require('./modules/PoolModule');
const TradingModule = require('./modules/TradingModule');
const OracleModule = require('./modules/OracleModule');
const GovernanceModule = require('./modules/GovernanceModule');
const EventModule = require('./modules/EventModule');
const KeeperModule = require('./modules/KeeperModule');

// Utilities
const Formatter = require('./utils/Formatter');
const Calculator = require('./utils/Calculator');
const Validator = require('./utils/Validator');
const ContractHelpers = require('./utils/ContractHelpers');
const ValidationHelpers = require('./utils/ValidationHelpers');
const constants = require('./utils/constants');

module.exports = {
   // Core classes
   DexClient,
   ConfigManager,
   ContractManager,

   // Trading modules
   modules: {
       RouterModule,
       PoolModule,
       TradingModule,
       OracleModule,
       GovernanceModule,
       EventModule,
       KeeperModule
   },

   // Utilities
   utils: {
       Formatter,
       Calculator,
       Validator,
       ContractHelpers,
       ValidationHelpers,
       constants
   },

   // Factory functions
   createClient: (config) => new DexClient(config),
   createConfig: (configPath) => new ConfigManager(configPath),
   createValidator: (configManager) => new Validator(configManager),
   createFormatter: (configManager) => new Formatter(configManager),
   createCalculator: () => new Calculator(),

   // Module factories
   createRouter: (context) => {
       const router = new RouterModule();
       router.initialize(context);
       return router;
   },

   createPool: (context) => {
       const pool = new PoolModule();
       pool.initialize(context);
       return pool;
   },

   createTrading: (context) => {
       const trading = new TradingModule();
       trading.initialize(context);
       return trading;
   },

   createOracle: (context) => {
       const oracle = new OracleModule();
       oracle.initialize(context);
       return oracle;
   },

   createGovernance: (context) => {
       const governance = new GovernanceModule();
       governance.initialize(context);
       return governance;
   },

   createEvents: (context) => {
       const events = new EventModule();
       events.initialize(context);
       return events;
   },

   createKeeper: (context) => {
       const keeper = new KeeperModule();
       keeper.initialize(context);
       return keeper;
   },

   // Complete SDK factory
   createSDK: async (config) => {
       const client = new DexClient(config);
       await client.initialize();

       const context = {
           provider: client.provider,
           signer: client.signer,
           contractManager: client.contractManager,
           configManager: client.configManager,
           logger: client.logger
       };

       const router = new RouterModule();
       router.initialize(context);

       const pool = new PoolModule();
       pool.initialize(context);

       const trading = new TradingModule();
       trading.initialize(context);

       const oracle = new OracleModule();
       oracle.initialize(context);

       const governance = new GovernanceModule();
       governance.initialize(context);

       const events = new EventModule();
       events.initialize(context);

       const keeper = new KeeperModule();
       keeper.initialize(context);

       return {
           client,
           router,
           pool,
           trading,
           oracle,
           governance,
           events,
           keeper,
           utils: {
               formatter: new Formatter(client.configManager),
               calculator: new Calculator(),
               validator: new Validator(client.configManager),
               contractHelpers: ContractHelpers,
               validationHelpers: ValidationHelpers
           },
           context
       };
   },

   version: '2.1.0'
};