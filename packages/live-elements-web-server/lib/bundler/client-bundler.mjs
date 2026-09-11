import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'

import chalk from 'chalk'
import esbuild from 'esbuild'
import * as compilerConfig from 'live-elements-core/compilerconfig.mjs'

import { sharedPackageEsbuildPlugin } from './esbuild-plugin-shared-package.mjs'
import { lvEsbuildPlugin } from './esbuild-plugin-lv.mjs'
import { virtualModulesPlugin } from './esbuild-plugin-virtual-modules.mjs'

import { ClientBundlerRun } from './client-bundler-run.mjs'
import { ClientBundlerUnit } from './client-bundler-unit.mjs'
import { ClientBundlerUnitBuild } from './client-bundler-unit-build.mjs'
import { CompiledPackage } from './compiled-package.mjs'
import { PackageModuleCompiler } from '../package-module-compiler.mjs'
import serverLog from '../server-log.mjs'
import { Environment } from '../environment.mjs'
import { VirtualScript } from '../scripts.mjs'

const log = Environment.defineLogger('client-bundler', {
    parent: serverLog,
    prefix: ['.Bundler'],
    prefixDecorated: [chalk.cyan('.Bundler')]
})

export class ClientBundlerFileEntry {
    constructor(name, files) {
        this._name = name
        this._files = files
    }

    static create(name, files) { return new ClientBundlerFileEntry(name, files) }

    get name() { return this._name }
    get files() { return this._files }
}

export class ClientBundlerPackageEntry {
    constructor(packageName, packageDir) {
        this._packageName = packageName
        this._packageDir = packageDir
    }

    static create(packageName, packageDir) { return new ClientBundlerPackageEntry(packageName, packageDir) }

    get packageName() { return this._packageName }
    get packageDir() { return this._packageDir }
}

/**
 * Every knob the bundler reads. Enums live here, not on `ClientBundler`: object enums for
 * multi-field payloads (`Format` carries three), numeric for binary switches. The numeric ones
 * are falsy at 0, so defaults must use `??` and comparisons `===`.
 */
export class ClientBundlerConfig {
    static Format = Object.freeze({
        Classic: Object.freeze({ esbuildFormat: 'iife', splitting: false, entryScriptType: '' }),
        Module: Object.freeze({ esbuildFormat: 'esm', splitting: false, entryScriptType: 'module' }),
        ModuleSplit: Object.freeze({ esbuildFormat: 'esm', splitting: true, entryScriptType: 'module' })
    })

    static Bundling = Object.freeze({ Inline: 0, ByPackage: 1 })
    static Output = Object.freeze({ Memory: 0, Files: 1 })
    static Execution = Object.freeze({ Single: 0, Incremental: 1 })
    static PackageOutput = Object.freeze({ Scripts: 0, PackageDist: 1 })
    static PackageReuse = Object.freeze({ Never: 0, WhenBuilt: 1 })

    constructor(opts) {
        this._outputFileName = opts.outputFileName ?? '[name].bundle.js'
        this._outputPath = opts.outputPath
        this._workingDir = opts.workingDir ?? null
        this._virtualScripts = opts.virtualScripts ?? []
        this._format = opts.format ?? ClientBundlerConfig.Format.Classic
        this._bundling = opts.bundling ?? ClientBundlerConfig.Bundling.Inline
        this._output = opts.output ?? ClientBundlerConfig.Output.Memory
        this._execution = opts.execution ?? ClientBundlerConfig.Execution.Single
        this._sourcemap = opts.sourcemap !== false
        this._target = opts.target ?? ['es2022']
        this._external = opts.external ?? []
        this._packageOutput = opts.packageOutput ?? ClientBundlerConfig.PackageOutput.Scripts
        this._packageReuse = opts.packageReuse ?? ClientBundlerConfig.PackageReuse.Never

        if (this._bundling === ClientBundlerConfig.Bundling.ByPackage && this._format.esbuildFormat !== 'esm') {
            throw new Error('ClientBundler.Config: Bundling.ByPackage requires an esm format (Format.Module or Format.ModuleSplit).')
        }

        if (this._external.length > 0 && this._format.esbuildFormat !== 'esm') {
            throw new Error('ClientBundler.Config: external requires an esm format (Format.Module or Format.ModuleSplit).')
        }
    }

    static create(opts) { return new ClientBundlerConfig(opts) }

    get outputFileName() { return this._outputFileName }
    bundleFileNameFor(entryName) { return this._outputFileName.replace('[name]', entryName) }
    get outputPath() { return this._outputPath }
    get workingDir() { return this._workingDir }
    get virtualScripts() { return this._virtualScripts }
    get format() { return this._format }
    get bundling() { return this._bundling }
    get output() { return this._output }
    get execution() { return this._execution }
    get sourcemap() { return this._sourcemap }
    get target() { return this._target }
    get external() { return this._external }
    get packageOutput() { return this._packageOutput }
    get packageReuse() { return this._packageReuse }
    packageOutdirFor(packageDir, entryName) {
        return this._packageOutput === ClientBundlerConfig.PackageOutput.PackageDist
            ? CompiledPackage.outputDirFor(packageDir)
            : path.join(this._outputPath, 'packages', entryName)
    }
}

export default class ClientBundler extends EventEmitter {
    static FileEntry = ClientBundlerFileEntry
    static PackageEntry = ClientBundlerPackageEntry
    static Config = ClientBundlerConfig
    static ContentTypes = new Map([
        ['.js', 'application/javascript; charset=utf-8'],
        ['.mjs', 'application/javascript; charset=utf-8'],
        ['.map', 'application/json; charset=utf-8'],
        ['.css', 'text/css; charset=utf-8'],
        ['.json', 'application/json; charset=utf-8']
    ])

    static async create(entries, config) {
        return new ClientBundler(entries, config)
    }

    static async createAndBuild(entries, config) {
        const bundler = await ClientBundler.create(entries, config)
        await bundler.rebuild()
        return bundler
    }

    constructor(entries, config) {
        super()

        if (!(config instanceof ClientBundlerConfig)) {
            throw new TypeError('ClientBundler: config must be a ClientBundler.Config instance.')
        }
        this._config = config
        this._activeBuild = null
        this._queuedBuild = null
        this._disposed = false

        const kinds = new Set(entries.map((entry) => entry.constructor))
        if (kinds.size > 1) {
            throw new Error('ClientBundler: entries must be all file entries or all package entries.')
        }
        if (!entries.every((entry) => entry instanceof ClientBundlerFileEntry || entry instanceof ClientBundlerPackageEntry)) {
            throw new TypeError('ClientBundler: entries must be ClientBundler.FileEntry or ClientBundler.PackageEntry instances.')
        }
        this._fileEntries = entries.filter((entry) => entry instanceof ClientBundlerFileEntry)
        this._packageEntries = entries.filter((entry) => entry instanceof ClientBundlerPackageEntry)
        if (this._config.workingDir) {
            this._workingDir = ClientBundler._canonicalDir(this._config.workingDir)
        } else if (this._packageEntries[0]?.packageDir) {
            this._workingDir = ClientBundler._canonicalDir(this._packageEntries[0].packageDir)
        } else {
            throw new Error(
                'ClientBundler requires a workingDir. Pass config.workingDir — the project root the build '
                + 'is anchored to (web-server passes bundleLookupPath; a package build can use its packageDir).'
            )
        }
        this._run = new ClientBundlerRun(this._config, this._workingDir)

        if (this._fileEntries.length > 0 || this._packageEntries.length === 0) {
            this._registerPageUnit(this._run)
            this._registerEntryModules(this._fileEntries, this._run)
        }
        for (const entry of this._packageEntries) {
            this._ensurePackageUnit(this._run, entry.packageName, entry.packageDir)
        }

        log.i(`ClientBundler outputPath '${this._config.outputPath}'`)
    }

    get config() { return this._config }
    get currentBuild() { return this._activeBuild ?? Promise.resolve(this._run) }
    get currentRun() { return this._run }

    static _canonicalDir(dirPath) {
        const absolute = path.resolve(dirPath)
        try {
            return fs.realpathSync(absolute)
        } catch {
            return absolute
        }
    }

    static async lvSourceForBuildOutput(outputPath) {
        const config = await compilerConfig.load()
        const buildPath = config.packageBuildPath
        const ext = config.outputExtension

        if (!outputPath.endsWith(`.lv.${ext}`)) {
            return null
        }

        const marker = `${path.sep}${buildPath}${path.sep}`
        const at = outputPath.indexOf(marker)
        if (at === -1) {
            return null
        }

        const sourcePath = path.join(
            outputPath.slice(0, at),
            outputPath.slice(at + marker.length, -(ext.length + 1))
        )

        return fs.existsSync(sourcePath) ? sourcePath : null
    }

    _registerPageUnit(run) {
        const existing = run.units.get(ClientBundlerUnit.PagesKey)
        if (existing) {
            return existing
        }

        const unit = ClientBundlerUnit.createPagesUnit(this._config)
        run.units.set(ClientBundlerUnit.PagesKey, unit)
        return unit
    }

    _registerEntryModules(entries, run) {
        const unit = run.units.get(ClientBundlerUnit.PagesKey) ?? this._registerPageUnit(run)
        for (const { name: entryName, files } of entries) {
            for (const file of files.filter((item) => item && typeof item === 'object' && typeof item.content === 'string')) {
                unit.virtualScripts.push(new VirtualScript(path.resolve(file.path), file.content))
            }

            const filePaths = files.map((file) => typeof file === 'string' ? file : file.path)
            const anchorDir = ClientBundler._canonicalDir(filePaths.map((filePath) => path.dirname(filePath)).find(fs.existsSync) ?? this._workingDir)
            const entryScript = new VirtualScript(
                path.join(anchorDir, `${entryName}.le-entry.mjs`),
                filePaths.map((filePath) => `import ${JSON.stringify(filePath.replace(/\\/g, '/'))}`).join(';\n')
            )
            unit.syntheticEntries.set(entryName, entryScript.location)
            unit.virtualScripts.push(entryScript)
        }
    }

    _ensurePackageUnit(run, packageName, packageDir) {
        const existing = run.units.get(packageName)
        if (existing) {
            return existing
        }

        const unit = ClientBundlerUnit.createPackageUnit(packageName, ClientBundler._canonicalDir(packageDir), this._config)
        run.units.set(packageName, unit)
        return unit
    }

    async _compilePackageModules(unit) {
        const buildDir = path.join(unit.packageDir, 'build')
        fs.mkdirSync(buildDir, { recursive: true })

        const compilation = await PackageModuleCompiler.create().compile(unit.packageDir)
        if (compilation.errors.length > 0) {
            const details = compilation.errors
                .map((entry) => ` - ${entry?.module ?? 'unknown'}: ${entry?.error ?? 'Unknown error'}`)
            throw new Error(`Failed to compile package "${unit.packageName}".\n${details.join('\n')}`)
        }

        const clientExports = unit.packageConfig.resolveClientExports()
        // Only compiler-emitted modules have manifests, so this detects .lv <-> .lv collisions;
        // hand-written .mjs client exports are intentionally not enumerated here.
        const collisions = CompiledPackage.findExportCollisions(
            clientExports,
            compilation.modules,
            unit.packageDir
        )
        if (collisions.length > 0) {
            const details = collisions
                .map(({ name, files }) => ` - "${name}" exported by ${files.join(' and ')}`)
            throw new Error(
                `Client package "${unit.packageName}" exports the same name from more than one module. `
                + `The bundle is a single flat namespace, so every listed name would be silently `
                + `dropped from it.\n${details.join('\n')}`
            )
        }

        return compilation
    }

    _buildOptionsFor(run, unit, { write = false } = {}) {
        const plugins = [
            virtualModulesPlugin(unit.virtualScripts),
            lvEsbuildPlugin()
        ]
        if (this._config.bundling === ClientBundlerConfig.Bundling.ByPackage) {
            plugins.push(sharedPackageEsbuildPlugin(unit.sharedPackageData))
        }
        return {
            entryPoints: Object.fromEntries(unit.syntheticEntries),
            bundle: true,
            format: this._config.format.esbuildFormat,
            splitting: this._config.format.splitting,
            platform: 'browser',
            target: this._config.target,
            keepNames: true,
            write,
            outdir: unit.outdir,
            entryNames: this._config.outputFileName.replace(/\.js$/, ''),
            chunkNames: 'chunks/[name]-[hash]',
            sourcemap: this._config.sourcemap ? 'inline' : false,
            resolveExtensions: ['.mjs', '.js', '.json'],
            plugins,
            external: this._config.bundling === ClientBundlerConfig.Bundling.ByPackage ? [] : this._config.external,
            metafile: true,
            logLevel: 'silent',
            legalComments: 'none',
            absWorkingDir: this._workingDir
        }
    }

    _logAssets(run) {
        for (const asset of run.result.assets) {
            const suffix = asset.entryName ? ` (name: ${asset.entryName})` : ''
            const size = asset.size
            log.colorless('i', `Asset emitted ${asset.outputName} ${size} bytes${suffix}`)
            log.decorated('i', `Asset emitted ${chalk.green(asset.outputName)} ${size} bytes${suffix}`)
        }
    }

    async _disposeRemovedPackageUnits(run, requiredKeys) {
        for (const [key, unit] of run.units) {
            if (requiredKeys.has(key)) {
                continue
            }

            await unit.dispose()
            run.units.delete(key)
            run.unitBuilds.delete(key)
        }
    }

    // The only place an esbuild result is read. It becomes a run-owned ClientBundlerUnitBuild.
    async _buildUnit(run, unit, compilation = null) {
        unit.sharedPackageData.open(unit, run)
        try {
            let result
            if (this._config.execution === ClientBundlerConfig.Execution.Incremental) {
                if (!unit.context) {
                    unit.context = await esbuild.context(this._buildOptionsFor(run, unit))
                }
                result = await unit.context.rebuild()
            } else {
                result = await esbuild.build(this._buildOptionsFor(run, unit))
            }

            // This must run before close(): sharedPackageData dependencies are per-build state.
            const compiled = ClientBundlerUnitBuild.createFromBuildResult(unit, result, {
                outputPath: this._config.outputPath,
                workingDir: this._workingDir,
                compilation
            })
            run.unitBuilds.set(unit.key, compiled)
            return compiled
        } finally {
            unit.sharedPackageData.close()
        }
    }

    async _writeOutputs(run) {
        for (const asset of run.result.assets) {
            if (asset.isSyncedToDisk) {
                continue
            }
            fs.mkdirSync(path.dirname(asset.path), { recursive: true })
            CompiledPackage.writeFileAtomicSync(asset.path, asset.content)
        }

        for (const compiledUnit of run.unitBuilds.values()) {
            if (!compiledUnit.isPackage || !compiledUnit.package || compiledUnit.isSyncedToDisk) {
                continue
            }
            const compiled = compiledUnit.package
            const outputDir = path.join(compiled.packageDir, path.dirname(compiled.bundlePath))
            fs.mkdirSync(outputDir, { recursive: true })
            CompiledPackage.writeFileAtomicSync(
                path.join(outputDir, CompiledPackage.MANIFEST_FILE),
                `${JSON.stringify(compiled.toJSON(), null, 2)}\n`
            )
        }
    }

    async _executeRun() {
        if (this._disposed) {
            throw new Error('ClientBundler has been disposed.')
        }
        const run = this._run.fork()
        const knownUnitKeys = new Set(run.units.keys())
        try {
            const requiredKeys = new Set()
            const pageUnit = run.units.get(ClientBundlerUnit.PagesKey)
            const queue = pageUnit ? [pageUnit] : []
            if (pageUnit) {
                requiredKeys.add(ClientBundlerUnit.PagesKey)
            }
            for (const entry of this._packageEntries) {
                requiredKeys.add(entry.packageName)
                queue.push(this._ensurePackageUnit(run, entry.packageName, entry.packageDir))
            }

            while (queue.length > 0) {
                const unit = queue.shift()
                if (run.unitBuilds.has(unit.key)) {
                    continue
                }

                // Adopt a previously built package rather than rebuilding it. Root packages are never
                // reused: the package under development must never be frozen.
                if (unit.isPackage
                    && this._config.packageReuse === ClientBundlerConfig.PackageReuse.WhenBuilt
                    && !this._packageEntries.some((entry) => entry.packageName === unit.packageName)) {
                    const compiledPackages = CompiledPackage.read(unit.packageDir)?.readDependenciesFlatten()
                    const builds = compiledPackages?.map((compiledPackage) =>
                        ClientBundlerUnitBuild.createFromCompiledPackage(compiledPackage, this._config.outputPath))
                    if (builds && builds.every((build) => build)) {
                        for (const build of builds) {
                            requiredKeys.add(build.key)
                            run.unitBuilds.set(build.key, build)
                        }
                        continue
                    }
                }

                let compilation = null
                if (unit.isPackage) {
                    compilation = await this._compilePackageModules(unit)
                    unit.refreshEntryScript()
                }
                const compiled = await this._buildUnit(run, unit, compilation)

                for (const { name, packageDir } of compiled.discoveredPackages()) {
                    requiredKeys.add(name)
                    queue.push(this._ensurePackageUnit(run, name, packageDir))
                }
            }

            await this._disposeRemovedPackageUnits(run, requiredKeys)
            run.complete()
            this._logAssets(run)

            if (this._config.output === ClientBundlerConfig.Output.Files) {
                await this._writeOutputs(run)
            }

            this._run = run
            this.emit('compileReady', run)
            return run
        } catch (error) {
            // Units are shared with this._run through fork(): a failed run must not leave the ones it
            // discovered (and their esbuild contexts) behind for the next one to inherit.
            for (const [key, unit] of [...run.units]) {
                if (!knownUnitKeys.has(key)) {
                    await unit.dispose()
                    run.units.delete(key)
                }
            }
            const errors = Array.isArray(error?.errors) && error.errors.length > 0
                ? error.errors.map((message) => new Error(message.location?.file
                    ? `${message.text} At file ${message.location.file}:${message.location.line}:${message.location.column}`
                    : message.text))
                : [error instanceof Error ? error : new Error(String(error))]
            let compilationError = errors[0]
            if (errors.length > 1) {
                compilationError = new Error(`ErrorReport:${JSON.stringify(errors.map((entry) => entry.message))}`)
                compilationError.errors = errors
            }
            log.e(compilationError)
            throw compilationError
        }
    }

    async rebuild() {
        if (this._disposed) {
            throw new Error('ClientBundler has been disposed.')
        }

        if (this._activeBuild) {
            this._queuedBuild ??= Promise.withResolvers()
            return await this._queuedBuild.promise
        }

        const run = Promise.withResolvers()
        this._activeBuild = (async () => {
            let current = run
            for (;;) {
                try {
                    current.resolve(await this._executeRun())
                } catch (error) {
                    current.reject(error)
                }

                if (this._disposed) {
                    this._queuedBuild?.reject(new Error('ClientBundler has been disposed.'))
                    this._queuedBuild = null
                    break
                }

                const queued = this._queuedBuild
                this._queuedBuild = null
                if (!queued) {
                    break
                }
                current = queued
            }
            this._activeBuild = null
        })()
        return await run.promise
    }

    async build() {
        if (this._run.result || this._activeBuild) {
            throw new Error('ClientBundler.build() may only be used for the first run of a bundler.')
        }
        return await this.rebuild()
    }

    createMiddleware() {
        return async (req, res, next) => {
            if (!req.url.startsWith('/scripts')) {
                next()
                return
            }

            await this.currentBuild

            const relativeUrl = req.url.replace(/^\/scripts\/?/, '')
            const asset = this._run.result?.assetFor(relativeUrl) ?? null
            if (!asset) {
                next()
                return
            }

            const contentType = [...ClientBundler.ContentTypes]
                .find(([ext]) => asset.outputName.endsWith(ext))?.[1] ?? 'application/octet-stream'
            res.setHeader('Content-Type', contentType)
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
            res.send(asset.content)
        }
    }

    writeModule(modulePath, content) {
        const pageUnit = this._run.units.get(ClientBundlerUnit.PagesKey)
        if (!pageUnit) {
            throw new Error('ClientBundler.writeModule(): No page context is registered.')
        }

        const absPath = path.resolve(this._workingDir, modulePath).replace(/\\/g, '/')
        const index = pageUnit.virtualScripts.findIndex(
            (script) => path.resolve(this._workingDir, script.location).replace(/\\/g, '/') === absPath
        )
        if (index === -1) {
            throw new Error(`ClientBundler.writeModule(): Unknown virtual module "${modulePath}".`)
        }
        pageUnit.virtualScripts[index] = new VirtualScript(pageUnit.virtualScripts[index].location, content)
    }

    async dispose() {
        this._disposed = true
        this._queuedBuild?.reject(new Error('ClientBundler has been disposed.'))
        this._queuedBuild = null
        await this._activeBuild
        await this._run.dispose()
    }

}
