import StandardError from "./standard-error.mjs"

export default class SourceError extends StandardError{
    constructor(message, sourceFile, sourceLine, sourceColumn){
        super(message)
        this.name = SourceError.constructor.name
        this._sourceFile = sourceFile
        this._sourceLine = sourceLine
        this._sourceColumn = sourceColumn
    }

    get sourceFile(){ return this._sourceFile }
    get sourceLine(){ return this._sourceLine }
    get sourceColumn(){ return this._sourceColumn }

    toJSON(...fields){
        const result = super.toJSON(...fields)
        result.sourceFile = this._sourceFile
        result.sourceLine = this._sourceLine
        result.sourceColumn = this._sourceColumn
        return result
    }

    static __fromJSON(json, cls){
        const error = new cls(json.message ? json.message : '')
        error.name = json.name
        error._sourceFile = json.sourceFile
        error._sourceLine = json.sourceLine
        error._sourceColumn = json.sourceColumn
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

    static fromJSON(json){
        return SourceError.__fromJSON(json, SourceError)
    }
}