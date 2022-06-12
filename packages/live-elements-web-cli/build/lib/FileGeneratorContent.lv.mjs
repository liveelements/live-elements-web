import {BaseElement} from 'live-elements-core/baseelement.js'

export class FileGeneratorContent extends BaseElement{

    constructor(content){
        super()
        FileGeneratorContent.prototype.__initialize.call(this)
        this.content = content
    }
    __initialize(){
        BaseElement.addProperty(this, 'content', { type: "var", notify: "contentChanged" })
        this.content = ''
    }

}

