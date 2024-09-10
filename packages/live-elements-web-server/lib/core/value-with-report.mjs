import Warning from "./warning.mjs"

export default class ValueWithReport{
    constructor(result, report){
        this._value = result
        this._report = report || []
    }

    get value(){ return this._value }
    get report(){ return this._report }

    get errors(){ return this._report.filter(item => !(item instanceof Warning) ) }
    get warnings(){ return this._report.filter(item => item instanceof Warning) }

    get hasValue(){ return this._value !== undefined }
    get hasReport(){ return this._report && this._report.length > 0 }
    get hasErrors(){ return this.errors.length > 0 ? true : false }
    get hasWarning(){ return this.warnings.length > 0 ? true : false }

    static fromError(error){
        return new ValueWithReport(undefined, [error])
    }
    static fromErrors(errors){
        return new ValueWithReport(undefined, errors)
    }
    static fromValue(value){
        return new ValueWithReport(value, [])
    }

    static toSingleError(errors){
        return errors.length === 0
            ? null
            : errors.length === 1
                ? errors[0]
                : new Error('ErrorReport:' + JSON.stringify(errors.map(e => e.message)))
    }

    unwrapOrThrow(){
        const errors = this.errors
        if ( errors.length )
            throw ValueWithReport.toSingleError(errors)
        return this._value
    }

    unwrapAnd(cb){
        if ( this.hasReport )
            cb(this.errors, this.warnings)
        return this._value
    }
}