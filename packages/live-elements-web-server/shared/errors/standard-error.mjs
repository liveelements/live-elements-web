export default class StandardError extends Error{
    constructor(message){
        super(message)
        this.name = this.constructor.name
    }

    toJSON(...fields){
        if (fields.length === 0) {
            const result = {
                name: this.name,
                message: this.message,
                stack: this.stack
            }
            if ( this.fileName ){
                result['location'] = {
                    file: this.fileName,
                    line: this.lineNumber,
                    column: this.column
                }
            }
            return result
        }

        const result = { name: this.name }
        if (fields.includes(StandardError.Field.Message)) {
            result['message'] = this.message
        }
        if (fields.includes(StandardError.Field.Stack)) {
            result['stack'] = this.stack
        }
        if (fields.includes(StandardError.Location) && this.fileName) {
            result['location'] = {
                file: this.fileName,
                line: this.lineNumber,
                column: this.column
            }
        }

        return result;
    }

    toString(){
        return `${this.name}: ${this.message}\n${this.stackToString()}`;
    }

    stackToString(){
        return this.stack.split("\n").slice(1).join("\n")
    }

    static __fromJSON(json, cls){
        const error = new cls(json.message ? json.message : '')
        error.name = json.name
        if ( json.stack ){
            error.stack = json.stack
        }
        if ( json.location ){
            error.fileName = json.location.file
            error.lineNumber = json.location.line
            error.column = json.location.file
        }

        return error
    }

    static fromJSON(json) {
        return StandardError.__fromJSON(json, StandardError)
    }

    static errorToString(e){
        return e instanceof StandardError
            ? e.toString()
            : `${e.name}: ${e.message}\n${e.stack ? e.stack.split("\n").slice(1).join("\n") : ''}`;
    }
}

StandardError.Field = {
    Message: 1,
    Stack: 2,
    Location: 3
}

