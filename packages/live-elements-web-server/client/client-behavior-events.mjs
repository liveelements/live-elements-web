if ( window._bhvs_ ){
    for (const [behaviorId, behaviorEvents] of Object.entries(window._bhvs_)) {
        if ( behaviorEvents.target ){
            for (const [name, handler] of Object.entries(behaviorEvents)) {
                if ( name === 'ready' ){
                    handler(document)
                } else if ( name !== 'target' ){
                    behaviorEvents.target.addEventListener(name, handler)
                }
            }
        } else {
            for (const [name, handler] of Object.entries(behaviorEvents)) {
                const selector = `[data-action-${name}='${behaviorId}']`
                const elem = document.querySelector(selector)
                if ( name === 'ready' ){
                    handler(elem)
                } else {
                    elem['on' + name] = handler
                }
            }
        }

    };
}
 
function BehaviorEvents(){};

BehaviorEvents.attach = function(behaviorId, elem){
    const behaviorEvents = _bhvs_[behaviorId]
    for (const [name, handler] of Object.entries(behaviorEvents)) {
        const datasetkey = 'action' + name.charAt(0).toUpperCase() + name.slice(1)
        elem.dataset[datasetkey] = behaviorId
        elem['on' + name] = handler
    }
}