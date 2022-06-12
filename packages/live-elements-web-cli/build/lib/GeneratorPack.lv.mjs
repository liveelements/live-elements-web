import {BaseElement} from 'live-elements-core/baseelement.js'

export class GeneratorPack extends BaseElement{

    constructor(){
        super()
        GeneratorPack.prototype.__initialize.call(this)
    }
    __initialize(){
        BaseElement.addProperty(this, 'name', { type: "var", notify: "nameChanged" })
        BaseElement.addProperty(this, 'children', { type: "default", notify: "childrenChanged" })
        this.name = ''
    }

}

