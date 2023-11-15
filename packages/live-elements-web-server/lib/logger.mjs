import fs from 'fs'

export default class Logger{

    constructor(name, opts){
        this._name = name
        this._parent = opts.parent || null
        this._children = []
        this._configPrefix = []
        this._configPrefixDecorated = null
        this._configLevel = null
        this._configTransports = null

        if ( this._parent )
            this._parent._children.push(this)
        this.configure(opts)
    }

    configure(opts){
        this._configPrefix = opts.prefix || this._configPrefix
        this._configPrefixCache = this._configPrefix
        this._configPrefixDecorated = opts.prefixDecorated || this._configPrefixDecorated || this._configPrefix
        this._configPrefixDecoratedCache = this._configPrefixDecorated
        this._configLevel = opts.level || this._configLevel
        this._configTransports = opts.transports || this._configTransports
        this.updateConfiguration()
    }

    updateConfiguration(){
        this._level = this._configLevel || (this._parent ? this._parent.level : Logger.Info)
        if ( this._parent ){
            this._configPrefixCache = this._parent.mergeChildPrefix(this._configPrefix)
            this._configPrefixDecoratedCache = this._parent.mergeChildDecoratedPrefix(this._configPrefixDecorated)
        }
        this._prefix = this._configPrefixCache.filter(c => !Array.isArray(c) )
        this._prefixDecorated = this._configPrefixDecoratedCache.filter(c => !Array.isArray(c) )

        this._transports = []
        if ( this._configTransports ){
            this._transports = this._configTransports.map(createFn => createFn())
        } else if ( this._parent ){
            this._transports = this._parent.transports
        }

        for ( let i = 0; i < this._children.length; ++i )
            this._children[i].updateConfiguration()
    }

    get name(){ return this._name }
    get transports(){ return this._transports }

    static currentLevel(data){
        switch (data.level){
            case Logger.Verbose: return 'verbose'
            case Logger.Debug: return 'debug'
            case Logger.Info: return 'info'
            case Logger.Warning: return 'warning'
            case Logger.Error: return 'error'
        }
        return ''
    }

    static currentDateTimeToISO(){
        return (new Date()).toISOString()
    }

    mergePrefix(parentPrefix, prefix){
        for ( let i = 0; i < parentPrefix.length; ++i ){
            if ( Array.isArray(parentPrefix[i]) ){
                return parentPrefix.slice(0, i).concat(prefix).concat(parentPrefix.slice(i + 1))
            }
        }
        return parentPrefix.concat(prefix)
    }

    mergeChildPrefix(prefix){
        return this.mergePrefix(this._configPrefixCache, prefix)
    }

    mergeChildDecoratedPrefix(prefix){
        return this.mergePrefix(this._configPrefixDecoratedCache, prefix)
    }

    capturePrefix(data, parts){
        return parts.map(part => (typeof part === 'function' ? part(data) : part)).join('')
    }

    _log(level, message){
        if ( level < this._level )
            return

        const globalPrefix = this.capturePrefix({level: level }, this._prefix)
        const decoratedPrefix = this.capturePrefix({ level: level }, this._prefixDecorated)
        for ( let i = 0; i < this._transports.length; ++i ){
            const transport = this._transports[i]
            if ( transport.isDecorated ){
                transport[level](decoratedPrefix, message)
            } else {
                transport[level](globalPrefix, message)
            }
        }
    }

    decorated(level, message){
        if ( level < this._level )
            return

        const decoratedPrefix = this.capturePrefix({ level: level }, this._prefixDecorated)
        for ( let i = 0; i < this._transports.length; ++i ){
            const transport = this._transports[i]
            if ( transport.isDecorated ){
                transport[level](decoratedPrefix, message)
            }
        }
    }

    colorless(level, message){
        if ( level < this._level )
            return
        
        const prefix = this.capturePrefix({ level: level }, this._prefix)
        for ( let i = 0; i < this._transports.length; ++i ){
            const transport = this._transports[i]
            if ( !transport.isDecorated ){
                transport[level](prefix, message)
            }
        }
    }

    v(message){ this._log('v', message) }
    d(message){ this._log('d', message) }
    i(message){ this._log('i', message) }
    w(message){ this._log('w', message) }
    e(message){ this._log('e', message) }
}

Logger.Verbose = 0
Logger.Debug = 1
Logger.Info = 2
Logger.Warning = 3
Logger.Error = 4

Logger.Transport = class LoggerTransport{
    constructor(opts){ 
        this.isDecorated = opts.isDecorated || false
    }
    v(){ this.notImplemented('v') }
    d(){ this.notImplemented('d') }
    w(){ this.notImplemented('w') }
    i(){ this.notImplemented('i') }
    e(){ this.notImplemented('e') }
    close(){}
    notImplemented(v){ 
        throw new Error(`Logger.Transport: Method '${v}' not implemened for transport: ${this.constructor.name}`)
    }
}

class LoggerConsole extends Logger.Transport{
    constructor(_opts){
        super({ isDecorated: true })
    }

    get decoratedPrefix(){ return true }
    get prefix(){ return this._prefix }

    static create(opts){
        return new LoggerConsole(opts)
    }

    close(){}
    v(prefix, message){ console.log(prefix, message) }
    d(prefix, message){ console.log(prefix, message) }
    i(prefix, message){ console.log(prefix, message) }
    w(prefix, message){ console.warn(prefix, message) }
    e(prefix, message){ console.error(prefix, message) }
}

class LoggerFile extends Logger.Transport {
    constructor(opts) {
        super({isDecorated: false})
        this._stream = fs.createWriteStream(opts.filePath, { flags: 'a' });
    }

    static create(opts) {
        return new LoggerFile(opts);
    }

    _logToFile(prefix, message) {
        this._stream.write(prefix + message + '\n')
    }

    v(prefix, message) { this._logToFile(prefix, message) }
    d(prefix, message) { this._logToFile(prefix, message) }
    i(prefix, message) { this._logToFile(prefix, message) }
    w(prefix, message) { this._logToFile(prefix, message) }
    e(prefix, message) { this._logToFile(prefix, message) }
    close(){ this._stream.close() }
}

Logger.To = {
    Console : LoggerConsole,
    File: LoggerFile
}




