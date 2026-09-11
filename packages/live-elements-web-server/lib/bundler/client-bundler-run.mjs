import path from 'node:path'

import { ClientBundlerUnit } from './client-bundler-unit.mjs'

/** The immutable snapshot produced by one completed client-bundler run. */
export class ClientBundlerRunResult {
    constructor(assets, externalImports, warnings, inputPaths) {
        this._assets = assets
        this._externalImports = externalImports
        this._warnings = warnings
        this._inputPaths = inputPaths
        Object.freeze(this)
    }

    get assets() { return [...this._assets.values()] }
    get externalImports() { return this._externalImports }
    get warnings() { return this._warnings }
    get inputPaths() { return this._inputPaths }
    assetFor(outputName) { return this._assets.get(outputName) ?? null }
}

/** One rebuild's outputs plus the session-lived unit collection it uses as inputs. */
export class ClientBundlerRun {
    constructor(config, workingDir) {
        this._config = config
        this._workingDir = workingDir
        this._units = new Map()
        this._unitBuilds = new Map()
        this._result = null
    }

    get units() { return this._units }
    get unitBuilds() { return this._unitBuilds }
    get result() { return this._result }

    allUnits() { return [...this._units.values()] }
    compiledPackage(packageName) { return this._unitBuilds.get(packageName)?.package ?? null }
    packageList() { return [...this._unitBuilds.values()].map((entry) => entry.package).filter(Boolean) }

    complete() {
        if (this._result) throw new Error('ClientBundlerRun.complete() may only be called once per run.')
        const assets = new Map()
        const warnings = []
        const inputPaths = new Set()
        const nodeModulesSegment = `${path.sep}node_modules${path.sep}`
        for (const build of this._unitBuilds.values()) {
            for (const asset of build.assets) assets.set(asset.outputName, asset)
            for (const warning of build.warnings) warnings.push(warning)
            for (const entry of build.inputPaths) {
                if (entry.includes(':')) continue
                const resolved = path.resolve(this._workingDir, entry)
                if (resolved.includes(nodeModulesSegment)) continue
                inputPaths.add(resolved)
            }
        }
        const pageBuild = this._unitBuilds.get(ClientBundlerUnit.PagesKey)
        this._result = new ClientBundlerRunResult(
            assets, pageBuild?.externalImports ?? [], warnings, [...inputPaths]
        )
        return this
    }

    fork() {
        const next = new ClientBundlerRun(this._config, this._workingDir)
        next._units = this._units
        return next
    }

    async dispose() {
        for (const unit of this.allUnits()) await unit.dispose()
        this.units.clear()
    }
}
