import path from 'path'
import url from 'url'
import fs from 'fs'
import express from 'express'
import { EventEmitter } from 'node:events'

import lvimport from 'live-elements-core/lvimport.mjs'
import LvDOMEmulator from './lvdomemulator.mjs'
import ClassInfo from './class-info.mjs'
import StyleContainer from './style-loader.mjs'
import ErrorHandler from './error-handler.mjs'
import { Watcher, WatcherGroup } from './watcher.mjs'
import BundleWebpack from './bundle-webpack.mjs'
import  { ServerBundleSocket} from './server-bundle-socket.mjs'
import log from './server-log.mjs'
import { BaseElement } from 'live-elements-core/baseelement.js'
import chalk from 'chalk'
import { ServerApiRoute, ServerMiddlewareRoute, ServerViewRoute } from './routes.mjs'
import { VirtualScript } from './scripts.mjs'
import ComponentRegistry from './component-registry.mjs'
import { ScopedViewAssignmentCache } from './scoped-style.mjs'
import BundleData from './bundle-data.mjs'

class WebServerInit{

    static async run(){
        const packageDir = path.dirname(WebServer.currentDir())
        ComponentRegistry.add({
            Route: path.join(packageDir, 'router', 'Route.lv'),
            GetRoute: path.join(packageDir, 'router', 'GetRoute.lv'),
            MiddlewareRoute: path.join(packageDir, 'router', 'MiddlewareRoute.lv'),
            PostRoute: path.join(packageDir, 'router', 'PostRoute.lv'),
            ViewRoute: path.join(packageDir, 'router', 'ViewRoute.lv'),
            AssetProviderCollector: path.join(packageDir, 'bundle', 'collectors', 'AssetProviderCollector.lv'),
            PageCollector: path.join(packageDir, 'bundle', 'collectors', 'PageCollector.lv'),
            RouteCollector: path.join(packageDir, 'bundle', 'collectors', 'RouteCollector.lv'),
            StylesheetCollector: path.join(packageDir, 'bundle', 'collectors', 'StylesheetCollector.lv'),
            ScopedStyleCollector: path.join(packageDir, 'bundle', 'collectors', 'ScopedStyleCollector.lv'),
            PageView: path.join(packageDir, 'view', 'PageView.lv')
        })
        await ComponentRegistry.update()
    }
}

class WebServerConfiguration{
    constructor(config){
        this._runMode = config.runMode !== undefined  ? config.runMode : WebServer.RunMode.Development
        this._renderMode = config.renderMode !== undefined ? config.renderMode : this._runMode
        this._watch = config.watch !== undefined ? config.watch : false
        this._port = config.port !== undefined ? config.port : 8080
        this._baseUrl = config.baseUrl !== undefined ? config.baseUrl : '/'
        this._useSocket = config.useSocket !== undefined ? config.useSocket : true
        this._userBundleLookupPath = config.bundleLookupPath !== undefined ? config.bundleLookupPath : undefined
        this._scripstUrl = '/scripts'
        this._stylesUrl = '/styles'
        this._entryScriptName = 'main.bundle.js'
    }

    get runMode(){ return this._runMode }
    get renderMode(){ return this._renderMode }
    get watch(){ return this._watch }
    get port(){ return this._port }
    get baseUrl(){ return this._baseUrl }
    get useSocket(){ return this._useSocket }
    get scriptsUrl(){ return this._scripstUrl }
    get styles(){ return this._styles }
    get entryScriptName(){ return this._entryScriptName }
    get entryScriptUrl(){
        return this._baseUrl === '/'
            ? `${this._scripstUrl}/${this._entryScriptName}`
            : `${this._baseUrl}${this._scripstUrl}/${this._entryScriptName}`
    }
    get userBundleLookupPath(){ return this._userBundleLookupPath }
    get socketUrl(){
        const host = this.baseUrl === '/' ? 'localhost' : (new URL(this.baseUrl)).hostname
        return `ws://${host}:${this.port}`
    }

    static renderModeFromString(mode){
        if ( mode === 'development' )
            return WebServer.RenderMode.Development
        if ( mode === 'production' )
            return WebServer.RenderMode.Production
        throw new Error(`Unknown render mode (development/production): ${mode}`)
    }
}

export default class WebServer extends EventEmitter{

    constructor(config, bundle){
        super()
        this._config = config
        this._bundle = bundle

        this._bundleLookupPath = config.userBundleLookupPath 
            ? config.userBundleLookupPath 
            : bundle.packagePath

        this._watcher = this._config.watch
            ? Watcher.createFromGroups(['server', 'style', 'webpack', 'webpack-manual'])
            : null
        
        this._domEmulator = new LvDOMEmulator({beautify: true})

        this._scopedViewAssignmentCache = new ScopedViewAssignmentCache()

        this._app = express()
        this._app.use(express.json())
        this._webpack = null
        if ( this._config.useSocket ){
            this._serverSocket = new ServerBundleSocket(this._app)
            this._serverSocket.onAction('update-use', rootView => this.updateUse(rootView))
        }

        this._assets = null
        this._pages = []
        this._routes = []
    }

    get config(){ return this._config }
    get bundleFile(){ return this._bundle.file }
    get bundleLookupPath(){ return this._bundleLookupPath }
    get webpack(){ return this._webpack }
    get watcher(){ return this._watcher }

    static currentDir(){ 
        return path.dirname(url.fileURLToPath(import.meta.url)) 
    }

    static urlToFileName(url){
        const cacheUrl = url.startsWith('/') ? url.substr(1) : url
        const fileName = cacheUrl.replaceAll('/', '-')
        const fileNameResolve = fileName 
            ? fileName.startsWith('index') ? fileName + '_' : fileName
            : 'index'
        return fileNameResolve + '.html'
    }

    static logWarning(message){
        log.decorated('w', chalk.yellowBright(`WARNING: ${message}`))
        log.colorless('w', `WARNING: ${message}`)
    }

    static assertInit(){
        if ( !ComponentRegistry.Components.Route )
            throw new Error(`ComponentRegistry.Components have not been initialized. Run 'await WebServer.Init.run()' before using WebServer.`)
    }

    static async loadBundleFile(bundlePath){
        let res = await lvimport(bundlePath)
        var keys = Object.keys(res)
        if ( keys.length > 1 ){
            throw new Error("Bundle file should only export a single Bundle object.")
        }
    
        const bundle = res[keys[0]]
        if ( bundle.constructor.name !== 'Bundle' ){
            throw new Error("Bundle file should only export a single Bundle object.")
        }
        return bundle
    }

    static async loadBundle(bundle, config){
        WebServer.assertInit()

        const bundleServer = new WebServer(config, bundle)
        if ( bundleServer._watcher ){
            const files = Watcher.scanPackage(bundle.packagePath, '*.lv')
            bundleServer._watcher.assignFiles(files, bundleServer._watcher.findGroup('server'))
        }
        
        const bundleScan = await bundle.scan([
            ComponentRegistry.Components.RouteCollector.create(),
            ComponentRegistry.Components.AssetProviderCollector.create(),
            ComponentRegistry.Components.ScopedStyleCollector.create(),
            ComponentRegistry.Components.StylesheetCollector.create(),
            ComponentRegistry.Components.PageCollector.create(bundleServer._domEmulator, bundleServer._config.entryScriptUrl)
        ])

        bundleServer._routes = bundleScan.routes
        bundleServer._assets = bundleScan.assets.data
        bundleServer._scopedStyles = bundleScan.scopedStyles
        bundleServer._styles = await StyleContainer.load(bundle.file, bundleScan.styles)
        bundleServer._pages = bundleScan.pages

        try{ await bundleServer._styles.addScopedStyles(bundleServer._scopedStyles) } catch ( e ) { throw new Error(e.message) }        

        bundleServer.addWebpack()

        return bundleServer
    }

    createViewLoader(view, placement){
        const clientApplicationLoader = 'live-elements-web-server/client/client-application-loader.mjs'
        const clientPageViewLoader = 'live-elements-web-server/client/client-pageview-loader.mjs'
        
        const bundleName = view.name.toLowerCase()
        const viewPath = ComponentRegistry.findComponentPath(view, this.bundleLookupPath)
        const placementLocations = placement ? placement.map(p => { 
            const placementPath = ComponentRegistry.findComponentPath(p, this.bundleLookupPath)
            return { location: placementPath, name: p.name, url: url.pathToFileURL(placementPath) }
        }) : []
        const placementSource = '[' + placementLocations.map(p => `{ module: import("${p.url}"), name: "${p.name}" }`).join(',') + ']'

        const viewStyles = this._scopedStyles.componentsForView(view)
        const viewAssignmentStructure = this._scopedViewAssignmentCache.assignmentStructure(viewStyles, view)
        const viewAssignmentsSource = JSON.stringify({
            scopedStyles: viewAssignmentStructure,
            scopedStyleLinks: viewStyles.styleLinks(),
            scopedStyleAssertionSupport: this._serverSocket && this.config.runMode === WebServer.RunMode.Development
        })

        const clientLoader = ClassInfo.extends(view, ComponentRegistry.Components.PageView) ? clientPageViewLoader : clientApplicationLoader
        const moduleVirtualLoader = path.join(path.dirname(viewPath), bundleName + '.loader.mjs')
        const moduleVirtualLoaderContent = [
            `import Loader from "${clientLoader}"`,
            `Loader.loadAwaitingModule(import("./${view.Meta.sourceFileName}"), "${view.name}", ${placementSource}, ${viewAssignmentsSource})`
        ].join('\n')
        return {
            bundleName: bundleName,
            loaderType: clientLoader,
            virtualLoader: moduleVirtualLoader,
            virtualLoaderContent: moduleVirtualLoaderContent,
            virtualLoaderPlacementContent: placementSource,
            virtualLoaderViewAssignments: viewAssignmentsSource
        }
    }

    addWebpack(){
        const routes = this._routes
        const views = routes.viewRoutes()
        const entries = {}, virtualModules = {}

        const clientBundleSocket = 'live-elements-web-server/client/client-bundle-socket.mjs'
        let extraScripts = []
        if ( this._serverSocket ){
            const clientBundleSocketImporter = clientBundleSocket.substring(0, clientBundleSocket.length - 4) + '.loader.mjs'
            const clientBundleSocketImporterAbsolute = path.join(WebServer.currentDir(), clientBundleSocketImporter)
            const clientBundleSocketImporterContent = [
                `import ClientBundleSocket from "${clientBundleSocket}"`,
                `window.clientBundleSocket = new ClientBundleSocket("${this.config.socketUrl}")`
            ].join('\n')
            const vscript = new VirtualScript(clientBundleSocketImporterAbsolute, clientBundleSocketImporterContent)
            extraScripts.push(vscript)
            virtualModules[clientBundleSocketImporterAbsolute] = clientBundleSocketImporterContent
        }

        for ( let i = 0; i < views.length; ++i ){
            const viewRoute = views[i]

            const view = viewRoute.c
            const bundleName = view.name.toLowerCase()

            extraScripts.forEach(script => viewRoute.addScript(script))

            const renderMode = this.config.renderMode === WebServer.RenderMode.Production ? viewRoute.render : ComponentRegistry.Components.ViewRoute.CSR
            if ( renderMode === ComponentRegistry.Components.ViewRoute.CSR ){
                const viewLoader = this.createViewLoader(view, viewRoute.placement)
                const viewLoaderScript = new VirtualScript(viewLoader.virtualLoader, viewLoader.virtualLoaderContent)
                virtualModules[viewLoader.virtualLoader] = viewLoader.virtualLoaderContent
                viewRoute.addScript(viewLoaderScript)    
            }
            if ( viewRoute.scripts.length )
                entries[bundleName] = viewRoute.scripts.map(script => script.location)
        }

        this._webpack = new BundleWebpack(
            entries, 
            this._bundlePath, 
            path.resolve(this.bundleLookupPath, 'dist'),
            { 
                watcher: this._watcher,
                mode: this.config.runMode === WebServer.RunMode.Production ? 'production' : 'development',
                publicPath: this.config.baseUrl,
                virtualModules
            }
        )
    }

    async updateUse(rootView){
        await this._scopedStyles.updateStylesFromClient(rootView, this.bundleLookupPath)
        this._scopedStyles.resolveRelativePaths(this.bundleLookupPath)

        const view = this._scopedStyles.findViewByName(rootView.path)
        const viewStyles = this._scopedStyles.componentsForView(view)
        const viewAssignmentStructure = this._scopedViewAssignmentCache.updateAssignmentStructure(viewStyles, rootView)
        const viewAssignemntsToSend = {
            scopedStyles: viewAssignmentStructure,
            scopedStyleLinks: viewStyles.styleLinks()
        }

        try{ await this._styles.addScopedStyles(this._scopedStyles) } catch ( e ) { throw new Error(e.message) }
        
        this._serverSocket.sendActionToClients('reload-use', [viewAssignemntsToSend])
        
        const viewRoutes = this._routes.viewRoutes()
        const viewRoute = viewRoutes.find(vr => vr.c === view)
        if ( viewRoute ){
            const viewLoader = this.createViewLoader(view, viewRoute.placement)
            const virtualModules = this._webpack.virtualModulesPlugin
            virtualModules.writeModule(viewLoader.virtualLoader, viewLoader.virtualLoaderContent)
        }
    }

    async compile(){
        if ( !this._webpack ){
            return
        }
        
        const distPath = path.join(this.bundleLookupPath, 'dist')
        if ( !fs.existsSync(distPath) )
            fs.mkdirSync(distPath)

        const stylePath = path.join(distPath, 'styles')
        if ( !fs.existsSync(stylePath) )
            fs.mkdirSync(stylePath)

        for ( let i = 0; i < this._styles.outputs.length; ++i ){
            let style = this._styles.outputs[i]
            const styleOutputPath = path.join(stylePath, `${style.output}`)
            fs.writeFileSync(styleOutputPath, style.content)
            log.i(`Asset written: ${path.relative(distPath, styleOutputPath)}`)
        }

        const assetPath = path.join(this.bundleLookupPath, 'dist', 'assets')
        if ( !fs.existsSync(assetPath) )
            fs.mkdirSync(assetPath, { recursive: true })

        for ( let i = 0; i < this._assets.length; ++i ){
            const assetOutputPath = path.join(assetPath, this._assets[i].output)
            const assetOutputDir = path.dirname(assetOutputPath)
            if ( !fs.existsSync(assetOutputDir) )
                fs.mkdirSync(assetOutputDir, { recursive: true })

            fs.writeFileSync(assetOutputPath, fs.readFileSync(this._assets[i].src))
            log.i(`Asset written: ${path.relative(distPath, assetOutputPath)}`)
        }
        
        let collectedBehaviors = []

        const viewRoutes = this._routes.viewRoutes()
        for ( let i = 0; i < viewRoutes.length; ++i ){
            const route = viewRoutes[i]
            const isSSR = route.render === ComponentRegistry.Components.ViewRoute.SSR
            const isParameterless = !ComponentRegistry.Components.Route.hasParameters(route.url)
            const cacheable = isSSR && isParameterless

            if ( cacheable ){
                const content = await this.renderRouteContent(route)
                const routeUrl = route.url.replaceAll('*', '-')
                const routePath = path.join(distPath, WebServer.urlToFileName(routeUrl))
                log.i(`Route written: ${path.relative(distPath, routePath)}`)
                fs.writeFileSync(routePath, content)

                route.behaviors.bundles.forEach(bundle => {
                    if ( !collectedBehaviors.find(cb => cb.name === bundle.name) ){
                        collectedBehaviors.push(bundle)
                    }
                })
            }
        }

        if ( collectedBehaviors.length ){
            const behaviorsPath = path.join(distPath, 'scripts', 'behavior')
            if ( !fs.existsSync(behaviorsPath) )
                fs.mkdirSync(behaviorsPath, { recursive: true })

            for ( let j = 0; j < collectedBehaviors.length; ++j ){
                const behavior = collectedBehaviors[j]
                const behaviorPath = `${behaviorsPath}/${behavior.name}`
                fs.writeFileSync(behaviorPath, behavior.content)
                log.i(`Behavior script written: scripts/behavior/${behavior.name}`)
            }
        }


        this._webpack.compiler.run((error, stats) => {
            if (error) {
                log.e('Compilation failed:', error)
            } else {
                log.d(`Webpack Stats: ${stats.toString({}).split('\n').join('\n    ')}`)
                log.i(`Compilation succeeded at: ${distPath}`)
            }
        })
    }

    findPageByOutput(output){
        return this._pages.find( page => page.output === output )
    }

    readRoutePage(route){
        const page = route.page ? route.page : this.findPageByOutput('index.html').page
        if ( !route.pageContent ){
            page.entryScript = '/scripts/' + route.c.name.toLowerCase() + '.bundle.js'
            route.pageDOM = page.captureDOM(this._domEmulator)
            route.pageContent = this._domEmulator.serializeDOM(route.pageDOM)
        }
        return route.pageContent
    }

    async renderRouteContent(route, req){
        const page = route.page ? route.page : this.findPageByOutput('index.html').page

        const viewStyles = this._scopedStyles.componentsForView(route.c)
        viewStyles.populateViewComponent(route.c)

        const renderResult = await ServerViewRoute.createRender(
            route, 
            req, 
            page, 
            this._domEmulator, 
            this.config.baseUrl, 
            this.bundleLookupPath, 
            this.webpack,
            viewStyles
        )
        const render = renderResult.unwrapAnd(report => report.forEach(WebServer.logWarning))
        return render
    }

    renderRoute(route, req, res, cacheDir){
        if ( route.renderContent )
            return res.send(route.renderContent)

        if ( cacheDir ){
            const cachePath = path.join(cacheDir, WebServer.urlToFileName(route.url))
            if ( fs.existsSync(cachePath ) ){
                return res.sendFile(cachePath)
            }
        }

        this.renderRouteContent(route, req).then(content => {
            route.renderContent = content
            res.send(route.renderContent).end()
        }).catch(e => {
            log.e(e)
        })
    }

    getViewRoute(route, req, res){
        const render = this.config.runMode === WebServer.RunMode.Production 
            ? route.render 
            : this.config.renderMode === WebServer.RenderMode.Production ? route.render : ComponentRegistry.Components.ViewRoute.CSR

        if ( render === ComponentRegistry.Components.ViewRoute.CSR ){
            res.send(this.readRoutePage(route))
            res.end()
        } else if ( render === ComponentRegistry.Components.ViewRoute.SSR ){
            this.renderRoute(route, req, res)
        }
    }

    getViewRouteUseDist(route, cacheDir, req, res){
        const render = route.render
        if ( render === ComponentRegistry.Components.ViewRoute.CSR ){
            res.send(this.readRoutePage(route))
            res.end()
        } else if ( render === ComponentRegistry.Components.ViewRoute.SSR ){
            this.renderRoute(route, req, res, cacheDir)
        }
    }

    async serve(){
        let routes = this._routes
        
        this._webpack.createMiddleware()
        this._app.use( this._webpack.middleware )

        if ( this._watcher ){
            const styleGroup = this._watcher.findGroup('style')
            styleGroup.onFileChange = (file) => {
                this._styles.reloadInputFile(file).catch(e => {
                    log.e(e.message)
                })
            }
            this._watcher.assignFiles(this._styles.inputFiles(), styleGroup)
            
            if ( this._serverSocket ){
                this._styles.on('change', (outputs) => {
                    log.i(`Reloading styles: ${outputs.join(',')}`)
                    this._serverSocket.sendActionToClients('reload-style', [outputs])
                })
            }
        }

        if ( this._webpack ){
            this._webpack.on('compileReady', () => {
                if ( this._serverSocket ){
                    this._serverSocket.sendActionToClients('reload', [])
                }
            })
        }
    
        /// Handle styles
    
        for ( let i = 0; i < this._styles.outputs.length; ++i ){
            let style = this._styles.outputs[i]
            this._app.get(`/styles/${style.output}`, (_req, res) => {
                res.setHeader('Content-Type', 'text/css');
                res.send(style.content);
            })
        }

        // Handle Assets
        
        for ( let i = 0; i < this._assets.length; ++i ){
            this._app.get('/' + this._assets[i].output, (_req, res) => {
                res.sendFile(this._assets[i].src)
            })
        }

        // Handle Behaviors

        const viewRoutes = routes.viewRoutes()
        this._app.get('/scripts/behavior/*', (req, res) => {
            for ( let i = 0; i < viewRoutes.length; ++i ){
                if ( ServerViewRoute.isType(viewRoutes[i]) ){ // VIEW Route
                    if ( viewRoutes[i].behaviors ){
                        for ( let j = 0; j < viewRoutes[i].behaviors.bundles.length; ++j ){
                            const bundle = viewRoutes[i].behaviors.bundles[j]
                            if ( `/scripts/behavior/${bundle.name}` === req.url){
                                res.setHeader('Content-Type', 'text/js')
                                res.send(bundle.content)
                                return
                            }
                        }
                    }
                }
            }
            res.status(404).send()
        })

        /// Handle routes

        routes.each((route) => {
            if ( ServerViewRoute.isType(route) ){
                this._app.get(route.url, route.userMiddleware, this.getViewRoute.bind(this, route))
            } else if ( ServerApiRoute.isType(route) && route.type === ServerApiRoute.GET ){
                this._app.get(route.url, route.userMiddleware, ErrorHandler.forward(route.f))
            } else if ( ServerApiRoute.isType(route) && route.type === ServerApiRoute.POST ){
                this._app.post(route.url, route.userMiddleware, ErrorHandler.forward(route.f))
            } else if ( ServerMiddlewareRoute.isType(route) ){
                this._app.use(route.url, route.f)
            }
        })

        if ( this._serverSocket )
            this._serverSocket.listen(this.config.port, () => log.i(`Listening on port ${this.config.port}!`));
        else
            this._app.listen(this.config.port, () => log.i(`Listening on port ${this.config.port}!`))
    }

    async run(){
        const distPath = path.join(this.bundleLookupPath, 'dist')

        this._app.use('/scripts', express.static(path.join(distPath, 'scripts')))
        this._app.use('/styles', express.static(path.join(distPath, 'styles')))
        this._app.use('/', express.static(path.join(distPath, 'assets'), { index: false }))

        /// Handle routes

        let routes = this._routes
        routes.each(route => {
            if ( ServerViewRoute.isType(route) ){
                this._app.get(route.url, this.getViewRouteUseDist.bind(this, route, distPath))
            } else if ( ServerApiRoute.isType(route) && route.type === ServerApiRoute.GET ){
                this._app.get(route.url, ErrorHandler.forward(route.f))
            } else if ( ServerApiRoute.isType(route) && route.type === ServerApiRoute.POST ){
                this._app.post(route.url, ErrorHandler.forward(route.f))
            } else if ( ServerMiddlewareRoute.isType(route) ){
                this._app.use(route.url, route.f)
            }
        })

        if ( this._serverSocket )
            this._serverSocket.listen(this.config.port, () => log.i(`Listening on port ${this.config.port}!`));
        else
            this._app.listen(this.config.port, () => log.i(`Listening on port ${this.config.port}!`))
    }
}

WebServer.RunMode = {
    Production: 0,
    Development: 1
}

WebServer.RenderMode = {
    Production: 0,
    Development: 1
}

WebServer.Configuration = WebServerConfiguration
WebServer.Init          = WebServerInit