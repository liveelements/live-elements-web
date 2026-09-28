import { ValueOrError } from '../../shared/core/value-or-error.mjs'
import { PublicError } from '../../shared/errors/public-error.mjs'

export default class APIResponse {
    constructor(status, body, headers = {}, cookies = [], internal = null) {
        this.status = status
        this.body = body
        this.headers = headers
        this.cookies = cookies
        Object.defineProperty(this, 'internal', {
            value: internal,
            writable: true,
            configurable: true,
            enumerable: false
        })
    }

    static ok(body, options = {}) {
        return new APIResponse(200, body, options.headers, options.cookies)
    }

    static created(body, options = {}) {
        return new APIResponse(201, body, options.headers, options.cookies)
    }

    static noContent(options = {}) {
        return new APIResponse(204, undefined, options.headers, options.cookies)
    }

    static error(status, body, options = {}) {
        return new APIResponse(status, body, options.headers, options.cookies, options.internal)
    }

    static errorValue(status, valueOrError, options = {}) {
        if ( !valueOrError || typeof valueOrError.toJSON !== 'function' ) {
            throw new Error('APIResponse.errorValue requires a ValueOrError object.')
        }
        return new APIResponse(status, valueOrError.toJSON(), options.headers, options.cookies, valueOrError)
    }

    static fromError(error, message) {
        const publicError = PublicError.mask(error, message)
        const status = typeof publicError.code === 'number' ? publicError.code : 500
        return APIResponse.errorValue(status, ValueOrError.fromError(publicError))
    }

    static redirect(location, options = {}) {
        return new APIResponse(
            302,
            undefined,
            { ...(options.headers || {}), Location: location },
            options.cookies
        )
    }

    static content(status, body, contentType, options = {}) {
        const response = new APIResponse(status, body, options.headers, options.cookies)
        response.contentType = contentType
        return response
    }
}
