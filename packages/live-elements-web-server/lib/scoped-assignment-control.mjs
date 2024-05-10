import ScopedComponent from '../shared/scoped-component.mjs'

export default class ScopedAssignmentControl{

    constructor(){
        this._assignments = {}
    }
    
    static extractAssignmentMap(collection){
        const result = {}
        for ( let i = 0; i < collection._components.length; ++i ){
            const s = collection._components[i]

            const componentClasses = [s.classNameWithPrefix]
            let next = s.inherits
            while ( next ){
                componentClasses.push(next.classNameWithPrefix)
                next = next.inherits
            }
            result[s.name] = { classes: componentClasses }
        }
        return result
    }

    updateAssignmentStructure(scopedStyles, viewsc){
        const viewName = viewsc.uri
        // if ( this._assignments.hasOwnProperty(viewName) )
        //     return this._assignments[viewName]
        const assignmentMap = ScopedAssignmentControl.extractAssignmentMap(scopedStyles)
        const result = ScopedAssignmentControl.__toViewUsageAssignmentStructure(assignmentMap, viewsc)
        this._assignments[viewName] = result
        return result
    }

    styleLinks(scopedStyles){
        return scopedStyles._components.length ? ['/styles/scoped.css'] : []
    }

    static __toViewUsageAssignmentStructure(assignmentMap, sc){
        const usage = []
        for ( let i = 0; i < sc.use.length; ++i ){
            if ( sc.use[i] instanceof ScopedComponent ){
                usage.push(ScopedAssignmentControl.__toViewUsageAssignmentStructure(assignmentMap, sc.use[i]))
            } else {
                usage.push(null)
            }
        }
        const fullName = sc.uri
        const renderProperties = assignmentMap.hasOwnProperty(fullName)
            ? { classes: assignmentMap[fullName].classes }
            : assignmentMap.hasOwnProperty(sc.name) ? { classes: assignmentMap[sc.name].classes } : {}
        renderProperties['name'] = sc.name

        return {
            renderProperties: renderProperties,
            use: usage
        }
    }

    static __toViewUsageAssignmentStructureFromAssignments(assignmentMap, cassign){
        const usage = []
        if ( cassign.use ){
            for ( let i = 0; i < cassign.use.length; ++i ){
                if ( cassign.use[i].type === 'component' ){
                    usage.push(ScopedAssignmentControl.__toViewUsageAssignmentStructureFromAssignments(assignmentMap, cassign.use[i]))
                } else {
                    usage.push(null)
                }
            }
        }
        const fullName = cassign.uri
        const name = cassign.name
        const renderProperties = assignmentMap.hasOwnProperty(fullName)
            ? { classes: assignmentMap[fullName].classes }
            : assignmentMap.hasOwnProperty(name) ? { classes: assignmentMap[name].classes } : {}
        renderProperties['name'] = name

        return {
            renderProperties: renderProperties,
            use: usage
        }
    }
}