import StandardError from "./standard-error.mjs"

export default class RequestError extends StandardError{
    constructor(request, internal){
        const url = request.originalUrl
        const method = request.method.toUpperCase()
        super(`${method} ${url}`)

        this.url = url
        this.method = method
        this.name = this.constructor.name
        this._internal = internal
    }

    get internal(){ return this._internal }

    static wrap(request, error){
        return new RequestError(request, error)
    }

    static fromJSON(json){
        return StandardError.__fromJSON(json, RequestError)
    }

    toString(){
        return `${this.name}: ${this.message}: \n  ${StandardError.errorToString(this.internal)}`
    }
}