import { FunctionReference } from './function-reference.mjs'
import { TypeCodec } from 'live-elements-core/type-codec.mjs'
import { Type } from 'live-elements-core/types.mjs'

class FlowNode {
    constructor(kind, fields = {}) {
        this.kind = kind
        Object.assign(this, fields)
    }


    static createCall(ref, args, tap, after) {
        return new FlowNode(Flow.Kind.Call, {
            ref,
            args,
            tap,
            after
        })
    }

    static createMember(base, path) {
        return new FlowNode(Flow.Kind.Member, { base, path })
    }

    static createRef(name) {
        return new FlowNode(Flow.Kind.Ref, { name })
    }

    static createRet(expr) {
        return new FlowNode(Flow.Kind.Ret, { expr })
    }
}

export class Flow {
    static Kind = {
        Flow: 'f',
        Call: 'x',
        Member: '.',
        Ref: '@',
        Ret: 'r'
    }

    static isNode(value) {
        return value instanceof FlowNode
    }

    constructor(params, type = null, body = []) {
        this.kind = Flow.Kind.Flow
        this.params = Array.isArray(params) ? params : (params == null ? [] : [params])
        this.type = type
        this.body = body
    }

    static create(params, typeOrBody, body) {
        if (body === undefined && Array.isArray(typeOrBody)) {
            return new Flow(params, null, typeOrBody)
        }

        return new Flow(params, typeOrBody ?? null, body ?? [])
    }

    static call(fnOrId, args = [], tap = undefined, after = undefined) {
        if (!Array.isArray(args)) {
            throw new Error('Flow.call() args must be an array')
        }

        if (after !== undefined) {
            if (!Array.isArray(after)) {
                throw new Error('Flow.call() after must be an array of names')
            }
            if (after.some((afterName) => typeof afterName !== 'string' || afterName.length === 0)) {
                throw new Error('Flow.call() after must contain only non-empty strings')
            }
        }

        const ref = fnOrId instanceof FunctionReference
            ? fnOrId
            : typeof fnOrId === 'function'
                ? FunctionReference.createFromFunction(fnOrId)
                : FunctionReference.createFromId(fnOrId)
        return FlowNode.createCall(
            ref,
            args,
            tap,
            after
        )
    }

    static member(base, path) {
        if (!Array.isArray(path) || path.length === 0) {
            throw new Error('Flow.member() path must be a non-empty array')
        }
        return FlowNode.createMember(base, path)
    }

    static ref(name) {
        return FlowNode.createRef(name)
    }

    static ret(expr) {
        return FlowNode.createRet(expr)
    }

    static nodeToJSON(value) {
        if (value instanceof Flow) {
            return value.toJSON()
        }

        if (Flow.isNode(value)) {
            switch (value.kind) {
                case Flow.Kind.Ref:
                    return { kind: Flow.Kind.Ref, name: value.name }
                case Flow.Kind.Member:
                    return {
                        kind: Flow.Kind.Member,
                        base: Flow.nodeToJSON(value.base),
                        path: value.path
                    }
                case Flow.Kind.Call: {
                    const result = {
                        kind: Flow.Kind.Call,
                        name: value.ref.name,
                        functionId: value.ref.functionId,
                        args: value.args.map((arg) => Flow.nodeToJSON(arg))
                    }
                    if (value.ref.module) 
                        result.module = value.ref.module
                    if (value.tap !== undefined) 
                        result.tap = value.tap
                    if ( value.after )
                        result.after = value.after
                    return result
                }
                case Flow.Kind.Ret:
                    return {
                        kind: Flow.Kind.Ret,
                        expr: Flow.nodeToJSON(value.expr)
                    }
                default:
                    throw new Error(`Unsupported Flow AST node kind "${value.kind}"`)
            }
        }

        if (Array.isArray(value)) {
            return value.map((item) => Flow.nodeToJSON(item))
        }

        if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
            return Object.fromEntries(
                Object.entries(value).map(([key, item]) => [key, Flow.nodeToJSON(item)])
            )
        }

        if (value instanceof Error) {
            return TypeCodec.encode(value)
        }

        return value
    }

    static nodeFromJSON(value, typeLookup = null) {
        if ( !value )
            return value
        if (Array.isArray(value)) {
            return value.map((item) => Flow.nodeFromJSON(item, typeLookup))
        } else if ( typeof value === 'object' ){
            if (Object.getPrototypeOf(value) === Object.prototype && value.kind == null) {
                return Object.fromEntries(
                    Object.entries(value).map(([key, item]) => [key, Flow.nodeFromJSON(item, typeLookup)])
                )
            }
            switch (value.kind) {
                case Flow.Kind.Flow:
                    return Flow.fromJSON(value, null, typeLookup)
                case Flow.Kind.Ref:
                    return Flow.ref(value.name)
                case Flow.Kind.Member:
                    return Flow.member(Flow.nodeFromJSON(value.base, typeLookup), value.path)
                case Flow.Kind.Call: {
                    const ref = FunctionReference.fromJSON({
                        name: value.name,
                        functionId: value.functionId,
                        module: value.module
                    })
                    const call = Flow.call(
                        ref,
                        value.args ? value.args.map(arg => Flow.nodeFromJSON(arg, typeLookup)) : [],
                        value.tap,
                        value.after
                    )
                    return call
                }
                case Flow.Kind.Ret:
                    return Flow.ret(Flow.nodeFromJSON(value.expr, typeLookup))
                default:
                    return value
            }
        }

        return value
    }

    static fromJSON(json, declaredType = null, typeLookup = null) {
        if (!json || typeof json !== 'object' || Array.isArray(json)) {
            throw new Error('Flow.fromJSON() expects a serialized Flow object with kind "f"')
        }
        if (json.kind !== Flow.Kind.Flow) {
            throw new Error(`Flow.fromJSON() expected kind "${Flow.Kind.Flow}" but received ${JSON.stringify(json.kind)}`)
        }
        const body = json.body.map((stmt) => Flow.nodeFromJSON(stmt, typeLookup))
        const type = json.type
            ? Type.fromJSON(json.type, typeLookup)
            : null
        return Flow.create(json.params, type, body)
    }

    toJSON() {
        const json = {
            kind: Flow.Kind.Flow,
            params: this.params,
            body: this.body.map((stmt) => Flow.nodeToJSON(stmt))
        }

        if (this.type) {
            json.type = this.type.toJSON()
        }

        return json
    }
}

Flow.meta = Object.freeze({
    uri: 'live-elements-flow/shared/flow.mjs@Flow'
})
