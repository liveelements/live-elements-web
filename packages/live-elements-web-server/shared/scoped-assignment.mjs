
export default class ScopedAssignment{

    static populateViewComponent(collection, c){
        ScopedAssignment.__populateViewComponent(ScopedAssignmentControl.extractAssignmentMap(collection), c)
    }

    static __populateViewComponent(componentCollection, c){
        const fullName = c.Meta.module + '.' + c.name
        if ( componentCollection.hasOwnProperty(fullName) ){
            c.renderProperties = { classes: componentCollection[fullName].classes }
        } else if ( componentCollection.hasOwnProperty(c.name) ){
            c.renderProperties = { classes: componentCollection[c.name].classes }
        }
        if ( c.use ){
            for ( let i = 0; i < c.use.length; ++i ){
                if ( typeof c.use[i] === 'function' && c.use[i].name )
                ScopedAssignment.__populateViewComponent(componentCollection, c.use[i])
            }
        }
    }
}