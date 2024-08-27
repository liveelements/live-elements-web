import { BaseElement } from "live-elements-core/baseelement.js"

class DOMBehaviorTarget{
    constructor(dom){ this.dom = dom }
    on(name, value){
        if ( name !== 'domReady' )
            this.dom[name] = value
    }
}

export default function attach(moduleImport, name, dom){
    moduleImport.then(module => {
        const c = module[name]
        const attachment = new c()
        attachment.target = new DOMBehaviorTarget(dom)
        BaseElement.complete(attachment)
    })
}