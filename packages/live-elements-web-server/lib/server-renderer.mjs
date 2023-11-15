export default class ServerRenderer{

    static __createBehaviorsRecurse(document, element, behaviors){

        if ( element.children ){
            for ( let i = 0; i < element.children.length; ++i ){
                ServerRenderer.__createBehaviorsRecurse(document, element.children[i], behaviors)
            }
        } else if ( element.constructor.name === 'DOMBehavior' ){
            const behaviorId = 'f_' + behaviors.count
            behaviors.count++
            behaviors.data[behaviorId] = {}
            for (const [key, value] of Object.entries(element.domEvents)) {
                behaviors.data[behaviorId][key] = value.toString()
                const datasetkey = 'action' + key.charAt(0).toUpperCase() + key.slice(1)
                element.target.dom.dataset[datasetkey] = behaviorId
            }
        }
    }

    static includeBehaviorDependencies(document){
        let script = document.getElementById('behavior-script-handler')
        if ( !script ){
            const behaviorEvents = document.createElement('script')
            behaviorEvents.id = 'behavior-script-handler'
            behaviorEvents.src = '/scripts/behavior-events.js'
            document.body.appendChild(behaviorEvents)
        }
    }

    static createBehaviors(document, element){
        let script = document.getElementById('behavior-script')
        let behaviors = {}
        if ( !script ){
            script = document.createElement('script')
            script.id = 'behavior-script'
            script.setAttribute('data-b-count', 0)
            script.textContent = 'const _bhvs_={}\nwindow._bhvs_=_bhvs_\n'
            document.body.appendChild(script)
            
            behaviors = { count: 0, data: {} }
        } else {
            const count = parseInt(script.getAttribute('data-b-count'))
            behaviors = { count: count, data: {} }
        }
        
        ServerRenderer.__createBehaviorsRecurse(document, element, behaviors)
        let scriptContent = script.textContent
        for (const [behaviorId, behaviorEvents] of Object.entries(behaviors.data)) {
            let r = ''
            for (const [name, handler] of Object.entries(behaviorEvents)) {
                if ( r.length !== 0 )
                    r += ',\n'
                r += name + ':' + handler
            }
            scriptContent += `_bhvs_['${behaviorId}'] = {${r}}\n`
        }
        script.dataset.bCount = behaviors.count
        script.textContent = scriptContent
    }
}