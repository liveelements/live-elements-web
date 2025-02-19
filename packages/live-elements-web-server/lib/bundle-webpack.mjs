import { EventEmitter } from 'node:events'
import middleware from 'webpack-dev-middleware'
import VirtualModulesPlugin from 'webpack-virtual-modules'
import webpack from 'webpack'
import chalk from 'chalk'
import path from 'path'
import fs from 'fs'
import memfs from 'memfs'

import lvimport from 'live-elements-core/lvimport.mjs'
import { Environment } from './environment.mjs'
import Warning from '../shared/errors/warning.mjs'
import serverLog from './server-log.mjs'
import ValueWithReport from './core/value-with-report.mjs'

const log = Environment.defineLogger('webpack', { parent: serverLog, prefix: ['.Webpack'], prefixDecorated: [chalk.cyan('.Webpack')] })

class WebpackBundlerConfig{
    constructor(opts){
        if ( !('outputPath' in opts) ){
            throw new Error(`WebpackBundler.Config: outputPath is required in constructor object.`)
        }
        if ( !('publicPath' in opts) ){
            throw new Error(`WebpackBundler.Config: publicPath is required in constructor object.`)
        }

        this._outputFileName  = 'outputFileName' in opts ? opts.outputFileName : '[name].bundle.js'
        this._mode            = 'mode' in opts ? opts.mode : 'development'
        this._devTool         = 'devTool' in opts 
            ? opts.devTool
            : this._mode === 'production' ? false : 'inline-source-map'
        this._lvloader        = 'lvloader' in opts ? opts.lvloader : 'live-elements-loader'
        this._lvloaderOptions = 'lvloaderOptions' in opts ? opts.lvloaderOptions : {}
        
        this._outputPath      = opts.outputPath
        this._publicPath      = opts.publicPath
    }

    static create(opts){ return new WebpackBundlerConfig(opts) }

    get outputFileName(){ return this._outputFileName }
    get mode(){ return this._mode }
    get devTool(){ return this._devTool }
    get lvloader(){ return this._lvloader }
    get lvloaderOptions(){ return this._lvloaderOptions }
    get outputPath(){ return this._outputPath }
    get publicPath(){ return this._publicPath }
}

class WebpackBundlerEntry{
    constructor(name, files){
        this._name = name
        this._files = files
    }

    static create(name, files){ return new WebpackBundlerEntry(name, files) }

    get name(){ return this._name }
    get files(){ return this._files }
}

WebpackBundlerConfig.Mode = {
    Development: 'development',
    Production: 'production'
}

export default class WebpackBundler extends EventEmitter {
    constructor(entries, bundle, distPath, config) {
        super()
        const publicPath = (config.publicPath
            ? config.publicPath.endsWith('/') 
                ? config.publicPath
                : config.publicPath + '/'
            : '/') + 'scripts/'

        this._publicPath = publicPath
        this._distPath = distPath

        const devTool = config.mode === 'production' ? false : 'inline-source-map'
        this._devTool = devTool
        this._mode = config.mode ? config.mode : 'development'
        this._virtualModulesPlugin = new VirtualModulesPlugin(config.virtualModules)

        log.i(`Webpack baseUrl '${config.publicPath}' `)

        const webpackOptions = {
            entry: entries,
            output: {
                filename: '[name].bundle.js',
                path: `${distPath}/scripts`,
                publicPath : publicPath
            },
            devtool: devTool,
            resolve: { alias: config.alias ? config.alias : [] },
            mode: this._mode,
            plugins: [this._virtualModulesPlugin],
            module: {
                rules: [
                    {
                        test: /\.lv$/,
                        use: [{ loader: 'live-elements-loader' }],
                    },
                ]
            }
        };

        this._watcher = config.watcher ? config.watcher : null
        if ( this._watcher ){
            const manualGroup = this._watcher.findGroup('webpack-manual')
            if ( manualGroup ){
                manualGroup.onFileChange = (file) => {
                    if ( this._middleware ){
                        lvimport(file).catch( e => log.e(e) )
                    }
                }
            }
        }
        this._compiler = webpack(webpackOptions)
        this._compiler.hooks.infrastructureLog.tap('WebpackLogPlugin', (_name, _type, args) => {
            log.i(args.join(','))
        })
        this._compiler.hooks.afterCompile.tap('CompileReadyPlugin', compilation => {
            if ( this._watcher ){
                const allDependencies = Array.from(compilation.fileDependencies)
                const fileDependencies = allDependencies.filter(dep => fs.existsSync(dep) && !fs.statSync(dep).isDirectory())

                const webpackGroup = this._watcher.findGroup('webpack')
                this._watcher.assignFiles(fileDependencies, webpackGroup)

                const webpackManualGroup = this._watcher.findGroup('webpack-manual')
                const lvBuildFiles = fileDependencies.filter(dep => dep.endsWith('.lv.mjs'))
                let lvFiles = []
                lvBuildFiles.forEach(file => {
                    const filename = path.basename(file, '.mjs')
                    for (const [key, value] of Object.entries(this._watcher.files)) {
                        if ( key.endsWith(filename) ){
                            if ( value !== webpackGroup  ){
                                lvFiles.push(key)
                            }
                            break
                        }
                    }
                })
                this._watcher.assignFiles(lvFiles, webpackManualGroup)
            }
        })
        
        this._compiler.hooks.done.tap('CompileReadyPlugin', (stats) => {
            const assetInfo = stats.toJson({ assets: true }).assets.filter(asset => asset.emitted)
            const assetLog = assetInfo.map( asset => `Asset emitted ${asset.name} ${asset.size} bytes` + (asset.chunkNames && asset.chunkNames.length ? ` (name: ${asset.chunkNames.join(',')})` : ''))
            const assetLogDecorate = assetInfo.map( asset => `Asset emitted ${chalk.green(asset.name)} ${asset.size} bytes` + (asset.chunkNames && asset.chunkNames.length ? ` (name: ${asset.chunkNames.join(',')})` : ''))
            for ( let i = 0; i < assetLog.length; ++i ){
                log.colorless('i', assetLog[i])
            }
            for ( let i = 0; i < assetLogDecorate.length; ++i ){
                log.decorated('i', assetLogDecorate[i])
            }
            this.emit('compileReady', stats)
        })
    }

    createMiddleware(){
        this._middleware = middleware(this._compiler, {
            publicPath: '/scripts',
            stats: 'errors-warnings'
        })
        return this._middleware
    }

    get compiler() { return this._compiler; }
    get middleware() { return this._middleware; }
    get virtualModulesPlugin(){ return this._virtualModulesPlugin }

    static compile(entries, config){
        const virtualModules = {}
        const entriesConfig = {}
        if ( entries.length === 0 ){
            return Promise.resolve(ValueWithReport.fromError(`No files specified`))
        }
        entries.forEach(entry => {    
            entry.files.filter(file => file.content).forEach(file => {
                virtualModules[file.path] = file.content
            })

            entriesConfig[entry.name] = entry.files.map(file => file.path)
        })

        const mainEntries = entries.map(entry => ({
            output: config.outputFileName.replace('[name]', entry.name),
            name: entry.name
        }))

        const configuration = {
            entry: entriesConfig,
            output: {
                filename: config.outputFileName,
                path: config.outputPath,
                publicPath : config.publicPath
            },
            devtool: config.devTool,
            mode: config.mode,
            plugins: [ new VirtualModulesPlugin(virtualModules) ],
            module: {
                rules: [
                    {
                        test: /\.lv$/,
                        use: [{ 
                            loader: config.lvloader,
                            options: config.lvloaderOptions
                        }],
                    },
                ]
            }
        }

        const memfsWithVolumne = memfs.createFsFromVolume(new memfs.Volume())
        const compiler = webpack(configuration)
        compiler.outputFileSystem = memfsWithVolumne

        return new Promise((resolve) => {
            compiler.run((err, stats) => {
                if (err) {
                    resolve(ValueWithReport.fromError(err))
                    return
                }
                const info = stats.toJson()
                if (stats.hasErrors()) {
                    resolve(ValueWithReport.fromErrors(info.errors.map(e => new Error(e.message))))
                    return
                }

                const warnings = stats.hasWarnings()
                    ? info.warnings.map(w => new Warning(w.message))
                    : []
                
                const outputPath = configuration.output.path
                const assets = info.assets.map(asset => {
                    const assetPath = path.join(outputPath, asset.name)
                    const mainEntry = mainEntries.find(me => me.output === asset.name)
                    return {
                        name: asset.name,
                        path: assetPath,
                        isMainEntry: mainEntry ? true : false,
                        entryName: mainEntry ? mainEntry.name : null,
                        content: memfsWithVolumne.readFileSync(assetPath).toString()
                    }
                })
                resolve(new ValueWithReport({ assets: assets }, warnings))
            });
        })
    }
}

WebpackBundler.Entry  = WebpackBundlerEntry
WebpackBundler.Config = WebpackBundlerConfig
