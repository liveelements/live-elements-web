import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'

import chalk from 'chalk'
import esbuild from 'esbuild'
import * as compilerConfig from 'live-elements-core/compilerconfig.mjs'

import { lvEsbuildPlugin } from './esbuild-plugin-lv.mjs'
import { virtualModulesPlugin } from './esbuild-plugin-virtual-modules.mjs'
import serverLog from '../server-log.mjs'
import ValueWithReport from '../core/value-with-report.mjs'
import { Environment } from '../environment.mjs'
import { VirtualScript } from '../scripts.mjs'
import { Warning } from '../../shared/errors/warning.mjs'

const log = Environment.defineLogger('client-bundler', {
    parent: serverLog,
    prefix: ['.Bundler'],
    prefixDecorated: [chalk.cyan('.Bundler')]
})

class ClientBundlerConfig {
    static Format = Object.freeze({
        Classic: Object.freeze({ esbuildFormat: 'iife', splitting: false, entryScriptType: '' }),
        Module: Object.freeze({ esbuildFormat: 'esm', splitting: false, entryScriptType: 'module' }),
        ModuleSplit: Object.freeze({ esbuildFormat: 'esm', splitting: true, entryScriptType: 'module' })
    })

    constructor(opts) {
        this._outputFileName = opts.outputFileName ?? '[name].bundle.js'
        this._outputPath = opts.outputPath ?? null
        this._publicPath = opts.publicPath
        this._watcher = opts.watcher ?? null
        this._virtualScripts = opts.virtualScripts ?? []
        this._format = opts.format ?? ClientBundlerConfig.Format.Classic
        this._external = opts.external
        this._sourcemap = opts.sourcemap !== false
    }

    static create(opts) { return new ClientBundlerConfig(opts) }

    get outputFileName() { return this._outputFileName }
    bundleFileNameFor(entryName) { return this._outputFileName.replace('[name]', entryName) }
    get outputPath() { return this._outputPath }
    get publicPath() { return this._publicPath }
    get watcher() { return this._watcher }
    get virtualScripts() { return this._virtualScripts }
    get format() { return this._format }
    get external() { return this._external }
    get sourcemap() { return this._sourcemap }
}

class ClientBundlerEntry {
    constructor(name, files) {
        this._name = name
        this._files = files
    }

    static create(name, files) { return new ClientBundlerEntry(name, files) }

    get name() { return this._name }
    get files() { return this._files }
}

export default class ClientBundler extends EventEmitter {

    /** Returns a bundler with its esbuild context established, ready to rebuild on demand. */
    static async create(entries, distPath, config) {
        const bundler = new ClientBundler(entries, distPath, config)
        await bundler._ensureContext()
        return bundler
    }

    /** As create(), plus an initial build, so assets are servable the moment it resolves. */
    static async createAndBuild(entries, distPath, config) {
        const bundler = await ClientBundler.create(entries, distPath, config)
        await bundler.rebuild()
        return bundler
    }

    constructor(entries, distPath, config) {
        super()

        this._config = config instanceof ClientBundlerConfig ? config : ClientBundlerConfig.create(config)
        this._scriptsOutputPath = path.join(distPath, 'scripts')
        this._virtualScripts = this._config.virtualScripts
        this._syntheticEntries = new Map()
        this._middleware = null
        this._context = null
        this._assetMap = new Map()
        this._currentBuild = Promise.resolve(null)
        this._watcher = this._config.watcher

        this._registerEntryModules(entries)
        log.i(`ClientBundler baseUrl '${this._config.publicPath}'`)
    }

    get config() { return this._config }
    get middleware() { return this._middleware }
    get currentBuild() { return this._currentBuild }

    static Entry = ClientBundlerEntry
    static Config = ClientBundlerConfig
    static Format = ClientBundlerConfig.Format
    static ContentTypes = new Map([
        ['.js', 'application/javascript; charset=utf-8'],
        ['.mjs', 'application/javascript; charset=utf-8'],
        ['.map', 'application/json; charset=utf-8'],
        ['.css', 'text/css; charset=utf-8'],
        ['.json', 'application/json; charset=utf-8']
    ])


    /**
     * Canonicalizes a path for identity comparison: absolute, symlink-resolved, forward slashes.
     * Virtual modules and unwritten esbuild outputs have no file on disk, so when the file is
     * missing the symlink resolution falls back to its directory.
     */
    static canonicalPath(filePath) {
        const absPath = path.resolve(filePath)
        if (fs.existsSync(absPath)) {
            return fs.realpathSync(absPath).replace(/\\/g, '/')
        }
        const dirPath = path.dirname(absPath)
        const canonical = fs.existsSync(dirPath)
            ? path.join(fs.realpathSync(dirPath), path.basename(absPath))
            : absPath
        return canonical.replace(/\\/g, '/')
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

    /**
     * Maps esbuild output files back to the synthetic entry that produced them.
     * `syntheticEntries` is a name -> entry path map; `nameForOutput` names the emitted asset.
     */
    static assetsFromResult(result, syntheticEntries, nameForOutput) {
        const entryPointByOutput = new Map(Object.entries(result.metafile.outputs)
            .map(([outputPath, output]) => [ClientBundler.canonicalPath(outputPath), output.entryPoint]))
        const entryNameByPath = new Map([...syntheticEntries]
            .map(([entryName, entryPath]) => [ClientBundler.canonicalPath(entryPath), entryName]))

        return result.outputFiles.map((outputFile) => {
            const entryPoint = entryPointByOutput.get(ClientBundler.canonicalPath(outputFile.path))
            const entryName = entryPoint
                ? entryNameByPath.get(ClientBundler.canonicalPath(entryPoint.startsWith('le-virtual:')
                    ? entryPoint.slice('le-virtual:'.length)
                    : entryPoint)) ?? null
                : null
            return {
                name: nameForOutput(outputFile.path),
                path: outputFile.path,
                isMainEntry: entryName !== null,
                entryName,
                content: outputFile.text
            }
        })
    }

    /**
     * Builds the barrel module that pulls an entry's files into a single bundle: esbuild maps
     * one input path to one output name, so N files need one synthetic module importing them all.
     * It is anchored beside the first file whose directory exists, because a virtual module
     * resolves its relative imports against its own directory.
     */
    static _syntheticEntryFor(entryName, files) {
        const filePaths = files.map((file) => typeof file === 'string' ? file : file.path)
        const anchorDir = filePaths
            .map((filePath) => path.dirname(filePath))
            .find((dirPath) => fs.existsSync(dirPath)) ?? process.cwd()

        return new VirtualScript(
            path.join(anchorDir, `${entryName}.le-entry.mjs`),
            filePaths.map((filePath) => `import ${JSON.stringify(filePath.replace(/\\/g, '/'))}`).join(';\n')
        )
    }

    _registerEntryModules(entries) {
        for (const [entryName, files] of Object.entries(entries)) {
            const entryScript = ClientBundler._syntheticEntryFor(entryName, files)
            this._syntheticEntries.set(entryName, entryScript.location)
            this._virtualScripts.push(entryScript)
        }
    }

    _buildOptions({ write = false, outdir = this._scriptsOutputPath } = {}) {
        return {
            entryPoints: Object.fromEntries(this._syntheticEntries),
            bundle: true,
            format: this._config.format.esbuildFormat,
            splitting: this._config.format.splitting,
            platform: 'browser',
            keepNames: true,
            write,
            outdir,
            entryNames: this._config.outputFileName.replace(/\.js$/, ''),
            chunkNames: 'chunks/[name]-[hash]',
            sourcemap: this._config.sourcemap ? 'inline' : false,
            resolveExtensions: ['.mjs', '.js', '.json'],
            plugins: [
                virtualModulesPlugin(this._virtualScripts),
                lvEsbuildPlugin()
            ],
            external: this._config.external,
            metafile: true,
            logLevel: 'silent',
            legalComments: 'none'
        }
    }

    _serializeBuild(work) {
        this._currentBuild = this._currentBuild.then(work, work)
        return this._currentBuild
    }

    _assetListFromResult(result) {
        return ClientBundler.assetsFromResult(
            result,
            this._syntheticEntries,
            (outputPath) => path.relative(this._scriptsOutputPath, outputPath).split(path.sep).join('/')
        )
    }

    _refreshAssets(result) {
        const assets = this._assetListFromResult(result)
        this._assetMap = new Map(assets.map((asset) => [asset.name, asset]))
        for (const asset of assets) {
            log.colorless('i', `Asset emitted ${asset.name} ${Buffer.byteLength(asset.content)} bytes` + (asset.entryName ? ` (name: ${asset.entryName})` : ''))
            log.decorated('i', `Asset emitted ${chalk.green(asset.name)} ${Buffer.byteLength(asset.content)} bytes` + (asset.entryName ? ` (name: ${asset.entryName})` : ''))
        }
        return assets
    }

    async _refreshWatcher(result) {
        if (!this._watcher) {
            return
        }

        const clientBundlerGroup = this._watcher.findGroup('client-bundler')
        const clientBundlerManualGroup = this._watcher.findGroup('client-bundler-manual')

        const inputs = Object.keys(result.metafile.inputs)
            .filter((entry) => !entry.includes(':'))
            .map((entry) => path.resolve(entry))
            .filter((entry) => !entry.includes(`${path.sep}node_modules${path.sep}`))
        const lvSources = []
        const plainInputs = []

        for (const input of inputs) {
            const sourcePath = await ClientBundler.lvSourceForBuildOutput(input)
            if (sourcePath) {
                lvSources.push(sourcePath)
                continue
            }

            plainInputs.push(input)
        }

        this._watcher.assignFiles(plainInputs, clientBundlerGroup)
        this._watcher.assignFiles(lvSources, clientBundlerManualGroup)
    }

    /** dispose() drops the context, so a rebuild after it has to re-establish one. */
    async _ensureContext() {
        if (!this._context) {
            this._context = await esbuild.context(this._buildOptions({ write: false }))
        }
        return this._context
    }

    async rebuild() {
        return await this._serializeBuild(async () => {
            await this._ensureContext()

            try {
                const result = await this._context.rebuild()
                this._refreshAssets(result)
                await this._refreshWatcher(result)
                this.emit('compileReady', result)
                return result
            } catch (error) {
                log.e(error)
                return null
            }
        })
    }

    async build() {
        return await this._serializeBuild(async () => {
            const result = await esbuild.build(this._buildOptions({ write: false }))
            fs.mkdirSync(this._scriptsOutputPath, { recursive: true })
            for (const outputFile of result.outputFiles) {
                fs.mkdirSync(path.dirname(outputFile.path), { recursive: true })
                fs.writeFileSync(outputFile.path, outputFile.contents)
            }
            return result
        })
    }

    createMiddleware() {
        this._middleware = ClientBundler.createDevMiddleware(this)
        return this._middleware
    }

    writeModule(modulePath, content) {
        const absPath = ClientBundler.canonicalPath(modulePath)
        const index = this._virtualScripts.findIndex(
            (script) => ClientBundler.canonicalPath(script.location) === absPath
        )
        if (index === -1) {
            throw new Error(`ClientBundler.writeModule(): Unknown virtual module "${modulePath}".`)
        }
        this._virtualScripts[index] = new VirtualScript(this._virtualScripts[index].location, content)
    }

    assetForUrl(requestUrl) {
        const relativeUrl = requestUrl.replace(/^\/scripts\/?/, '')
        return this._assetMap.get(relativeUrl)
    }

    async dispose() {
        await this._context?.dispose()
        this._context = null
    }

    static createDevMiddleware(bundler) {
        return async function clientBundlerDevMiddleware(req, res, next) {
            if (!req.url.startsWith('/scripts')) {
                next()
                return
            }

            await bundler.currentBuild

            const asset = bundler.assetForUrl(req.url)
            if (!asset) {
                next()
                return
            }

            let contentType = 'application/octet-stream'
            for (const [ext, type] of ClientBundler.ContentTypes) {
                if (asset.name.endsWith(ext)) {
                    contentType = type
                    break
                }
            }

            res.setHeader('Content-Type', contentType)
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
            res.send(asset.content)
        }
    }

    static async compile(entries, config) {
        const clientBundlerConfig = config

        const virtualScripts = []
        const entryPoints = {}
        const syntheticEntries = new Map()
        for (const entry of entries) {
            for (const file of entry.files.filter((item) => item.content)) {
                virtualScripts.push(new VirtualScript(path.resolve(file.path), file.content))
            }

            const entryScript = ClientBundler._syntheticEntryFor(entry.name, entry.files)
            virtualScripts.push(entryScript)
            entryPoints[entry.name] = entryScript.location
            syntheticEntries.set(entry.name, entryScript.location)
        }

        try {
            const result = await esbuild.build({
                entryPoints,
                bundle: true,
                format: clientBundlerConfig.format.esbuildFormat,
                splitting: clientBundlerConfig.format.splitting,
                platform: 'browser',
                keepNames: true,
                write: false,
                outdir: clientBundlerConfig.outputPath,
                entryNames: clientBundlerConfig.outputFileName.replace(/\.js$/, ''),
                sourcemap: clientBundlerConfig.sourcemap ? 'inline' : false,
                resolveExtensions: ['.mjs', '.js', '.json'],
                plugins: [
                    virtualModulesPlugin(virtualScripts),
                    lvEsbuildPlugin()
                ],
                external: clientBundlerConfig.external,
                metafile: true,
                logLevel: 'silent',
                legalComments: 'none'
            })

            const assets = ClientBundler.assetsFromResult(
                result,
                syntheticEntries,
                (outputPath) => path.basename(outputPath)
            )

            return new ValueWithReport(
                { assets },
                result.warnings.map((warning) => {
                    const text = warning.text
                    if (warning.location?.file) {
                        return new Warning(`${text} At file ${warning.location.file}:${warning.location.line}:${warning.location.column}`)
                    }
                    return new Warning(text)
                })
            )
        } catch (error) {
            const errors = Array.isArray(error?.errors) && error.errors.length > 0
                ? error.errors.map((entry) => {
                    const text = entry.text
                    if (entry.location?.file) {
                        return new Error(`${text} At file ${entry.location.file}:${entry.location.line}:${entry.location.column}`)
                    }
                    return new Error(text)
                })
                : [error instanceof Error ? error : new Error(String(error))]
            return new ValueWithReport(undefined, errors)
        }
    }
}
