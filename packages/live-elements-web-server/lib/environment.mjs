import Logger from "./logger.mjs"

/**
 * @class
 * 
 * @example
 * // Setting up the environment
 * Environment.setup();
 * 
 * @example
 * // Defining loggers with custom configurations
 * const mainLog = Environment.defineLogger('main', {
 *     prefix: ['[', Logger.currentDateTimeToISO, ']', []],
 *     prefixDecorated: [currentDateTimeDecorated, '', []],
 *     level: Logger.Info
 * });
 * const serverLog = Environment.defineLogger('server', {
 *     prefix: ['[Server]'],
 *     prefixDecorated: [chalk.cyan('[Server'), [], chalk.cyan(']')],
 *     parent: mainLog
 * });
 * const webpackLog = Environment.defineLogger('webpack', {
 *     prefix: ['[Webpack]'],
 *     prefixDecorated: [chalk.cyan('.Webpack')],
 *     parent: serverLog
 * });
 * 
 * 
 * @example
 * // Logging with the defined loggers
 * serverLog.i('from server ');
 * webpackLog.decorated('i', chalk.grey('from webpack'));
 * webpackLog.colorless('i', 'from webpack');
 * Environment.log.server.i('info');
 * Environment.log.server.e('error');
 * Environment.log.server.i('server info');
 * const slog = Environment.log.server;
 * slog.i('info');
 * log.server.i('info');
 */
class Environment{

    constructor(_opts){
    }
  
    static setup(opts){
        if (!Environment.__instance) {
            Environment.__instance = new Environment(opts)
        } else {
            throw new Error("Environment is already initialized.")
        }
    }

    static defineLogger(name, opts){
        if ( opts.parent && typeof opts.parent === 'string' ){
            const parent = Environment.logger(opts.parent)
            const modifiedOpts = {...opts}
            modifiedOpts.parent = parent
            const logger = new Logger(name, modifiedOpts)
            Environment.addLogger(logger)
            return logger
        } else {
            const logger = new Logger(name, opts)
            Environment.addLogger(logger)
            return logger
        }
    }

    static configureLogger(name, opts){
        const logger = Environment.logger(name)
        logger.configure(opts)
    }
  
    static addLogger(logger) {
        if ( Environment.__loggers.hasOwnProperty(logger) ){
            throw new Error(`Environemnt: Logger name already exists: ${logger}`)
        }
        Environment.__loggers[logger.name] = logger
    }
  
    static logger(name) {
        if (!Environment.__instance) {
            throw new Error("Environment not initialized. Please run setup first.");
        }
        return Environment.__loggers[name]
    }
  
    static get log() {
        if (!Environment.__logProxy) {
            Environment.__logProxy = new Proxy({}, {
                get: function(_, name) {
                    return Environment.logger(name);
                }
            })
        }
        return Environment.__logProxy
    }
}

const log = Environment.log
Environment.__loggers = {}
Environment.__instance = null
Environment.__logProxy = null


export { log, Environment }