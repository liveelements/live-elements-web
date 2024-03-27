
export default class ResultWithReport{
    constructor(result, report){
        this._value = result
        this._report = report
    }

    get value(){ return this._value }
    get report(){ return this._report }
    get hasReport(){ return this._report && this._report.length > 0 }

    unwrapAnd(cb){
        if ( this.hasReport )
            cb(this.report)
        return this._value
    }
}