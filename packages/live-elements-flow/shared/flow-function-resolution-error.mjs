import { StandardError } from 'live-elements-web-server/shared/errors/standard-error.mjs'

export class FlowFunctionResolutionError extends StandardError {
    constructor(message, options = {}) {
        super(message)
        this.cause = options.cause
        this.functionId = options.functionId
    }
}
