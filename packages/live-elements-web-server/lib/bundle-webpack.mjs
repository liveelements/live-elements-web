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
import { WatcherGroup } from './watcher.mjs'

import serverLog from './server-log.mjs'

const log = Environment.defineLogger('webpack', { parent: serverLog, prefix: ['.Webpack'], prefixDecorated: [chalk.cyan('.Webpack')] })

export default class BundleWebpack extends EventEmitter {
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

    static compileBundle(name, files, publicPath, distPath, devTool, mode){
        const virtualModules = {}
        files.filter(file => file.content).forEach(file => {
            virtualModules[file.location] = file.content
        })
        const entries = files.map(file => file.location)
        const entriesConfig = {}
        entriesConfig[name] = entries

        const entryName = `${name}.bundle.js`

        const configuration = {
            entry: entriesConfig,
            output: {
                filename: '[name].bundle.js',
                path: `${distPath}/scripts`,
                publicPath : publicPath
            },
            devtool: devTool,
            mode: mode,
            plugins: [
                new VirtualModulesPlugin(virtualModules)
            ],
            module: {
                rules: [
                    {
                        test: /\.lv$/,
                        use: [{ loader: 'live-elements-loader' }],
                    },
                ]
            }
        }

        const memfsWithVolumne = memfs.createFsFromVolume(new memfs.Volume())
        const compiler = webpack(configuration)
        compiler.outputFileSystem = memfsWithVolumne

        return new Promise((resolve, reject) => {

            compiler.run((err, stats) => {
                if (err) 
                    reject(err)
                const info = stats.toJson()
                if (stats.hasErrors()) {
                    reject(info.errors)
                }

                if (stats.hasWarnings()) {
                    console.warn(info.warnings)
                }

                const outputPath = configuration.output.path
                const assets = info.assets.map(asset => {
                    const assetPath = path.join(outputPath, asset.name)
                    return {
                        name: asset.name,
                        path: assetPath,
                        isMainEntry: asset.name === entryName ? true : false,
                        content: memfsWithVolumne.readFileSync(assetPath).toString()
                    }
                })
                resolve({
                    warnings: stats.hasWarnings() ? info.warnings: null,
                    assets: assets
                })
            });
        })
    }

    compileExternalBundle(name, files, publicPath){
        const virtualModules = {}
        files.filter(file => file.content).forEach(file => {
            virtualModules[file.path] = file.content
        })
        const entries = files.map(file => file.path)
        const entriesConfig = {}
        entriesConfig[name] = entries

        const entryName = `${name}.bundle.js`

        const configuration = {
            entry: entriesConfig,
            output: {
                filename: '[name].bundle.js',
                path: `${this._distPath}/scripts`,
                publicPath : publicPath
            },
            devtool: this._devTool,
            mode: this._mode,
            plugins: [
                new VirtualModulesPlugin(virtualModules)
            ],
            module: {
                rules: [
                    {
                        test: /\.lv$/,
                        use: [{ loader: 'live-elements-loader' }],
                    },
                ]
            }
        }

        const memfsWithVolumne = memfs.createFsFromVolume(new memfs.Volume())
        const compiler = webpack(configuration)
        compiler.outputFileSystem = memfsWithVolumne

        return new Promise((resolve, reject) => {

            compiler.run((err, stats) => {
                if (err) 
                    reject(err)
                const info = stats.toJson()
                if (stats.hasErrors()) {
                    reject(info.errors)
                }

                if (stats.hasWarnings()) {
                    console.warn(info.warnings)
                }

                const outputPath = configuration.output.path
                const assets = info.assets.map(asset => {
                    const assetPath = path.join(outputPath, asset.name)
                    return {
                        name: asset.name,
                        path: assetPath,
                        isMainEntry: asset.name === entryName ? true : false,
                        content: memfsWithVolumne.readFileSync(assetPath).toString()
                    }
                })
                resolve({
                    warnings: stats.hasWarnings() ? info.warnings: null,
                    assets: assets
                })
            });
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
}
