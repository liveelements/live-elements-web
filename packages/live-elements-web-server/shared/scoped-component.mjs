
import ScopedStyle from "./scoped-component-style.mjs"

export default class ScopedComponent{
    constructor(){
        this._c = null
        this._name = ''
        this._uri = ''
        this._use = []
        this._viewUsages = []
        this._styles = []
        this._inherits = null
    }

    static createFromComponent(c){
        const sc = new ScopedComponent()
        sc._c = c
        sc._name = c.name
        sc._uri = ScopedComponent.componentUri(c)
        return sc
    }

    static createFromUri(uri){
        const sc = new ScopedComponent()
        const uriSegments = uri.split('.')
        sc._name = uriSegments[uriSegments.length - 1]
        sc._uri = uri
        return sc
    }

    get component(){ return this._c }
    get viewUsages(){ return this._viewUsages }
    get name(){ return this._name }
    get uri(){ return this._uri }
    get use(){ return this._use }
    get fullName(){ return this._uri }
    get className(){ return this._name.replaceAll('.', '-').toLowerCase() }
    get classNameWithPrefix(){ return `${ScopedComponent.classPrefix}${this.className}` }
    get styles(){ return this._styles }
    get inherits(){ return this._inherits }

    toJSON(){
        const r =  {
            _: 'c',
            uri: this._uri,
            use: this._use.map(u => {
                if ( u.toJSON )
                    return u.toJSON()
                return null
            })
        }
        if ( this._inherits ){
            r['inh'] = this._inherits.toJSON()
        }
        return r
    }

    toString(indent){
        const indt = indent ? indent : 0
        let result = `${' '.repeat(indt)}C:${this._uri} [cls:${this.classNameWithPrefix}][in:${this._viewUsages.map(c => c.name).join(',')}]`
        for ( let i = 0; i < this._use.length; ++i ){
            if ( this._use[i] instanceof ScopedComponent ){
                result += `\n${' '.repeat(indt + 2)}C:${this._use[i].uri} [...]`
            } else if ( this._use[i] )
                result += '\n' + this._use[i].toString(indt + 2)
            else {
                result += `\n${' '.repeat(indt + 2)}U:[]`
            }
        }
        return result
    }


    hasComponent(){ return this._c ? true : false }
    static componentUri(c){ return`${c.Meta.module}.${c.name}` }

    setInheritance(inherits){ this._inherits = inherits }
    addUse(use){ this._use.push(use) }

    addStyle(style){
        const exists = this._styles.find(s => s.src === style.src)
        if ( !exists )
            this._styles.push(style)
        this.addUse(style)
    }

    createStyle(src, process){
        const exists = this._styles.find(s => s.src === src)
        if ( !exists ){
            const ssc = new ScopedStyle(src, process)
            this._styles.push(ssc)
            this.addUse(ssc)
        } else {
            this.addUse(exists)
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

    // toString(){
    //     return `ScopedComponent:[${this._name}]]`
    // }
}

ScopedComponent.classPrefix = 'c-'