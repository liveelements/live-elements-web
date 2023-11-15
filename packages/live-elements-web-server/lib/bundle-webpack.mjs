import { EventEmitter } from 'node:events'
import middleware from 'webpack-dev-middleware'
import VirtualModulesPlugin from 'webpack-virtual-modules'
import webpack from 'webpack'
import chalk from 'chalk'
import path from 'path'
import fs from 'fs'

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

        const devTool = config.mode === 'production' ? false : 'inline-source-map'

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
            mode: config.mode ? config.mode : 'development',
            plugins: [
                new VirtualModulesPlugin(config.virtualModules)
            ],
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
            const webpackGroup = new WatcherGroup('webpack')
            this._watcher.addGroup(webpackGroup)
            const webpackManualGroup = new WatcherGroup('webpack-manual')
            webpackManualGroup.onFileChange = (file) => {
                if ( this._middleware ){
                    lvimport(file).catch( e => log.e(e) )
                }
            }
            this._watcher.addGroup(webpackManualGroup)
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
}
