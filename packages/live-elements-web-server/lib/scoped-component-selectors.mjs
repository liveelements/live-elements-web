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