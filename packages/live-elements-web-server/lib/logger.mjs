import fs from 'fs'
import path from 'path'
import StandardError from '../shared/errors/standard-error.mjs'

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
        this._level = this._configLevel || (this._parent ? this._parent._level : Logger.Info)
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

    static currentLevel(data){ return Logger.Prefix.levelString(data) }
    static currentLevelSymbol(data){ return Logger.Prefix.levelSymbol(data) }
    static currentLevelSymbolUpper(data){ return Logger.Prefix.levelSymbolUpper(data) }
    static currentDateToISO(data){ return Logger.Prefix.formatDateYMD(Logger.Prefix.stamp(data)) }
    static currentDateTimeToISO(data){ return Logger.Prefix.stamp(data).toISOString() }

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

    _log(level, levelSymbol, message){
        if ( level < this._level )
            return

        const globalPrefix = this.capturePrefix({level: levelSymbol}, this._prefix)
        const decoratedPrefix = this.capturePrefix({level: levelSymbol}, this._prefixDecorated)

        for ( let i = 0; i < this._transports.length; ++i ){
            const transport = this._transports[i]
            if ( transport.isDecorated ){
                transport[levelSymbol](decoratedPrefix, message)
            } else {
                transport[levelSymbol](globalPrefix, message)
            }
        }
    }

    decorated(level, message){
        if ( Logger.levelFromSymbol(level) < this._level )
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
        if ( Logger.levelFromSymbol(level) < this._level )
            return
        
        const prefix = this.capturePrefix({ level: level }, this._prefix)
        for ( let i = 0; i < this._transports.length; ++i ){
            const transport = this._transports[i]
            if ( !transport.isDecorated ){
                transport[level](prefix, message)
            }
        }
    }

    static parsePrefix(s, replacements){
        const regex = /\{(\w+)\}|([^${}]+)/g
        const values = replacements ? replacements : Logger.ParsePrefixValues
        const segments = []
        let match;
        while ((match = regex.exec(s)) !== null) {
            if (match[1]) {
                segments.push(values.hasOwnProperty(match[1]) ? values[match[1]] : match[1]);
            } else if (match[2]) {
                segments.push(match[2]);
            }
        }
        return segments
    }

    static expandPrefix(data, parts){
        return parts.map(part => (typeof part === 'function' ? part(data) : part)).join('')
    }

    static levelFromSymbol(s){
        switch (s.toLowerCase()){
            case 'v': return Logger.Verbose
            case 'd': return Logger.Debug
            case 'i': return Logger.Info
            case 'w': return Logger.Warning
            case 'e': return Logger.Error
        }
        return Logger.Info
    }

    v(message){ this._log(Logger.Verbose, 'v', message) }
    d(message){ this._log(Logger.Debug, 'd', message) }
    i(message){ this._log(Logger.Info, 'i', message) }
    w(message){ this._log(Logger.Warning, 'w', message) }
    e(message){ this._log(Logger.Error, 'e', message) }
}

Logger.Verbose = 0
Logger.Debug = 1
Logger.Info = 2
Logger.Warning = 3
Logger.Error = 4

Logger.Prefix = class LoggerPrefix{
    static create(levelSymbol){
        return {level: levelSymbol}
    }
    static level(data){
        switch (data.level){
            case 'v': return Logger.Verbose
            case 'd': return Logger.Debug
            case 'i': return Logger.Info
            case 'w': return Logger.Warning
            case 'e': return Logger.Error
        }
        return null
    }
    static levelSymbol(data){
        return data.level
    }
    static levelSymbolUpper(data){
        return data.level.toUpperCase()
    }
    static levelString(data){
        switch (data.level){
            case 'v': return 'verbose'
            case 'd': return 'debug'
            case 'i': return 'info'
            case 'w': return 'warning'
            case 'e': return 'error'
        }
        return ''
    }
    static stamp(data){
        if ( !data.hasOwnProperty('stamp') ){
            const d = new Date()
            data.stamp = d
            return d
        }
        return data.stamp
    }

    static formatDateYMD(date){
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    }
}

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
        if ( !opts ){
            throw new StandardError(`LoggerFile requires configuration parameter of type { filePath: '' }.`)
        }
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


class LoggerFileRotation extends Logger.Transport {
    constructor(opts) {
        super({isDecorated: false})
        this._filePathTemplate = Logger.parsePrefix(opts.filePath)
        this._retentionDays = opts.retentionDays || 7
        this._currentDate = new Date()
        this._filePathDir = path.dirname(this._logPath())
        if ( !fs.existsSync(this._filePathDir) ){
            fs.mkdirSync(this._filePathDir, { recursive: true })
        }

        this._updateFileStream()
    }

    static create(opts) {
        return new LoggerFileRotation(opts)
    }

    _logPath(){
        return Logger.expandPrefix({stamp: this._currentDate}, this._filePathTemplate)
    }

    _updateFileStream() {
        if (this._stream) {
            this._stream.end()
        }
        
        const logFilePath = this._logPath()
        this._stream = fs.createWriteStream(logFilePath, { flags: 'a' })

        this._cleanupOldLogs()
    }

    _cleanupOldLogs() {
        const logDir = this._filePathDir
        const retentionThreshold = new Date()
        retentionThreshold.setDate(retentionThreshold.getDate() - this._retentionDays)

        fs.readdir(logDir, (err, files) => {
            if (err) 
                return console.error(`Failed to read log directory: ${err}`)

            files.forEach(file => {
                const match = file.match(/\d{4}-\d{2}-\d{2}/)
                if (match) {
                    const fileDate = new Date(match[0])
                    if (fileDate.getTime() < retentionThreshold.getTime()) {
                        const filePath = path.join(logDir, file)
                        const filePathTemplate = Logger.expandPrefix({stamp: fileDate}, this._filePathTemplate)
                        if ( filePathTemplate.endsWith(file) ){
                            fs.unlink(filePath, err => {
                                if (err) 
                                    console.error(`Failed to delete old log: ${filePath}`)
                            })
                        }
                    }
                }
            })
        })
    }

    static areDaysEqual(date1, date2){
        return (
            date1.getFullYear() === date2.getFullYear() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getDate() === date2.getDate()
        )
    }

    _logToFile(prefix, message) {
        const newDate = new Date()
        if ( !LoggerFileRotation.areDaysEqual(newDate, this._currentDate) ){
            this._currentDate = newDate
            this._updateFileStream()
        }
        this._stream.write(`${prefix}${message}\n`)
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
    File: LoggerFile,
    FileRotation: LoggerFileRotation
}

Logger.ParsePrefixValues = {
    date: Logger.currentDateToISO,
    stamp: Logger.currentDateTimeToISO,
    level: Logger.currentLevel,
    l: Logger.currentLevelSymbol,
    L: Logger.currentLevelSymbolUpper
}