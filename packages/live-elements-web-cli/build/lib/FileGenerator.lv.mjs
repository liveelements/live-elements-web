import {BaseElement} from 'live-elements-core/baseelement.js'
import {FileGeneratorInfo} from './FileGeneratorInfo.lv.mjs'

export class FileGenerator extends BaseElement{

    constructor(){
        super()
        FileGenerator.prototype.__initialize.call(this)
    }
    __initialize(){
        BaseElement.addProperty(this, 'name', { type: "var", notify: "nameChanged" })
        BaseElement.addProperty(this, 'children', { type: "default", notify: "childrenChanged" })
        this.name = ''
    }

    captureContent(info){
        if ( this.children.length === 0 )
            return ''

        var content = ''
        for ( var i = 0; i < this.children.length; ++i ){
            if ( this.children[i] instanceof FileGeneratorInfo ){
                this.children[i].evaluateContent(info)
            }
            var fileContent = this.children[i]
            content += fileContent.content
        }
        
        return content
    }
}

