import StandardError from "./standard-error.mjs"

export default class TraceError extends StandardError{
    constructor(message, source){
        super(message)
        this._source = source
        this.name = StandardError.constructor.name
    }

    get source(){ return this._source }

    toJSON(...fields){
        const result = super.toJSON(...fields)
        result.source = this._source.toJSON(...fields)
        return result
    }

    static __fromJSON(json, classes, cls){
        const sourceCls = classes.find(c => c.name === json.source.name)
        const error = new cls(
            json.message ? json.message : '',
            sourceCls ? sourceCls.fromJSON(json.source, classes) : null
        )
        if ( json.stack ){
            error.stack = json.stack
        }
        if ( json.location ){
            error.fileName = json.location.file
            error.lineNumber = json.location.line
            error.column = json.location.file
        }

        return error
    }
    
    static fromJSON(json, classes) {
        return TraceError.__fromJSON(json, classes, TraceError)
    }
}