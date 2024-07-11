import ScopedComponent from "../shared/scoped-component.mjs"

export default class ScopedComponentSelectors{

    static fromComponent(collection, sc){ 
        const result = {}
        result[sc.name] = sc.classNameWithPrefix
        result[sc.fullName] = sc.classNameWithPrefix

        if ( sc.use ){
            for ( let i = 0; i < sc.use.length; ++i ){
                const use = sc.use[i]
                if (use instanceof ScopedComponent ){
                    const useTransformations = ScopedComponentSelectors.fromComponent(collection, use)
                    for (let [key, value] of Object.entries(useTransformations)) {
                        if ( !result.hasOwnProperty(key) ){
                            result[key] = value
                        }
                    }
                }
            }
        }

        if ( sc.inherits ){
            const useTransformations = ScopedComponentSelectors.fromComponent(collection, sc.inherits)
            for (let [key, value] of Object.entries(useTransformations)) {
                if ( !result.hasOwnProperty(key) ){
                    result[key] = value
                }
            }
        }

        return result
    }

    static fromStyle(collection, style){
        let cts = []
        // find out which components use this style
        for ( let i = 0; i < collection.size(); ++i ){
            const ct = collection._components[i]    
            for ( let j = 0; j < ct._styles.length; ++j ){
                const sst = ct._styles[j]
                if ( sst.resolved.src === style.resolved.src ){
                    cts.push(ct)
                }
            }
        }

        const result = {}

        for ( let i = 0; i < cts.length; ++i ){
            const ctsresult = ScopedComponentSelectors.from(collection, cts[i])
            for (let [key, value] of Object.entries(ctsresult)) {
                if ( !result.hasOwnProperty(key) ){
                    result[key] = value
                }
            }
        }

        return result
    }

    static from(collection, sc){
        return ScopedComponentSelectors.fromComponent(collection, sc)
    }

    all(collection){
        const result = {}
        for ( let i = 0; i < collection._components.length; ++i ){
            const s = collection._components[i]
            result[s.name] = s.classNameWithPrefix
            result[s.fullName] = s.classNameWithPrefix
        }
        return result
    }

}