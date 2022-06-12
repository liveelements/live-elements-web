import {BaseElement} from 'live-elements-core/baseelement.js'

export class FileGeneratorInfo extends BaseElement{

    constructor(key){
        super()
        FileGeneratorInfo.prototype.__initialize.call(this)
        this.key = key
    }
    __initialize(){
        BaseElement.addProperty(this, 'key', { type: "var", notify: "keyChanged" })
        BaseElement.addProperty(this, 'content', { type: "var", notify: "contentChanged" })
        this.key = ''
        this.content = ''
    }

    evaluateContent(info){
        if ( info.hasOwnProperty(this.key) ){
            this.content = info[this.key]
        }
    }
}

