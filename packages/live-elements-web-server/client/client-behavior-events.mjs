if ( window._bhvs_ ){
    for (const [behaviorId, behaviorEvents] of Object.entries(_bhvs_)) {
        for (const [name, handler] of Object.entries(behaviorEvents)) {
            const selector = `[data-action-${name}='${behaviorId}']`
            const elem = document.querySelector(selector)
            elem['on' + name] = handler
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