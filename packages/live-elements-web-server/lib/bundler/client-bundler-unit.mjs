import path from 'node:path'

import { ClientPackageConfig } from './client-package-config.mjs'
import { SharedPackagePluginData } from './esbuild-plugin-shared-package.mjs'
import { LvPluginData } from './esbuild-plugin-lv.mjs'
import { CompiledPackage } from './compiled-package.mjs'
import { VirtualScript } from '../scripts.mjs'

/** Build inputs and cross-run esbuild state. Run output belongs to ClientBundlerUnitBuild instead. */
export class ClientBundlerUnit {
    static Kind = Object.freeze({ Page: 'page', Package: 'package' })
    static PagesKey = ':pages'

    constructor(key, kind, packageDir, outdir) {
        this.key = key
        this.kind = kind
        this.packageDir = packageDir
        this.syntheticEntries = new Map()
        this.virtualScripts = []
        this.outdir = outdir
        this.sharedPackageData = new SharedPackagePluginData()
        this.lvPluginData = new LvPluginData()
        this.context = null
        this._packageConfig = null
    }

    static createPagesUnit(config) {
        const unit = new ClientBundlerUnit(ClientBundlerUnit.PagesKey, ClientBundlerUnit.Kind.Page, null, config.outputPath)
        if (Array.isArray(config.virtualScripts)) {
            unit.virtualScripts.push(...config.virtualScripts)
        }
        return unit
    }

    static createPackageUnit(packageName, packageDir, config) {
        const normalizedPackageDir = path.resolve(packageDir)
        const entryName = CompiledPackage.fileNameFor(packageName)
        const unit = new ClientBundlerUnit(
            packageName,
            ClientBundlerUnit.Kind.Package,
            normalizedPackageDir,
            config.packageOutdirFor(normalizedPackageDir, entryName)
        )
        const entryScript = new VirtualScript(
            path.join(normalizedPackageDir, `${entryName}.entry.mjs`),
            unit.packageConfig.bundleEntrySource()
        )
        unit.syntheticEntries.set(entryName, entryScript.location)
        unit.virtualScripts.push(entryScript)
        return unit
    }

    get isPage() { return this.kind === ClientBundlerUnit.Kind.Page }
    get isPackage() { return this.kind === ClientBundlerUnit.Kind.Package }
    get packageName() { return this.isPackage ? this.key : null }
    get entryName() { return this.isPackage ? CompiledPackage.fileNameFor(this.key) : null }

    get packageConfig() {
        if (!this._packageConfig) {
            this._packageConfig = ClientPackageConfig.read(path.join(this.packageDir, 'client.package.json'))
        }
        return this._packageConfig
    }

    refreshEntryScript() {
        // Replace the fixed entry slot: incremental virtual-module resolution cannot see a new script.
        this.virtualScripts[0] = new VirtualScript(
            this.virtualScripts[0].location,
            this.packageConfig.bundleEntrySource()
        )
    }

    async dispose() {
        if (!this.context) return
        await this.context.dispose()
        this.context = null
    }
}
