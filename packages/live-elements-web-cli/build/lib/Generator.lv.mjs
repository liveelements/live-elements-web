import {BaseElement} from 'live-elements-core/baseelement.js'

export class Generator extends BaseElement{

    constructor(){
        super()
        Generator.prototype.__initialize.call(this)
    }
    __initialize(){
        BaseElement.addProperty(this, 'name', { type: "var", notify: "nameChanged" })
        BaseElement.addProperty(this, 'children', { type: "default", notify: "childrenChanged" })
        this.name = ''
    }

}

