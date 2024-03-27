export class VirtualScript{
    constructor(location, content){
        this._location = location
        this._content = content
    }
    get location(){ return this._location }
    get content(){ return this._content }
}