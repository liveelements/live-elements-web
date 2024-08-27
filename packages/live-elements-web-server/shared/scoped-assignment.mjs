export default class ScopedAssignment{

    static populateViewComponent(componentCollection, c){
        const fullName = c.Meta.module + '.' + c.name
        if ( componentCollection.hasOwnProperty(fullName) ){
            c.renderProperties = { classes: componentCollection[fullName].classes }
        } else if ( componentCollection.hasOwnProperty(c.name) ){
            c.renderProperties = { classes: componentCollection[c.name].classes }
        }
        if ( c.use ){
            for ( let i = 0; i < c.use.length; ++i ){
                if ( typeof c.use[i] === 'function' && c.use[i].name )
                    ScopedAssignment.populateViewComponent(componentCollection, c.use[i])
            }
        }
    }

    static populateViewComponentStyles(scopedStyles, c, assertionSupport){
        if ( scopedStyles ){
            if ( assertionSupport ){
                if ( scopedStyles.renderProperties.name !== c.name ){
                    return { value: undefined, error: `${scopedStyles.renderProperties.name} !== ${c.name}` }
                }
            }
            c.renderProperties = scopedStyles.renderProperties
        } else { 
            return { value: undefined, error: `Undefined style for ${c.name}` }
        }
        if ( c.use ){
            for ( let i = 0; i < c.use.length && i < scopedStyles.use.length; ++i ){
                if ( typeof c.use[i] === 'function' && c.use[i].name ){
                    const result = ScopedAssignment.populateViewComponentStyles(scopedStyles.use[i], c.use[i], assertionSupport)
                    if ( !result.value )
                        return result
                }
            }
        }
        return { value: true }
    }
}