import { BaseElement } from "live-elements-core/baseelement.js"
import ScopedAssignment from '../shared/scoped-assignment.mjs'

class DOMBehaviorTarget{
    constructor(dom){ this.dom = dom }
    on(name, value){
        if ( name !== 'domReady' )
            this.dom[name] = value
    }
}

export default function attach(moduleImport, name, dom, assignmentStructure){
    moduleImport.then(module => {
        const c = module[name]
        if ( c.use && assignmentStructure && c.use.length === assignmentStructure.length){
            for ( let i = 0; i < c.use.length; ++i ){
                const use = c.use[i]
                const assignment = assignmentStructure[i]
                ScopedAssignment.populateViewComponentStyles(assignment, use, false)
            }
        }
        const attachment = new c()
        attachment.target = new DOMBehaviorTarget(dom)
        BaseElement.complete(attachment)
    })
}