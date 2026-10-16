const PRIMITIVE = {
    number   : Symbol.for('primitive:number'),
    string   : Symbol.for('primitive:string'),
    boolean  : Symbol.for('primitive:boolean'),
    bigint   : Symbol.for('primitive:bigint'),
    symbol   : Symbol.for('primitive:symbol'),
    null     : Symbol.for('primitive:null'),
    undefined: Symbol.for('primitive:undefined'),
    any       :Symbol.for('primitive:any')
}
  
export class Type{
    constructor(ref){
        this.ref = ref
    }

    key(){ return Type.isClass(this.ref) || this.ref.meta ? Type.classReference(this.ref) : this.ref }

    matches(value){ return value instanceof this.ref }

    toJSON(){ return { _: 'Type', name: this.key() } }

    isPrimitive() { return this.constructor === PrimitiveType }
    isGeneric(){ return this.constructor === GenericType }
    isFunction(){ return this.constructor === FunctionType }
    isObject(){ return this.constructor === ObjectType }
    classRef(){ return this.ref }

    __sameClass(other){
        const a = this.classRef(), b = other.classRef()
        if (a === null || b === null) return false
        if (a === b) return true
        return !!a.meta?.uri && a.meta.uri === b.meta?.uri
    }

    toString(){ return Type.className(this.ref) }
    label(){ return this.toString() }

    isAssignableTo(target){
        if (this === target || target === Type.any) 
            return true
        if (this === Type.any)
            return false
        if (target instanceof TypeVariable)
            return true
        if (target.constructor === Type && this.__sameClass(target))
            return true
        return this.__isAssignableToImpl(target)
    }
    __isAssignableToImpl(_target){ return false }

    static for(ref){ 
        return Type.__accessCache(ref, Type, ref)
    }

    static isClass(ref){
        return typeof ref === 'function' && /^class\s/.test(Function.prototype.toString.call(ref))
    }

    static classReference(ref){
        return ref.meta && ref.meta.uri ? ref.meta.uri : ref.name
    }

    static className(ref){
        const clsRef = Type.classReference(ref)
        const separatorIndex = clsRef.lastIndexOf('@')
        return separatorIndex < 0 ? clsRef : clsRef.substring(separatorIndex + 1)
    }

    static __accessCache(key, T, ...args){
        if(!Type.__cache.has(key) ){
            Type.__cache.set(key, Object.freeze(new T(...args)))
        }
        return Type.__cache.get(key)
    }

    static __resolveClass(name, typeLookup){
        if (!(typeLookup instanceof TypeLookup)) {
            throw new Error(`Type.fromJSON() needs a TypeLookup to resolve class "${name}".`)
        }
        const ctor = typeLookup.find(name)
        if (!ctor) {
            throw new Error(`Failed to find lookup type "${name}".`)
        }
        return ctor
    }

    static fromJSON(data, typeLookup = null){
        if (typeof data === 'string') {
            return PrimitiveType.fromJSON(data, typeLookup)
        }
        
        if (data && typeof data === 'object'){
            switch (data._) {
                case 'Generic': return GenericType.fromJSON(data, typeLookup)
                case 'Function': return FunctionType.fromJSON(data, typeLookup)
                case 'Object': return ObjectType.fromJSON(data, typeLookup)
                case 'TypeVariable': return TypeVariable.fromJSON(data, typeLookup)
                case 'Type':
                    return Type.for(Type.__resolveClass(data.name, typeLookup))
            }
        }

        throw new Error(`Type decoding: Unknown data type: ${data.toString()}`)
    }

    static typesFromJSON(data){
        return [...new Set(Type.__collectTypes(data, []))]
    }

    static __collectTypes(data, out){
        if (typeof data === 'string')
            return out

        if (data && typeof data === 'object'){
            switch (data._) {
                case 'Generic': return GenericType.typesFromJSON(data, out)
                case 'Function': return FunctionType.typesFromJSON(data, out)
                case 'Object': return ObjectType.typesFromJSON(data, out)
                case 'TypeVariable': return TypeVariable.typesFromJSON(data, out)
                case 'Type':
                    out.push(data.name)
                    return out
            }
        }

        throw new Error(`Type decoding: Unknown data type: ${data.toString()}`)
    }
}

Type.__cache = new Map()

export class PrimitiveType extends Type{
    constructor(ref){ 
        super(ref) 
    }

    static for(id){ 
        return Type.__accessCache(id, PrimitiveType, id)
    }

    key(){
        return this.ref.description
    }

    toJSON(){ return this.ref.description }
    classRef(){ return null }

    static fromJSON(data){
        const sym = PRIMITIVE[data.replaceAll('primitive:', '')]
        if (!sym) 
            throw new Error(`Unknown primitive "${data}"`);
        return PrimitiveType.for(sym)
    }

    matches(value) {
        switch (this) {
            case Type.number   : return typeof value === 'number'
            case Type.string   : return typeof value === 'string'
            case Type.boolean  : return typeof value === 'boolean'
            case Type.bigint   : return typeof value === 'bigint'
            case Type.symbol   : return typeof value === 'symbol'
            case Type.null     : return value === null
            case Type.undefined: return value === undefined
            case Type.any      : return true
            default            : return false
        }
    }

    __isAssignableToImpl(target){ 
        return target instanceof PrimitiveType && this === target
    }

    toString(){ return String(this.ref.description).replace(/^primitive:/, '') }
}

for (const k of Object.keys(PRIMITIVE)) {
    Type[k] = PrimitiveType.for(PRIMITIVE[k])
}
Object.freeze(Type)

export class TypeVariable extends Type{
    constructor(name, scope = null){
        super(null)
        this.name = String(name)
        this.scope = scope == null ? null : String(scope)
    }

    static createKey(name, scope){
        return scope == null ? `:${name}` : `:${scope}#${name}`
    }

    static for(name, scope = null){
        return Type.__accessCache(TypeVariable.createKey(name, scope), TypeVariable, name, scope)
    }

    static fromJSON(data){
        return TypeVariable.for(data.name, data.scope ?? null)
    }

    static typesFromJSON(_data, out = []){
        return out
    }

    key(){
        return TypeVariable.createKey(this.name, this.scope)
    }

    classRef(){
        return null
    }

    matches(_value){
        return true
    }

    toString(){
        return `:${this.name}`
    }

    toJSON(){
        return this.scope == null
            ? { _: 'TypeVariable', name: this.name }
            : { _: 'TypeVariable', name: this.name, scope: this.scope }
    }
}

export class GenericType extends Type{
    constructor(ctor, params){ 
        super(ctor)
        this.params = Object.freeze(params.slice())
    }

    static createKey(ctor, args){
        return `${Type.classReference(ctor)}<${args.map(a => a.key()).join(',')}>`
    }

    static for(ctor, ...args){
        let ctorCache = GenericType.__genericCache.get(ctor)
        if (!ctorCache) {
            ctorCache = new Map()
            GenericType.__genericCache.set(ctor, ctorCache)
        }

        const key = args.map((arg) => arg.key()).join(',')
        if (!ctorCache.has(key)) {
            ctorCache.set(key, Object.freeze(new GenericType(ctor, args)))
        }
        return ctorCache.get(key)
    }

    static fromJSON(data, typeLookup){
        const ctor = Type.__resolveClass(data.name, typeLookup)
        const params = (data.params || []).map(p => Type.fromJSON(p, typeLookup))
        return GenericType.for(ctor, ...params)
    }

    static typesFromJSON(data, out = []){
        out.push(data.name)
        for (const param of data.params ?? []) {
            Type.__collectTypes(param, out)
        }
        return out
    }

    toJSON(){ 
        return { 
            _: 'Generic', 
            name: Type.classReference(this.ref), 
            params: this.params.map(t => t.toJSON()) 
        } 
    }

    key(){ return GenericType.createKey(this.ref, this.params) }

    __isAssignableToImpl(target){ 
        if (!(target instanceof GenericType) || !this.__sameClass(target))
            return false
        if (this.params.length !== target.params.length)
            return false
        return this.params.every((p, i) => p.isAssignableTo(target.params[i]))
    }

    matches(value) {
        if (!(value instanceof this.ref)) 
            return false
        if (this.ref === Array){
            const elemType = this.params[0]
            return value.every(elem => elemType.matches(elem))
        }
        if (this.ref === Map){
            const [keyT, valT] = this.params
            for (const [k, v] of value.entries()) {
                if (!keyT.matches(k) || !valT.matches(v)) 
                    return false
            }
            return true
        }
        return true
    }
    toString(){ return `${Type.className(this.ref)}<${this.params.map(p => p.toString()).join(',')}>` }
    label(){ return `${Type.className(this.ref)}<${this.params.map(p => p.label()).join(',')}>` }
}

GenericType.__genericCache = new WeakMap()


export class FunctionType extends Type {

    constructor(returnType, params, typeParameters = []){
        super(Function)
        this.returnType = returnType
        this.params     = Object.freeze(params.slice())
        this.typeParameters = Object.freeze(typeParameters.map(String))
    }

    static generateKey(params, returnType, typeParameters = []){
        const paramKeys = params.map((p) =>
            typeof p?.key === 'function' ? p.key() : String(p)
        )
        const returnKey = typeof returnType?.key === 'function'
            ? returnType.key()
            : String(returnType)
        const base = `(${paramKeys.join(',')})=>${returnKey}`
        return typeParameters.length ? `${base}|<${typeParameters.join(',')}>` : base
    }

    static for(returnType, ...params) {
        const key = FunctionType.generateKey(params, returnType)
        return Type.__accessCache(key, FunctionType, returnType, params, [])
    }

    static withParametersFor(names, returnType, ...params){
        const typeParameters = [...names].map(String)
        const key = FunctionType.generateKey(params, returnType, typeParameters)
        return Type.__accessCache(key, FunctionType, returnType, params, typeParameters)
    }

    static fromJSON(data, lookup){
        const paramTypes = data.params.map(o => Type.fromJSON(o, lookup))
        const returnType = Type.fromJSON(data.return, lookup)
        return data.typeParameters?.length
            ? FunctionType.withParametersFor(data.typeParameters, returnType, ...paramTypes)
            : FunctionType.for(returnType, ...paramTypes)
    }

    static typesFromJSON(data, out = []){
        for (const param of data.params ?? []) {
            Type.__collectTypes(param, out)
        }
        return Type.__collectTypes(data.return, out)
    }

    __isAssignableToImpl(target){
        if (!(target instanceof FunctionType) ||
            this.params.length !== target.params.length)
            return false
    
        const paramsOk = this.params.every((p, i) => target.params[i].isAssignableTo(p))
        const returnOk = this.returnType.isAssignableTo(target.returnType)
        return paramsOk && returnOk
    }
    
    key(){
        return FunctionType.generateKey(this.params, this.returnType, this.typeParameters)
    }

    toJSON(){ 
        const data = {
            _: 'Function',
            params: this.params.map(t => t.toJSON()),
            return: this.returnType.toJSON()
        }
        if (this.typeParameters.length){
            data.typeParameters = [...this.typeParameters]
        }
        return data
    }

    get isGenericDeclaration(){
        return this.typeParameters.length > 0
    }

    matches(fn) {
        if (typeof fn !== 'function')
            return false

        const sig = fn[FunctionType.__sigSym]
        if (!sig) 
            return false
    
        if (sig.paramTypes.length !== this.paramTypes.length)
            return false
        for (let i = 0; i < sig.paramTypes.length; ++i){
            if (sig.paramTypes[i] !== this.paramTypes[i]) 
                return false
        }
        return sig.returnType === this.returnType
    }

    toString() {
        const ps = this.params.map(p => p.toString()).join(', ')
        return `(${ps}) => ${this.returnType.toString()}`
    }

    label() {
        const ps = this.params.map(p => p.label()).join(', ')
        return `(${ps}) => ${this.returnType.label()}`
    }
}

export class TypeSpecializationConflictError extends Error{
    constructor(message, { specialization = null, conflicts = [] } = {}){
        super(message)
        this.name           = 'TypeSpecializationConflictError'
        this.specialization = specialization
        this.conflicts      = conflicts
    }
}

export class AppliedTypeSpecialization{
    constructor(type, residuals = []){
        this.type = type
        this.residuals = new Set(residuals)
        Object.freeze(this)
    }

    static of(type, applied = []){
        return new AppliedTypeSpecialization(
            type,
            applied.flatMap((entry) => [...entry.residuals])
        )
    }

    get hasResiduals(){
        return this.residuals.size > 0
    }
}

export class TypeSpecialization{
    constructor(entries){
        this._entries    = new Map(entries)
        this._applyCache = new Map()
        Object.freeze(this)
    }

    static create(entries = []){
        return new TypeSpecialization(entries)
    }

    get size(){
        return this._entries.size
    }

    get isEmpty(){
        return this._entries.size === 0
    }

    has(name){
        return this._entries.has(String(name))
    }

    get(name){
        return this._entries.get(String(name)) ?? null
    }

    names(){
        return [...this._entries.keys()]
    }

    entries(){
        return [...this._entries.entries()]
    }

    with(name, type){
        return TypeSpecialization.create([...this._entries, [String(name), type]])
    }

    merge(other){
        if (!(other instanceof TypeSpecialization))
            throw new TypeError('TypeSpecialization.merge(other) expects a TypeSpecialization.')
        if (other.isEmpty) return this
        if (this.isEmpty) return other

        const entries = [...this._entries]
        const conflicts = []

        for (const [name, actual] of other.entries()){
            const existing = this.get(name)
            if (!existing){
                entries.push([name, actual])
                continue
            }
            if (existing.key() === actual.key()) continue
            if (actual.isAssignableTo(existing)) continue
            conflicts.push({ name, existing, actual })
        }

        const merged = TypeSpecialization.create(entries)
        if (conflicts.length) {
            throw new TypeSpecializationConflictError(
                TypeSpecialization.__conflictMessage(conflicts[0]),
                { specialization: merged, conflicts }
            )
        }
        return merged
    }

    key(){
        return this.entries().map(([name, type]) => `${name}=${type.key()}`).join(';')
    }

    apply(type){
        if (!(type instanceof Type))
            return new AppliedTypeSpecialization(type)

        const key = type.key()
        if (!this._applyCache.has(key)){
            this._applyCache.set(key, this.__substitute(type))
        }
        return this._applyCache.get(key)
    }

    toJSON(){
        return {
            _: 'TypeSpecialization',
            entries: this.entries().map(([name, type]) => [name, type.toJSON()])
        }
    }

    static fromJSON(data, lookup = null){
        return TypeSpecialization.create(
            (data?.entries ?? []).map(([name, type]) => [name, Type.fromJSON(type, lookup)])
        )
    }

    static infer(declared, actual){
        const conflicts = []
        const specialization = TypeSpecialization.__infer(
            declared,
            actual,
            TypeSpecialization.create(),
            conflicts
        )
        if (conflicts.length) {
            throw new TypeSpecializationConflictError(
                TypeSpecialization.__conflictMessage(conflicts[0]),
                { specialization, conflicts }
            )
        }
        return specialization
    }

    static __infer(declared, actual, specialization, conflicts){
        if (!(declared instanceof Type) || !(actual instanceof Type)) {
            return specialization
        }

        if (declared instanceof TypeVariable) {
            if (actual === Type.any || TypeSpecialization.create().apply(actual).hasResiduals) {
                return specialization
            }

            const existing = specialization.get(declared.name)
            if (!existing) {
                return specialization.with(declared.name, actual)
            }
            if (existing.key() === actual.key()) {
                return specialization
            }
            if (actual.isAssignableTo(existing)) {
                return specialization
            }
            conflicts.push({ name: declared.name, existing, actual })
            return specialization
        }

        if (
            declared instanceof GenericType
            && actual instanceof GenericType
            && declared.classRef() === actual.classRef()
            && declared.params.length === actual.params.length
        ) {
            let next = specialization
            declared.params.forEach((param, index) => {
                next = TypeSpecialization.__infer(param, actual.params[index], next, conflicts)
            })
            return next
        }

        if (
            declared instanceof FunctionType
            && actual instanceof FunctionType
            && declared.params.length === actual.params.length
        ) {
            let next = specialization
            declared.params.forEach((param, index) => {
                next = TypeSpecialization.__infer(param, actual.params[index], next, conflicts)
            })
            return TypeSpecialization.__infer(declared.returnType, actual.returnType, next, conflicts)
        }

        if (declared instanceof ObjectType && actual instanceof ObjectType) {
            let next = specialization
            Object.entries(declared.fields ?? {}).forEach(([fieldName, fieldType]) => {
                if (!Object.prototype.hasOwnProperty.call(actual.fields ?? {}, fieldName)) {
                    return
                }
                next = TypeSpecialization.__infer(fieldType, actual.fields[fieldName], next, conflicts)
            })
            return next
        }

        return specialization
    }

    static __conflictMessage(conflict){
        return `Type variable ${conflict.name} is already bound to ${conflict.existing.toString()}; cannot also bind ${conflict.actual.toString()}.`
    }

    __substitute(type){
        if (type instanceof TypeVariable){
            const bound = this.get(type.name)
            return bound
                ? new AppliedTypeSpecialization(bound)
                : new AppliedTypeSpecialization(type, [type.name])
        }

        if (type instanceof GenericType){
            const applied = type.params.map((param) => this.apply(param))
            const params = applied.map((entry) => entry.type)
            const changed = params.some((param, index) => param !== type.params[index])
            return AppliedTypeSpecialization.of(
                changed ? GenericType.for(type.ref, ...params) : type,
                applied
            )
        }

        if (type instanceof FunctionType){
            const appliedParams = type.params.map((param) => this.apply(param))
            const appliedReturn = this.apply(type.returnType)
            const params = appliedParams.map((entry) => entry.type)
            const returnType = appliedReturn.type
            const remainingTypeParameters = type.typeParameters.filter((name) => !this.has(name))
            const changed = returnType !== type.returnType
                || params.some((param, index) => param !== type.params[index])
                || remainingTypeParameters.length !== type.typeParameters.length
            const substituted = !changed
                ? type
                : remainingTypeParameters.length
                    ? FunctionType.withParametersFor(remainingTypeParameters, returnType, ...params)
                    : FunctionType.for(returnType, ...params)
            return AppliedTypeSpecialization.of(substituted, [...appliedParams, appliedReturn])
        }

        if (type instanceof ObjectType){
            if (type.ctor){
                return new AppliedTypeSpecialization(type)
            }

            const appliedFields = Object.entries(type.fields)
                .map(([name, fieldType]) => [name, this.apply(fieldType)])
            const fields = Object.fromEntries(
                appliedFields.map(([name, entry]) => [name, entry.type])
            )
            const changed = Object.entries(type.fields)
                .some(([name, fieldType]) => fields[name] !== fieldType)
            return AppliedTypeSpecialization.of(
                changed ? ObjectType.for(fields, type.meta) : type,
                appliedFields.map(([, entry]) => entry)
            )
        }

        return new AppliedTypeSpecialization(type)
    }
}

export class ObjectType extends Type{
    constructor(ctor, fields, meta = {}) {
      super(Object)
      this.ctor = ctor
      this.fields = Object.freeze({ ...fields })
      this.meta = Object.freeze({ ...meta })
    }

    key(){
        return this.ctor
            ? Type.classReference(this.ctor)
            : ObjectType.createKey(this.fields, this.meta)
    }

    static createKey(fields, meta = {}){
        const key = '{' + Object.entries(fields).map(([k,v])=>`${k}:${v.key()}`).join(',') + '}'
        return meta?.name ? `${meta.name}${key}` : key
    }

    static for(fields, meta){
        const key = ObjectType.createKey(fields, meta)
        return Type.__accessCache(key, ObjectType, null, fields, meta)
    }

    static forClass(ctor, fields, meta){
        const key = ctor
        return Type.__accessCache(key, ObjectType, ctor, fields, meta)
    }

    static fromJSON(data, typeLookup){
        const fields = Object.fromEntries(
            Object.entries(data.fields).map(([k, v]) => [k, Type.fromJSON(v, typeLookup)])
        )
        
        if (data.ctor){
            const ctor = Type.__resolveClass(data.ctor, typeLookup)
            return ObjectType.forClass(ctor, fields, data.meta)
        }
        return ObjectType.for(fields, data.meta)
    }

    static typesFromJSON(data, out = []){
        if (data.ctor) {
            out.push(data.ctor)
        }
        for (const value of Object.values(data.fields ?? {})) {
            Type.__collectTypes(value, out)
        }
        return out
    }

    isClass(){ return !!this.ctor }
    isInterface(){ return !this.ctor }
    classRef(){ return this.ctor ?? null }


    __isAssignableToImpl(target){
        if (this.ctor && target instanceof ObjectType && target.ctor){
            if (this.__sameClass(target))
                return true
            return typeof this.ctor === 'function' && typeof target.ctor === 'function'
                && this.ctor.prototype instanceof target.ctor
        }
        if (!(target instanceof ObjectType) )
            return false

        for (const [name, targetFieldType] of Object.entries(target.fields)){
            const sourceFieldType = this.fields[name]
            if (!sourceFieldType || !sourceFieldType.isAssignableTo(targetFieldType))
                return false
        }
        return true
    }

    toJSON(){
        const serialisedFields = Object.fromEntries(
            Object.entries(this.fields).map(([k, v]) => [k, v.toJSON()])
        )

        return this.meta
            ? this.ctor
                ? { _ : 'Object', ctor: Type.classReference(this.ctor), fields: serialisedFields, meta: this.meta }
                : { _ : 'Object', fields: serialisedFields, meta: this.meta }
            : this.ctor
                ? { _ : 'Object', ctor: Type.classReference(this.ctor), fields: serialisedFields }
                : { _ : 'Object', fields: serialisedFields }
    }

    toString() {
        const body = Object.entries(this.fields)
            .map(([k,v]) => `${k}:${v.toString()}`).join(', ')
        return this.ctor
          ? `${this.ctor.name}{ ${body} }`
          : `{ ${body} }`;
    }

    label() {
        if (!this.ctor && this.meta.name) return this.meta.name
        const body = Object.entries(this.fields)
            .map(([k,v]) => `${k}:${v.label()}`).join(', ')
        return this.ctor
            ? `${this.ctor.name}{ ${body} }`
            : `{ ${body} }`
    }
}


export const ArrayType = { for: (param) => GenericType.for(Array, param) }

export class TypeLookup{

    constructor(types){
        if (!Array.isArray(types)) {
            throw new Error('TypeLookup() expects an array of types.')
        }
        this._data = types
    }

    find(typeName){
        return this._data.find(t => Type.classReference(t) === typeName)
    }

    static fromArray(list){
        return new TypeLookup(list)
    }
}
