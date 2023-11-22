class BehaviorReport{
    constructor(behaviors, report){
        this._behaviors = behaviors || []
        this._report = report || []
    }

    get behaviors(){ return this._behaviors }
    get report(){ return this._report }
    get hasReport(){ return this._report.length > 0 }

    unwrapAnd(cb){
        if ( this.hasReport )
            cb(this.report)
        return this._behaviors
    }

    join(other){
        return new BehaviorReport(
            this._behaviors.concat(other.behaviors),
            this._report.concat(other.report)
        )
    }
}

export default class ServerRenderer{

    static scanBehaviors(document, element){
        let behaviors = new BehaviorReport()
        if ( element.children ){
            for ( let i = 0; i < element.children.length; ++i ){
                behaviors = behaviors.join(ServerRenderer.scanBehaviors(document, element.children[i]))
            }
        } else if ( element.constructor.name === 'DOMBehavior' ){
            let behaviorEvents = {}
            const behaviorDOM = element.target === element.constructor.document
                ? document : element.target.dom
            const reference = element.target === element.constructor.document ? 'document' : null

            for (const [key, value] of Object.entries(element.domEvents)) {
                if ( reference || (`on${key}` in behaviorDOM ) ){
                    behaviorEvents[key] = value.toString()
                } else {
                    behaviors.report.push(`Failed to find event '${key}' in DOM element type '${behaviorDOM.tagName}'`)
                }
            }
            if ( element.domReady ){
                behaviorEvents['ready'] = element.domReady
            }

            let behavior = {
                id: null,
                dom: behaviorDOM,
                reference: reference,
                events: behaviorEvents
            }
            behaviors.behaviors.push(behavior)
        }
        return behaviors
    }

    static assignBehaviorsId(startingId, behaviors){
        for ( let i = 0; i < behaviors.length; ++i ){
            behaviors[i].id = 'f_' + (startingId + i)
        }
    }

    static assignBehaviorsToDom(behaviors){
        for ( let i = 0; i < behaviors.length; ++i ){
            const behavior = behaviors[i]
            if ( !behavior.reference ){
                for (const [key, _value] of Object.entries(behavior.events)) {
                    const datasetkey = 'action' + key.charAt(0).toUpperCase() + key.slice(1)
                    behavior.dom.dataset[datasetkey] = behavior.id
                }
            }
        }
    }

    static behaviorsSource(behaviors){
        let source = ''
        for ( let i = 0; i < behaviors.length; ++i ){
            const behavior = behaviors[i]

            let r = ''
            for (const [name, handler] of Object.entries(behavior.events)) {
                if ( r.length !== 0 )
                    r += ',\n'
                r += name + ':' + handler
            }
            if ( behavior.reference ){
                if ( r.length !== 0 )
                    r += ',\n'
                r += 'target:' + behavior.reference
            }
            source += `${i > 0 ? ',\n' : ''}${behavior.id}: {${r}}`
        }
        return '{' + source + '}'
    }

}