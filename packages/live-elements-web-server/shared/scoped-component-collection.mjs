import ScopedComponent from "./scoped-component.mjs"

export default class ScopedComponentCollection{
    constructor(){
        this._components = []
    }
    
    size(){ return this._components.length }
    
    findScopedComponent(c){
        return this.findScopedComponentByUri(ScopedComponent.componentUri(c))
    }

    findScopedComponentByUri(uri){
        return this._components.find(s => s.uri === uri)
    }

    toString(){
        return this._components.map(s => s.toString()).join('\n')
    }

    rootViews(){
        const rv = []
        for ( let i = 0; i < this._components.length; ++i ){
            const c = this._components[i]
            let cInUse = false
            for ( let j = 0; j < this._components.length; ++j ){
                const lookup = this._components[j]
                if ( lookup !== c ){
                    const found = lookup.use.find(s => s === c)
                    if ( found )
                        cInUse = true
                    let inherits = lookup.inherits
                    while ( inherits ){
                        if ( inherits === c )
                            cInUse = true
                        inherits = inherits.inherits
                    }
                }
            }
            if ( !cInUse ){
                rv.push(c)
            }
        }
        return rv
    }

    componentsForView(viewsc){
        const result = new ScopedComponentCollection()
        result._components = this._components.filter(s => s.isUsedInView(viewsc))
        return result
    }

    static __recurseAddComponentData(current, cd, collection, view){
        if ( cd.hasOwnProperty('inh') ){ //inherits
            let inhc = collection.findScopedComponentByUri(cd.inh.uri)
            if ( !inhc ){
                inhc = ScopedComponent.createFromUri(cd.inh.uri)
                inhc.addViewUsage(view)
                current.setInheritance(inhc)
                collection.addScopedComponent(inhc)
                ScopedComponentCollection.__recurseAddComponentData(inhc, cd.inh, collection, view)
            } else {
                current.setInheritance(inhc)
            }
        }
        for ( let i = 0; i < cd.use.length; ++i ){
            const use = cd.use[i]
            if ( use._ === 'c' ){
                const exists = collection.findScopedComponentByUri(use.uri)
                if ( !exists ){
                    const sc = ScopedComponent.createFromUri(use.uri)
                    sc.addViewUsage(view)
                    current.addUse(sc)
                    collection.addScopedComponent(sc)
                    ScopedComponentCollection.__recurseAddComponentData(sc, use, collection, view)
                }
            } else if ( use._ === 's' ){
                current.createStyle(use.src, use.process)
            }
        }
    }

    static fromJSON(data){
        const res = new ScopedComponentCollection()
        const sc = ScopedComponent.createFromUri(data.uri)
        res.addScopedComponent(sc)
        ScopedComponentCollection.__recurseAddComponentData(sc, data, res, sc)
        return res
    }

    addScopedComponent(sc){
        const exists = this.findScopedComponentByUri(sc.uri)
        if ( exists )
            return exists
        this._components.push(sc)
        return sc
    }

    addComponent(c){
        const exists = this.findScopedComponent(c)
        if ( exists )
            return exists
        const sc = ScopedComponent.createFromComponent(c)
        this._components.push(sc)
        return sc
    }

    updateWithRaw(rawCollection){
        const res = new ScopedComponentCollection()
        for ( let i = 0; i < rawCollection._components.length; ++i ){
            const sc = rawCollection._components[i]
            const thisSc = this.findScopedComponentByUri(sc.uri)
            if ( thisSc && thisSc.component ){
                sc._c = thisSc._c
            }
            res._components.push(sc)
        }

        for ( let i = 0; i < this._components.length; ++i ){
            const thisSc = this._components[i]
            res.addScopedComponent(thisSc)
        }
        return res
    }
}