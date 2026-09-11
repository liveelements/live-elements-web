export class CompiledModuleManifest {

    constructor(uri, fileName, compiledModulePath, exports = []) {
        this.uri = uri == null ? null : String(uri)
        this.fileName = fileName == null ? null : String(fileName)
        this.compiledModulePath = compiledModulePath == null ? null : String(compiledModulePath)
        this.exports = Object.freeze((Array.isArray(exports) ? exports : [])
            .filter((entry) => entry && entry.name && entry.kind)
            .map((entry) => Object.freeze({
                name: String(entry.name),
                kind: String(entry.kind),
                meta: Boolean(entry.meta),
                declared: entry.declared === true
            })))
    }

    static fromJSON(json) {
        return new CompiledModuleManifest(
            json.uri,
            json.fileName,
            json.compiledModulePath,
            json.exports
        )
    }

    toJSON() {
        return {
            uri: this.uri,
            fileName: this.fileName,
            compiledModulePath: this.compiledModulePath,
            exports: this.exports.map((entry) => ({
                name: entry.name,
                kind: entry.kind,
                meta: entry.meta,
                declared: entry.declared
            }))
        }
    }
}
