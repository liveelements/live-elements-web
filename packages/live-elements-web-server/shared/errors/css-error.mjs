import SourceError from "./source-error.mjs";

export default class CSSError extends SourceError{

    constructor(message, sourceFile, sourceLine, sourceColumn){
        super(message, sourceFile, sourceLine, sourceColumn)
        this.name = this.constructor.name
    }

    static fromJSON(json){
        return SourceError.__fromJSON(json, CSSError)
    }
}