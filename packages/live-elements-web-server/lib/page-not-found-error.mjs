
export default class PageNotFoundError extends Error{
    constructor(url) {
        super(`Page not found: ${url}`)
        this.name = this.constructor.name
        this._url = url
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, PageNotFoundError)
        }
    }
    get url(){ return this._url }
  }