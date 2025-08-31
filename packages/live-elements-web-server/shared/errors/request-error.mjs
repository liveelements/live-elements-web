import StandardError from "./standard-error.mjs"

export default class RequestError extends StandardError{
    constructor(request, internal, options){
        const url = request.originalUrl
        const method = request.method.toUpperCase()

        const hide = options && options.hasOwnProperty('hide') ? options['hide'] : null
        const body = request.body && hide !== '*'
            ? ( !hide 
                ? Object.entries(request.body).map(([k,v]) => `${k}:${JSON.stringify(v)}`).join(',')
                : Object.entries(request.body).map(([k,v]) => {
                    return hide.includes(k) ? `${k}:#` : `${k}:${JSON.stringify(v)}`
                }).filter(v => v).join(',')
            )
            : ''

        super(`${method} ${url}`)

        this.url = url
        this.method = method
        this.name = this.constructor.name
        this.body = body
        
        this._internal = internal
    }

    get internal(){ return this._internal }

    static wrap(request, error, options){
        return new RequestError(request, error, options)
    }

    static fromJSON(json){
        return StandardError.__fromJSON(json, RequestError)
    }

    toString(){
        return `${this.name}: ${this.message}: \n ${this.body ? '   Body:' + this.body + ';\n' : ''} ${StandardError.errorToString(this.internal)}`
    }
}