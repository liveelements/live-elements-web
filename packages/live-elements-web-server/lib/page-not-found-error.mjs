
export default class PageNotFoundError extends Error{

    constructor(url, recommendedAction = {}, message) {
        super(message || `Page not found: ${url}`)
        this.name = this.constructor.name
        this._url = url

        this._recommendedAction = {
            type: recommendedAction.type || PageNotFoundError.Actions.Show404Page,
            to: recommendedAction.to || null
        };

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }

    get recommendedAction(){ return this._recommendedAction }

    get url() {
        return this._url;
    }
}

PageNotFoundError.Actions = {
    Show404Page: 0,
    Redirect:    1
}