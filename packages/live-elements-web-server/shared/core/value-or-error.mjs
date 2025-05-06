import StandardError from "../errors/standard-error.mjs";

export default class ValueOrError{
    constructor(value, error){
        this._value = value
        this._error = error
    }

    get value(){ return this._value }
    get error(){ return this._error }

    get hasValue(){ return this._value !== undefined }
    get hasError(){ return this._error !== undefined }

    unwrapOrThrow(){
        if ( this._error ){
            throw this._error
        }
        return this._value
    }

    unwrapAnd(cb){
        if ( this._error ){
            cb(this._error)
        }
        return this._value
    }

    match(valCb, errCb){
        if ( this._value ){
            return valCb(this._value)
        } else if ( this._error ){
            return errCb(this._error)
        }
    }

    toJSON(valueCb, errorCb){
        if ( this._value ){
            return valueCb 
                ? { value: valueCb(this._value ) }
                : { value: this._value }
        } else {
            return errorCb
                ? { error: errorCb(this._error) }
                : { error: this._error instanceof StandardError ? this._error.toJSON() : this._error.message }
        }
    }

    static errorObject(error){
        return { error: error instanceof StandardError ? error.toJSON() : error.message }
    }
    static valueObject(value){
        return { value: value }
    }

    static fromError(error){
        return new ValueOrError(undefined, error)
    }
    static fromValue(value){
        return new ValueOrError(value, undefined)
    }

    static fromJSON(ob, valueCb, errorCb){
        if ( ob.hasOwnProperty('value') ){
            return valueCb
                ? new ValueOrError(valueCb(ob.value))
                : new ValueOrError(ob.value)
        } else if ( ob.hasOwnProperty('error') ){
            return errorCb
                ? new ValueOrError(undefined, errorCb(ob.error))
                : new ValueOrError(undefined, ob.error)
        }
        return new ValueOrError(undefined, new Error('ValueOrError: Object missing value or error key.'))
    }
}

ValueOrError.eob = ValueOrError.errorObject
ValueOrError.vob = ValueOrError.valueObject