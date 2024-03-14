import path from 'path'
import url from 'url'
import lvimport from 'live-elements-core/lvimport.mjs'
import ClassInfo from 'live-elements-web-server/lib/class-info.mjs'
import { BaseElement } from 'live-elements-core/baseelement.js'
import PackagePath from './package-path.cjs'
import ComponentRegistry from './component-registry.mjs'

export class ScopedStyle{
    constructor(src, process){
        this._src = src
        this._srcResolved = src
        this._process = process
        this._processResolved = null
    }

    get src(){ return this._src }
    get absoluteSrc(){ return this._srcResolved }
    get process(){ return this._process }
    get absoluteProcess(){ return this._processResolved }

    async processFunction(){ 
        return this._processResolved 
            ? lvimport(this._processResolved).then(m => m.CSSProcessor.create()) 
            : Promise.resolve(null) 
    }
}

export class ScopedComponent{
    constructor(c, view){
        this._c = c
        this._name = c.name
        this._viewUsages = [view]
        this._styles = []
        this._inherits = null
    }

    get component(){ return this._c }
    get viewUsages(){ return this._viewUsages }
    get name(){ return this._name }
    get fullName(){ return `${this._c.Meta.module}.${this._c.name }` }
    get className(){ return this._name.replaceAll('.', '-').toLowerCase() }
    get classNameWithPrefix(){ return `${ScopedComponent.classPrefix}${this.className}` }
    get styles(){ return this._styles }
    get inherits(){ return this._inherits }

    setInheritance(inherits){
        this._inherits = inherits
    }

    addStyle(style){
        const exists = this._styles.find(s => s.src === style.src)
        if ( !exists )
            this._styles.push(style)
    }

    createStyle(src, process){
        const exists = this._styles.find(s => s.src === src)
        if ( !exists ){
            this._styles.push(new ScopedStyle(src, process))
        }
    }

    addViewUsage(view){
        if ( this.isUsedInView(view) )
            return
        this._viewUsages.push(view)
    }

    isUsedInView(view){
        return this._viewUsages.find(v => v === view)
    }

    enableFullName(){ this._name = this.fullName } 

    toString(){
        return `ScopedStyle:[${this._name}][cls:${this.classNameWithPrefix}][styles:'${this.styles.map(s => s.src).join(',')}'][in:${this._viewUsages.map(c => c.name).join(',')}]`
    }
}

ScopedComponent.classPrefix = 'c-'


export class ScopedStyleCollection{

    constructor(){
        this._components = []
    }

    static async loadScopedProcessor(){
        if ( !ScopedStyleCollection.ScopedProcessor ){
            const currentDir = path.dirname(url.fileURLToPath(import.meta.url)) 
            ScopedStyleCollection.ScopedProcessor = (await lvimport(path.resolve(path.join(currentDir, '..', 'style', 'processors', 'private', 'ScopedCSS.lv')))).ScopedCSS
        }
        return ScopedStyleCollection.ScopedProcessor
    }

    findScopedComponent(c){
        return this._components.find(s => s.component === c)
    }

    addComponent(c, view){
        const exists = this._components.find(s => s.component === c )
        if ( exists ){
            exists.addViewUsage(view)
            return exists
        }
        const newComp = new ScopedComponent(c, view)
        this._components.push(newComp)
        return newComp
    }

    addCreatedComponent(newComp){
        const exists = this._components.find(s => s.component === newComp.component )
        if ( exists ){
            if ( exists !== newComp ){    
                for ( let i = 0; i < newComp._styles.length; ++i ){
                    exists._styles.push(newComp._styles[i])
                }
                for ( let i = 0; i < newComp._viewUsages.length; ++i ){
                    exists._viewUsages.push(newComp._viewUsages[i])
                }
                if ( newComp.inherits )
                    exists.setInheritance(newComp.inherits)
            }
            return exists
        }
        const sameComponentNameExists = this._components.find(s => s.component.name === newComp.component.name )
        if ( sameComponentNameExists )
            newComp.enableFullName()
        this._components.push(newComp)
        return newComp
    }

    addStyle(c, src, process, view){
        const exists = this._components.find(s => s.component === c )
        if ( exists ){
            exists.addViewUsage(view)
            exists.createStyle(src, process)
            return exists
        }
        const newComp = new ScopedComponent(c, view)
        const sameComponentNameExists = this._components.find(s => s.component.name === c.name )
        if ( sameComponentNameExists )
            newComp.enableFullName()
        newComp.createStyle(src, process)
        this._components.push(newComp)
        return newComp
    }

    merge(other){
        const result = new ScopedStyleCollection()
        for ( let i = 0; i < this._components.length; ++i ){
            result.addCreatedComponent(this._components[i])
        }
        for ( let i = 0; i < other._components.length; ++i ){
            result.addCreatedComponent(other._components[i])
        }
        return result
    }

    resolveRelativePaths(bundleRootPath){
        for ( let i = 0; i < this._components.length; ++i ){
            const c = this._components[i]
            for ( let j = 0; j < c._styles.length; ++j ){
                const s = c._styles[j]
                s._srcResolved = path.resolve(path.join(path.dirname(ComponentRegistry.findComponentPath(c.component, bundleRootPath)), s.src))

                if ( s.process ) {
                    if ( s.process.startsWith('.') ){
                        s._processResolved = path.resolve(path.join(path.dirname(ComponentRegistry.findComponentPath(c.component, bundleRootPath)), s.process))
                    } else {
                        s._processResolved = ScopedStyleCollection.resolveSrc(s.process, bundleRootPath)
                    }
                }

            }
        }
    }

    
    rootViews(){
        const rv = []
        for ( let i = 0; i < this._components.length; ++i ){
            const c = this._components[i]
            for ( let j = 0; j < c._viewUsages.length; ++j ){
                rv.push(c._viewUsages[j])
            }
        }
        return rv
    }

    static resolveSrc(src, bundleRootPath){
        let packageSeparator = src.indexOf('/');
        if (packageSeparator === -1) {
            throw new Error(`Cannot find style file: ${src}`);
        }
        let packageName = src.substr(0, packageSeparator)
        if ( packageName.startsWith('@') ){
            let nextPackageSeparator = src.indexOf('/', packageSeparator + 1)
            if ( nextPackageSeparator !== -1 ){
                packageSeparator = nextPackageSeparator
                packageName = src.substr(0, nextPackageSeparator)
            }
        }

        let packagePath = PackagePath.find(packageName, bundleRootPath)
        let pathFromPackage = src.substr(packageSeparator + 1)
        return path.join(packagePath, pathFromPackage)
    }

    findViewByName(viewName){
        const sc = this._components.find(c => (c.component.Meta.module + '.' + c.component.name) === viewName)
        return sc ? sc.component : null
    }

    componentsForView(view){
        const result = new ScopedStyleCollection()
        result._components = this._components.filter(s => s.isUsedInView(view))
        return result
    }

    styleLinks(){
        return this._components.length ? ['/styles/scoped.css'] : []
    }

    componentSelectorTransformationsFromComponent(c){
        const result = {}
        for ( let i = 0; i < this._components.length; ++i ){
            const s = this._components[i]
            if ( s.component === c ){
                result[s.component.name] = s.classNameWithPrefix
                result[s.fullName] = s.classNameWithPrefix
            }
        }

        if ( c.use ){
            for ( let i = 0; i < c.use.length; ++i ){
                const use = c.use[i]
                if (typeof use === 'function' && ClassInfo.extends(use, BaseElement) ){
                    const useTransformations = this.componentSelectorTransformationsFromComponent(use)
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

    componentSelectorTransformationsFrom(c){
        const res = this.componentSelectorTransformationsFromComponent(c.component)
        return res
    }

    componentSelectorTransformations(){
        const result = {}
        for ( let i = 0; i < this._components.length; ++i ){
            const s = this._components[i]
            result[s.name] = s.classNameWithPrefix
            result[s.fullName] = s.classNameWithPrefix
        }
        return result
    }

    componentAssignmentMap(){
        const result = {}
        for ( let i = 0; i < this._components.length; ++i ){
            const s = this._components[i]

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

    size(){ return this._components.length }

    toString(){
        return this._components.map(s => s.toString()).join('\n')
    }

    findComponent(uriId){
        return this._components.find(sc => ComponentRegistry.componentUriId(sc.component) === uriId)
    }

    async __updateStylesFromClient(c, rootc, componentLocation){
        if ( c.use && c.use.length ){
            for ( let i = 0; i < c.use.length; ++i ){
                const use = c.use[i]
                if ( use.type === 'ScopedStyle' ){
                    const scopedComponent = this.findComponent(c.path)
                    let component = scopedComponent ? scopedComponent.component : null
                    if ( !component ){
                        component = await ComponentRegistry.importComponentFromUriId(c.path, c.file, componentLocation)
                    }
                    this.addStyle(component, use.src, use.process, rootc)
                } else if ( use.type === 'component' ){
                    await this.__updateStylesFromClient(use, rootc, componentLocation)
                }
            }
        }
    }

    async updateStylesFromClient(c, componentLocation){
        const scopedComponent = this.findComponent(c.path)
        let component = scopedComponent ? scopedComponent.component : null
        if ( !component ){
            component = await ComponentRegistry.importComponentFromUriId(c.path, c.file, componentLocation)
        }
        await this.__updateStylesFromClient(c, component, componentLocation)
    }

    populateViewComponent(c){
        this.__populateViewComponent(this.componentAssignmentMap(), c)
    }

    __populateViewComponent(scopedStyles, c){
        const fullName = c.Meta.module + '.' + c.name
        if ( scopedStyles.hasOwnProperty(fullName) ){
            c.renderProperties = { classes: scopedStyles[fullName].classes }
        } else if ( scopedStyles.hasOwnProperty(c.name) ){
            c.renderProperties = { classes: scopedStyles[c.name].classes }
        }
        if ( c.use ){
            for ( let i = 0; i < c.use.length; ++i ){
                if ( typeof c.use[i] === 'function' && c.use[i].name )
                    this.__populateViewComponent(scopedStyles, c.use[i])
            }
        }
    }
}

ScopedStyleCollection.ScopedProcessor = null

export class ScopedViewAssignmentCache{
    constructor(){
        this._assignments = {}
    }

    static componentFullName(c){
        return `${c.Meta.module}.${c.name}`
    }

    assignmentStructure(scopedStyles, view){
        const viewName = ScopedViewAssignmentCache.componentFullName(view)
        if ( this._assignments.hasOwnProperty(viewName) )
            return this._assignments[viewName]

        const assignmentMap = scopedStyles.componentAssignmentMap()
        const result = this.__toViewUsageAssignmentStructure(assignmentMap, view)
        this._assignments[viewName] = result
        return result
    }

    __toViewUsageAssignmentStructure(assignmentMap, c){
        const usage = []
        if ( c.use ){
            for ( let i = 0; i < c.use.length; ++i ){
                if ( typeof c.use[i] === 'function' && c.use[i].name ){
                    usage.push(this.__toViewUsageAssignmentStructure(assignmentMap, c.use[i]))
                } else {
                    usage.push(null)
                }
            }
        }
        const fullName = c.Meta.module + '.' + c.name
        const renderProperties = assignmentMap.hasOwnProperty(fullName)
            ? { classes: assignmentMap[fullName].classes }
            : assignmentMap.hasOwnProperty(c.name) ? { classes: assignmentMap[c.name].classes } : {}
        renderProperties['name'] = c.name

        return {
            renderProperties: renderProperties,
            use: usage
        }
    }

    updateAssignmentStructure(scopedStyles, cassign){
        const assignmentMap = scopedStyles.componentAssignmentMap()
        const result = this.__toViewUsageAssignmentStructureFromAssignments(assignmentMap, cassign)
        this._assignments[cassign.path] = result
        return result
    }

    __toViewUsageAssignmentStructureFromAssignments(assignmentMap, cassign){
        const usage = []
        if ( cassign.use ){
            for ( let i = 0; i < cassign.use.length; ++i ){
                if ( cassign.use[i].type === 'component' ){
                    usage.push(this.__toViewUsageAssignmentStructureFromAssignments(assignmentMap, cassign.use[i]))
                } else {
                    usage.push(null)
                }
            }
        }
        const fullName = cassign.path
        const name = cassign.path.substr(cassign.path.lastIndexOf('.') + 1)
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