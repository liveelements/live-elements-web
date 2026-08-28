export class ExportReference {
    constructor(packageName, module, sourceFileName, exportName) {
        this._packageName = packageName
        this._module = module
        this._sourceFileName = sourceFileName
        this._exportName = exportName
        Object.freeze(this)
    }

    get packageName() {
        return this._packageName
    }

    get module() {
        return this._module
    }

    get sourceFileName() {
        return this._sourceFileName
    }

    get exportName() {
        return this._exportName
    }

    get source() {
        return [this.module, this.sourceFileName].filter(Boolean).join('/')
    }

    toUri() {
        const packageSegments = this.packageName.startsWith('@')
            ? [this.packageName.replace('/', '.')]
            : [this.packageName]
        const moduleSegments = this.module ? this.module.split('/') : []
        const sourceSegments = this.sourceFileName === null ? [] : [this.sourceFileName]
        return `${packageSegments.concat(moduleSegments, sourceSegments).join('.')}@${this.exportName}`
    }

    static fromUri(uri) {
        const value = String(uri ?? '')
        const separatorIndex = value.lastIndexOf('@')
        if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
            throw new Error(
                `Failed to parse export uri "${value}". Expected "<package>[.<module>].<file>.<ext>@<export>".`
            )
        }

        const moduleId = value.slice(0, separatorIndex)
        const exportName = value.slice(separatorIndex + 1)
        const parsed = ExportReference.fromModuleUri(moduleId)
        return new ExportReference(parsed.packageName, parsed.module, parsed.sourceFileName, exportName)
    }

    static fromModuleUri(moduleUri) {
        const value = String(moduleUri ?? '')
        const { packageName, remainder } = ExportReference._splitPackageAndRemainder(value)

        if (!remainder) {
            return new ExportReference(packageName, '', null, null)
        }

        const segments = remainder.split(/[/.]/)
        if (segments.some((segment) => segment.length === 0)) {
            throw new Error(`Failed to parse export uri "${value}".`)
        }
        if (segments.length === 1) {
            throw new Error(
                `Failed to parse export uri "${value}". Expected "<package>[.<module>].<file>.<ext>@<export>".`
            )
        }

        return new ExportReference(
            packageName,
            segments.slice(0, -2).join('/'),
            segments.slice(-2).join('.'),
            null
        )
    }

    static _splitPackageAndRemainder(moduleId) {
        if (!moduleId) {
            throw new Error(
                `Failed to parse export uri "${moduleId}". Expected "<package>[.<module>].<file>.<ext>@<export>".`
            )
        }

        if (moduleId.startsWith('@')) {
            const scopeEnd = ExportReference._findSeparator(moduleId, 1)
            if (scopeEnd <= 1) {
                throw new Error(`Failed to parse export uri "${moduleId}".`)
            }
            const packageEnd = ExportReference._findSeparator(moduleId, scopeEnd + 1)
            if (packageEnd === scopeEnd + 1) {
                throw new Error(`Failed to parse export uri "${moduleId}".`)
            }

            return {
                packageName: `${moduleId.slice(0, scopeEnd)}/${moduleId.slice(scopeEnd + 1, packageEnd < 0 ? moduleId.length : packageEnd)}`,
                remainder: packageEnd < 0 ? '' : moduleId.slice(packageEnd + 1)
            }
        }

        const packageEnd = ExportReference._findSeparator(moduleId, 0)
        if (packageEnd === 0) {
            throw new Error(`Failed to parse export uri "${moduleId}".`)
        }

        return {
            packageName: packageEnd < 0 ? moduleId : moduleId.slice(0, packageEnd),
            remainder: packageEnd < 0 ? '' : moduleId.slice(packageEnd + 1)
        }
    }

    static _findSeparator(value, start) {
        const dotIndex = value.indexOf('.', start)
        const slashIndex = value.indexOf('/', start)

        if (dotIndex < 0) return slashIndex
        if (slashIndex < 0) return dotIndex
        return Math.min(dotIndex, slashIndex)
    }
}
