import { ObjectType } from './types.mjs'

/**
 * Serializes and deserializes values through registered codecs and value-class hooks.
 *
 * Value classes own their own wire format via `toJSON()` and `static fromJSON(data, type, typeLookup)`.
 * `TypeCodec` instances instead serialize foreign values through `.toJSON(value)` and
 * `.fromJSON(data, type, typeLookup)`.
 *
 * Use `TypeCodec.encode(value)` and `TypeCodec.decode(data, type, typeLookup)` as the public entry points.
 */
export class TypeCodec {
    constructor({ toJSON = null, fromJSON = null } = {}) {
        this.toJSON = toJSON
        this.fromJSON = fromJSON
    }

    static for(ctor) {
        return new TypeCodec({
            toJSON: (value) => value.toJSON(),
            fromJSON: (data, type, typeLookup) => ctor.fromJSON(data, type, typeLookup)
        })
    }

    static encode(value) {
        if (value == null)
            return value

        const codec = TypeCodec.builtin.get(value.constructor)
        if (codec?.toJSON)
            return codec.toJSON(value)
        if (typeof value.toJSON === 'function')
            return value.toJSON()
        const proto = Object.getPrototypeOf(value)
        if (proto === Object.prototype || proto === null) {
            const out = {}
            for (const [key, item] of Object.entries(value))
                out[key] = TypeCodec.encode(item)
            return out
        }
        return value
    }

    static decode(data, type, typeLookup = null) {
        if (!type)
            return data

        const cls = type.ctor ?? type.ref
        const codec = TypeCodec.builtin.get(cls)
        if (codec?.fromJSON)
            return codec.fromJSON(data, type, typeLookup)
        if (typeof cls?.fromJSON === 'function')
            return cls.fromJSON(data, type, typeLookup)
        const isObjectType = type instanceof ObjectType
            || (typeof type?.isObject === 'function' && type.isObject())
        if (isObjectType && data && typeof data === 'object' && !Array.isArray(data)) {
            const out = {}
            for (const [key, fieldType] of Object.entries(type.fields))
                out[key] = TypeCodec.decode(data[key], fieldType, typeLookup)
            return out
        }
        return data
    }
}

TypeCodec.builtin = new Map([
    [Array, new TypeCodec({
        toJSON: (value) => value.map(TypeCodec.encode),
        fromJSON: (data, type, typeLookup) => (data ?? []).map((item) => TypeCodec.decode(item, type.params[0], typeLookup))
    })],
    [Set, new TypeCodec({
        toJSON: (value) => [...value].map(TypeCodec.encode),
        fromJSON: (data, type, typeLookup) => new Set((data ?? []).map((item) => TypeCodec.decode(item, type.params[0], typeLookup)))
    })],
    [Map, new TypeCodec({
        toJSON: (value) => [...value].map(([key, item]) => [TypeCodec.encode(key), TypeCodec.encode(item)]),
        fromJSON: (data, type, typeLookup) => new Map((data ?? []).map(([key, item]) => [
            TypeCodec.decode(key, type.params[0], typeLookup),
            TypeCodec.decode(item, type.params[1], typeLookup)
        ]))
    })],
    [Error, new TypeCodec({
        toJSON: (value) => ({ message: value.message, name: value.name, stack: value.stack }),
        fromJSON: (data) => Object.assign(new Error(data?.message), { name: data?.name, stack: data?.stack })
    })],
    [Promise, new TypeCodec({
        fromJSON: (data, type, typeLookup) => TypeCodec.decode(data, type.params[0], typeLookup)
    })]
])
