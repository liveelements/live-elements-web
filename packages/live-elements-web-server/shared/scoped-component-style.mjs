export default class ScopedComponentStyle{
    constructor(src, process){
        this._src = src
        this._process = process
        this._resolved = {}
    }

    get src(){ return this._src }
    get process(){ return this._process }
    get resolved(){ return this._resolved }

    toJSON(){
        return {
            _ : 's',
            src: this._src,
            process: this._process
        }
    }

    toString(indt){
        return `${' '.repeat(indt)}S:${this._src}[${this._process}]`
    }
}