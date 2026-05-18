import {StandardError} from "./standard-error.mjs"

export class Warning extends StandardError{
    constructor(message){
        super(message)
        this.name = this.constructor.name
    }

    static fromJSON(json) {
        return StandardError.__fromJSON(json, Warning)
    }
}