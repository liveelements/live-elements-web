import path from 'path'
import url from 'url'
import lvimport from 'live-elements-core/lvimport.mjs'
import ClassInfo from 'live-elements-web-server/lib/class-info.mjs'
import { BaseElement } from 'live-elements-core/baseelement.js'

export class ScopedStyle{
    constructor(src, process){
        this._src = src
        this._srcResolved = src
        this._process = process
        this._processResolved = process
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

    resolveRelativePaths(componentPathResolve){
        for ( let i = 0; i < this._components.length; ++i ){
            const c = this._components[i]
            for ( let j = 0; j < c._styles.length; ++j ){
                const s = c._styles[j]

                s._srcResolved = path.resolve(path.join(path.dirname(componentPathResolve(c.component)), s.src))
                s._processResolved = s.process 
                    ? path.resolve(path.join(path.dirname(componentPathResolve(c.component)), s.process))
                    : null
            }
        }
    }

    componentsForView(view){
        const result = new ScopedStyleCollection()
        result._components = this._components.filter(s => s.isUsedInView(view))
        return result
    }

    styleLinks(){
        return ['/styles/scoped.css']
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

    toAssignmentStructure(){
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

    toViewUsageAssignmentStructure(view){
        const scopedStyles = this.toAssignmentStructure()
        return this.__toViewUsageAssignmentStructure(view, scopedStyles)
    }

    __toViewUsageAssignmentStructure(c, scopedStyles){
        const usage = []
        if ( c.use ){
            for ( let i = 0; i < c.use.length; ++i ){
                if ( typeof c.use[i] === 'function' && c.use[i].name ){
                    usage.push(this.toViewUsageAssignmentStructure(c.use[i], scopedStyles))
                } else {
                    usage.push(null)
                }
            }
        }
        const fullName = c.Meta.module + '.' + c.name
        const renderProperties = scopedStyles.hasOwnProperty(fullName)
            ? { classes: scopedStyles[fullName].classes }
            : scopedStyles.hasOwnProperty(c.name) ? { classes: scopedStyles[c.name].classes } : {}
        renderProperties['name'] = c.name

        return {
            renderProperties: renderProperties,
            use: usage
        }
    }

    size(){ return this._components.length }

    toString(){
        return this._components.map(s => s.toString()).join('\n')
    }

    populateViewComponent(c){
        this.__populateViewComponent(this.toAssignmentStructure(), c)
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