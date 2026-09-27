import { FlowFunctionResolutionError } from './flow-function-resolution-error.mjs'
import { ExportReference } from './export-reference.mjs'

export class FunctionReference {

    constructor(packageName, module, sourceFileName, exportName, name, functionId, fn = null) {
        this._packageName = packageName
        this._module = module
        this._sourceFileName = sourceFileName
        this._exportName = exportName
        this._name = name
        this._functionId = functionId
        this._fn = fn
    }

    static functionId(fn) {
        return fn?.name && fn?.Meta?.module && fn?.Meta?.sourceFileName
            ? `${fn.Meta.module}.${fn.Meta.sourceFileName}@${fn.name}`
            : null
    }

    static createFromId(functionId) {
        const id = typeof functionId === 'string' ? functionId : ''
        if (id.trim().length === 0) {
            throw new FlowFunctionResolutionError('Flow function id must be a non-empty string.', {
                functionId
            })
        }

        let parsed
        try {
            parsed = ExportReference.fromUri(id)
        } catch {
            throw new FlowFunctionResolutionError(
                `Invalid flow function id "${id}". Expected "<moduleId>@<exportName>".`,
                { functionId: id }
            )
        }

        const functionIdUri = parsed.toUri()
        if (!parsed.sourceFileName?.endsWith('.lv')) {
            throw new FlowFunctionResolutionError(
                `Invalid flow function module "${functionIdUri.slice(0, functionIdUri.lastIndexOf('@'))}". Only ".lv" modules are supported.`,
                { functionId: functionIdUri }
            )
        }

        return new FunctionReference(
            parsed.packageName,
            functionIdUri.slice(0, functionIdUri.lastIndexOf('@')),
            parsed.sourceFileName,
            parsed.exportName,
            parsed.exportName,
            functionIdUri,
            null
        )
    }

    static fromId(functionId) {
        return FunctionReference.createFromId(functionId)
    }

    static tryParse(functionId) {
        try {
            return FunctionReference.createFromId(functionId)
        } catch {
            return null
        }
    }

    static createFromFunction(fn, functionId = undefined) {
        if (typeof fn !== 'function') {
            throw new Error('FunctionReference.createFromFunction() expects a function')
        }

        const resolvedFunctionId = functionId ?? FunctionReference.functionId(fn)
        if (!resolvedFunctionId) {
            throw new Error('Flow.call() needs a functionId when function metadata is incomplete')
        }

        const reference = FunctionReference.createFromId(resolvedFunctionId).resolve(fn)
        const resolvedName = fn.name || reference.exportName
        reference._name = resolvedName
        reference._exportName = resolvedName
        return reference
    }

    static fromJSON(json) {
        const parsed = FunctionReference.tryParse(json.functionId)
        const name = json.name ?? parsed?.name ?? null
        return new FunctionReference(
            parsed?.packageName ?? null,
            parsed?.module ?? json.module ?? null,
            parsed?.sourceFileName ?? null,
            name,
            name,
            json.functionId,
            null
        )
    }

    get name() {
        return this._name
    }

    get fn() {
        return this._fn
    }

    get functionId() {
        return this._functionId
    }

    get lvModule(){
        return this._module.replace('.' + this._sourceFileName, '')
    }

    get module() {
        return this._module
    }

    get packageName() {
        return this._packageName
    }

    get sourceFileName() {
        return this._sourceFileName
    }

    get exportName() {
        return this._exportName
    }

    get source() {
        if (!this.packageName || !this.sourceFileName) {
            return null
        }
        if (this.functionId) {
            return ExportReference.fromUri(this.functionId).source
        }
        if (typeof this.module === 'string' && this.module.length > 0) {
            return ExportReference.fromModuleUri(this.module).source
        }
        return this.sourceFileName
    }

    get isResolved() {
        return this._fn !== null
    }

    resolve(fn) {
        if (fn !== null && typeof fn !== 'function') {
            throw new Error('FunctionReference.resolve() expects a function or null')
        }
        this._fn = fn
        return this
    }

    toJSON() {
        return {
            name: this.name,
            functionId: this.functionId,
            module: this.module
        }
    }
}
