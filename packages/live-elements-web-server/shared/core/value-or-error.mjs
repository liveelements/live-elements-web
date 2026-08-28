import {StandardError} from "../errors/standard-error.mjs";
import { TypeCodec } from 'live-elements-core/type-codec.mjs'
import { Type } from 'live-elements-core/types.mjs'

export class ValueOrError{
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
        if ( this._value !== undefined ){
            return valCb(this._value)
        } else if ( this._error !== undefined ){
            return errCb(this._error)
        }
        return undefined
    }

    toJSON(valueCb, errorCb){
        if (arguments.length === 0) {
            return this._value !== undefined
                ? { value: TypeCodec.encode(this._value) }
                : { error: TypeCodec.encode(this._error) }
        }
        if ( this._value !== undefined ){
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
        if (arguments.length >= 2 && valueCb && typeof valueCb === 'object') {
            const type = valueCb
            const typeLookup = arguments[2] ?? null
            const valueType = type?.params?.[0]
            if ( ob.hasOwnProperty('value') ){
                return new ValueOrError(TypeCodec.decode(ob.value, valueType, typeLookup))
            } else if ( ob.hasOwnProperty('error') ){
                return new ValueOrError(undefined, TypeCodec.decode(ob.error, Type.for(Error), typeLookup))
            }
            return new ValueOrError(undefined, new Error('ValueOrError: Object missing value or error key.'))
        }
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
export { ValueOrError as VE }
