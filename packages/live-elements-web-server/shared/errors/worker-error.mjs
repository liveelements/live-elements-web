import TraceError from "./trace-error.mjs";

export default class WorkerError extends TraceError{
    constructor(message, source){
        super(message, source)
        this.name = this.constructor.name
    }

    static fromJSON(json, errors) {
        return TraceError.__fromJSON(json, errors, WorkerError)
    }
}