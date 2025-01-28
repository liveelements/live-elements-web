import StandardError from "./standard-error.mjs"

export default class PublicError extends StandardError{
    constructor(message, internal){
        super(message)
        this._internal = internal
        this.name = this.constructor.name
    }

    get internal(){ return this._internal }

    toJSON(){
        return super.toJSON(['message'])
    }

    static mask(error, message){
        if ( error instanceof PublicError ){
            return error
        } else {
             return new PublicError(message, error)
        }
    }

    static fromInternal(error){
        return new PublicError(error.message, error)
    }

    static fromJSON(json) {
        return StandardError.__fromJSON(json, PublicError)
    }
}