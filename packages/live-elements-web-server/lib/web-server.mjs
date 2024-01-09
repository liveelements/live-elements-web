import path from 'path'
import url from 'url'
import fs from 'fs'
import express from 'express'
import { EventEmitter } from 'node:events'

import lvimport from 'live-elements-core/lvimport.mjs'
import LvDOMEmulator from './lvdomemulator.mjs'
import PackagePath from './package-path.cjs'
import ClassInfo from './class-info.mjs'
import StyleContainer from './style-loader.mjs'
import ErrorHandler from './error-handler.mjs'
import { Watcher, WatcherGroup } from './watcher.mjs'
import { BundlePackagePath } from './bundle-package-path.mjs'
import BundleWebpack from './bundle-webpack.mjs'
import  { ServerBundleSocket} from './server-bundle-socket.mjs'
import ServerRenderer from './server-renderer.mjs'
import log from './server-log.mjs'
import { BaseElement } from 'live-elements-core/baseelement.js'
import chalk from 'chalk'

class WebServerInit{

    static async run(){
        if ( !WebServer.Components )
            WebServer.Components = await WebServerInit.loadComponents()
    }

    static async loadComponents(){
        const packageDir = path.dirname(WebServer.currentDir())
        return {
            Route: (await lvimport(path.join(packageDir, 'router', 'Route.lv'))).Route,
            GetRoute: (await lvimport(path.join(packageDir, 'router', 'GetRoute.lv'))).GetRoute,
            MiddlewareRoute: (await lvimport(path.join(packageDir, 'router', 'MiddlewareRoute.lv'))).MiddlewareRoute,
            PostRoute: (await lvimport(path.join(packageDir, 'router', 'PostRoute.lv'))).PostRoute,
            ViewRoute: (await lvimport(path.join(packageDir, 'router', 'ViewRoute.lv'))).ViewRoute,
            AssetProviderCollector: (await lvimport(path.join(packageDir, 'bundle', 'collectors', 'AssetProviderCollector.lv'))).AssetProviderCollector,
            PageCollector: (await lvimport(path.join(packageDir, 'bundle', 'collectors', 'PageCollector.lv'))).PageCollector,
            RouteCollector: (await lvimport(path.join(packageDir, 'bundle', 'collectors', 'RouteCollector.lv'))).RouteCollector,
            StylesheetCollector: (await lvimport(path.join(packageDir, 'bundle', 'collectors', 'StylesheetCollector.lv'))).StylesheetCollector,
            ScopedStyleCollector: (await lvimport(path.join(packageDir, 'bundle', 'collectors', 'ScopedStyleCollector.lv'))).ScopedStyleCollector,
            PageView: (await lvimport(path.resolve(path.join(packageDir, 'view', 'PageView.lv')))).PageView
        }
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

    constructor(config, bundlePath, bundle){
        super()
        this._config = config
        this._bundlePath = bundlePath
        this._bundle = bundle

        this._bundleLookupPath = config.userBundleLookupPath 
            ? config.userBundleLookupPath 
            : BundlePackagePath.find(bundlePath)

        this._watcher = this._config.watch
            ? Watcher.createFromGroups(['server', 'style', 'webpack', 'webpack-manual'])
            : null
        
        this._domEmulator = new LvDOMEmulator({beautify: true})

        this._app = express()
        this._app.use(express.json())
        this._webpack = null
        this._serverSocket = this._config.useSocket ? new ServerBundleSocket(this._app) : null

        this._assets = null
        this._pages = []
        this._routes = []
    }

    get config(){ return this._config }
    get bundleFile(){ return this._bundleFile }
    get bundleLookupPath(){ return this._bundleLookupPath }
    get webpack(){ return this._webpack }
    get watcher(){ return this._watcher }

    prependBaseUrl(relative){ 
        return this.config.baseUrl.endsWith('/') 
            ? this.config.baseUrl + relative 
            : this.config.baseUrl + '/' + relative 
    }

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
        if ( !WebServer.Components )
            throw new Error(`WebServer.Components have not been initialized. Run 'await WebServer.Init.run()' before using WebServer.`)
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

    static async loadBundle(bundle, bundlePath, config){
        WebServer.assertInit()

        const bundleRootPath = BundlePackagePath.find(bundlePath)
        const bundleServer = new WebServer(config, bundlePath, bundle)
        if ( bundleServer._watcher ){
            const files = Watcher.scanPackage(bundleRootPath, '*.lv')
            bundleServer._watcher.assignFiles(files, bundleServer._watcher.findGroup('server'))
        }
        
        bundleServer._routes = WebServer.Components.RouteCollector.scan(bundle)
        bundleServer._scopedStyles = WebServer.Components.ScopedStyleCollector.scan(bundle)
        bundleServer._scopedStyles.resolveRelativePaths(c => bundleServer.getComponentPath(c), bundleServer.bundleLookupPath)
        
        bundleServer._styles = await StyleContainer.load(bundlePath, WebServer.Components.StylesheetCollector.scan(bundle))
        await bundleServer._styles.addScopedStyles(bundleServer._scopedStyles)

        bundleServer._assets = WebServer.Components.AssetProviderCollector.scanAndCollect(bundle, bundleRootPath)
        
        const pages = WebServer.Components.PageCollector.scanAndSetupDOM(bundle, bundleServer._domEmulator, bundleServer._config.entryScriptUrl)
        bundleServer._pages = pages.length 
            ? pages
            : WebServer.Components.PageCollector.defaultPageSetup(bundleServer._domEmulator, bundleServer._config.entryScriptUrl)

        bundleServer.addWebpack()

        return bundleServer
    }

    static async load(bundlePath, config){
        WebServer.assertInit()
        const bundle = await WebServer.loadBundleFile(bundlePath)
        return WebServer.loadBundle(bundle, bundlePath, config)
    }

    getComponentPath(c){
        var module = c.Meta.module
        var moduleSegments = module.split('.')
        if ( moduleSegments.length === 0 ){
            throw new Error(`Cannot determine components '${c.name}' module. Result is empty.`)
        }
        const modulePackagePath = PackagePath.find(moduleSegments[0], this._bundleLookupPath);
        const moduleDirectoryPath = path.join(modulePackagePath, moduleSegments.slice(1).join('/'))
        return path.join(moduleDirectoryPath, c.Meta.sourceFileName)
    }

    createViewLoader(view, placement){
        const clientApplicationLoader = 'live-elements-web-server/client/client-application-loader.mjs'
        const clientPageViewLoader = 'live-elements-web-server/client/client-pageview-loader.mjs'
        
        const bundleName = view.name.toLowerCase()
        const viewPath = this.getComponentPath(view)
        const placementLocations = placement ? placement.map(p => { 
            const placementPath = this.getComponentPath(p)
            return { location: placementPath, name: p.name, url: url.pathToFileURL(placementPath) }
        }) : []
        const placementSource = '[' + placementLocations.map(p => `{ module: import("${p.url}"), name: "${p.name}" }`).join(',') + ']'

        const viewStyles = this._scopedStyles.componentsForView(view)
        const viewAssignemntsSource = JSON.stringify({scopedStyles: viewStyles.toViewUsageAssignmentStructure(view), scopedStyleLinks: viewStyles.styleLinks() })

        const clientLoader = ClassInfo.extends(view, WebServer.Components.PageView) ? clientPageViewLoader : clientApplicationLoader
        const moduleVirtualLoader = path.join(path.dirname(viewPath), bundleName + '.loader.mjs')
        const moduleVirtualLoaderContent = [
            `import Loader from "${clientLoader}"`,
            `Loader.loadAwaitingModule(import("./${view.Meta.sourceFileName}"), "${view.name}", ${placementSource}, ${viewAssignemntsSource})`
        ].join('\n')
        return {
            bundleName: bundleName,
            loaderType: clientLoader,
            virtualLoader: moduleVirtualLoader,
            virtualLoaderContent: moduleVirtualLoaderContent,
            virtualLoaderPlacementContent: placementSource
        }
    }

    addWebpack(){
        const routes = this._routes
        const views = routes.filter(route => route.type === WebServer.Components.Route.Get && route.c )
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
            extraScripts.push(clientBundleSocketImporterAbsolute)
            virtualModules[clientBundleSocketImporterAbsolute] = clientBundleSocketImporterContent
        }

        for ( let i = 0; i < views.length; ++i ){
            const viewRoute = views[i]

            const view = viewRoute.c
            const bundleName = view.name.toLowerCase()

            const renderMode = this.config.renderMode === WebServer.RenderMode.Production ? viewRoute.render : WebServer.Components.ViewRoute.CSR
            if ( renderMode === WebServer.Components.ViewRoute.CSR ){
                const viewLoader = this.createViewLoader(view, viewRoute.placement)
                entries[viewLoader.bundleName] = [viewLoader.virtualLoader].concat(extraScripts)
                virtualModules[viewLoader.virtualLoader] = viewLoader.virtualLoaderContent
            } else {
                entries[bundleName] = extraScripts
            }
        }

        this._webpack = new BundleWebpack(
            entries, 
            this._bundlePath, 
            path.resolve(this._bundleLookupPath, 'dist'),
            { 
                watcher: this._watcher,
                mode: this.config.runMode === WebServer.RunMode.Production ? 'production' : 'development',
                publicPath: this.config.baseUrl,
                virtualModules
            }
        )
    }

    async compile(){
        if ( !this._webpack ){
            return
        }
        
        const distPath = path.join(this._bundleLookupPath, 'dist')
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

        const assetPath = path.join(this._bundleLookupPath, 'dist', 'assets')
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

        let routes = this._routes
        for ( let i = 0; i < routes.length; ++i ){
            const route = routes[i]
            if ( route.type === 0 && route.c ){ // VIEW Route
                const isSSR = route.render === WebServer.Components.ViewRoute.SSR
                const isParameterless = !WebServer.Components.Route.hasParameters(route.url)
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
        page.entryScript = '/scripts/' + route.c.name.toLowerCase() + '.bundle.js'
        const pageDOM = page.captureDOM(this._domEmulator)
        const insertionDOM = page.constructor.findInsertionElement(pageDOM.window.document)

        const placements = route.placement ? route.placement : []
        const pagePlacements = placements.map(p => {
            const instance = new p()
            instance.renderProperties = { url: req ? req.url : route.url }
            BaseElement.complete(instance)
            return instance
        })

        let expandLocation = null
        if ( pagePlacements.length ){
            pagePlacements.forEach(l => { if ( l.head ) l.head.expand(pageDOM.window.document) })
            expandLocation = pagePlacements[0].render
            for ( let i = 1; i < pagePlacements.length; ++i ){
                expandLocation.children = [pagePlacements[i]]
                expandLocation = pagePlacements[i].render
            }
            pagePlacements[0].children[0].expandTo(insertionDOM)
        }
        
        const viewStyles = this._scopedStyles.componentsForView(route.c)
        viewStyles.populateViewComponent(route.c)

        const v = WebServer.Components.ViewRoute.createView(route.c)
        if ( v instanceof WebServer.Components.PageView ){
            if ( v.head )
                v.head.expand(pageDOM.window.document)
        }

        if ( expandLocation ){
            expandLocation.children = [v]
        } else {
            v.expandTo(insertionDOM)
        }

        const behaviorResult = ServerRenderer.scanBehaviors(pageDOM.window.document, pagePlacements.length ? pagePlacements[0] : v)
        const behaviors = behaviorResult.unwrapAnd((report) => report.forEach(WebServer.logWarning))
        const behaviorScriptsUrl = this.config.baseUrl === '/' ? '/scripts/behavior/' : `${this.config.baseUrl}/scripts/behavior/`
        let compiledBundles = { assets: [] }

        const clientBehaviorEvents = path.join(WebServer.currentDir(), '../client/client-behavior-events.mjs')

        if ( behaviors.length ){
            ServerRenderer.assignBehaviorsId(0, behaviors)
            ServerRenderer.assignBehaviorsToDom(behaviors)
            const behaviorsSource = ServerRenderer.behaviorsSource(behaviors)            
            const viewPath = this.getComponentPath(route.c)
            const viewPathName = path.parse(viewPath).name.toLowerCase() + '.behaviors'
            const viewBehaviorBundlePath = path.join(path.dirname(viewPath), viewPathName + '.mjs')
            compiledBundles = await this._webpack.compileExternalBundle(
                viewPathName, 
                [
                    { path: viewBehaviorBundlePath, content: `window._bhvs_ = ${behaviorsSource}` },
                    { path: clientBehaviorEvents }
                ],
                behaviorScriptsUrl
            )
        }
        
        if ( compiledBundles.warnings ){
            log.w(compiledBundles.warnings)
        }

        route.behaviors = {
            bundles: compiledBundles.assets
        }

        const document = pageDOM.window.document
        const scripts = route.behaviors.bundles.filter(cbu => cbu.isMainEntry).map(cbu => {
            const script = document.createElement('script')
            script.src = `${behaviorScriptsUrl}${cbu.name}`
            return script
        })

        
        scripts.forEach(script => document.body.appendChild(script))
        const scopedStyleLinks = viewStyles.styleLinks(route.c)
        if ( scopedStyleLinks ){
            scopedStyleLinks.forEach(sl => {
                var link = document.createElement('link');
                link.rel = 'stylesheet'
                link.type = 'text/css'
                link.href = sl
                document.head.appendChild(link)
            })
        }

        const content = this._domEmulator.serializeDOM(pageDOM)
        return content
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
            : this.config.renderMode === WebServer.RenderMode.Production ? route.render : WebServer.Components.ViewRoute.CSR

        if ( render === WebServer.Components.ViewRoute.CSR ){
            res.send(this.readRoutePage(route))
            res.end()
        } else if ( render === WebServer.Components.ViewRoute.SSR ){
            this.renderRoute(route, req, res)
        }
    }

    getViewRouteUseDist(route, cacheDir, req, res){
        const render = route.render
        if ( render === WebServer.Components.ViewRoute.CSR ){
            res.send(this.readRoutePage(route))
            res.end()
        } else if ( render === WebServer.Components.ViewRoute.SSR ){
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
                    log.e(e)
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

        this._app.get('/scripts/behavior/*', (req, res) => {
            for ( let i = 0; i < routes.length; ++i ){
                if ( routes[i].type === 0 && routes[i].c ){ // VIEW Route
                    if ( routes[i].behaviors ){
                        for ( let j = 0; j < routes[i].behaviors.bundles.length; ++j ){
                            const bundle = routes[i].behaviors.bundles[j]
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

        for ( let i = 0; i < routes.length; ++i ){
            if ( routes[i].type === 0 && routes[i].f ){ // GET Route
                this._app.get(routes[i].url, routes[i].userMiddleware, ErrorHandler.forward(routes[i].f))
            } else if ( routes[i].type === 1 && routes[i].f ){ // POST Route
                this._app.post(routes[i].url, routes[i].userMiddleware, ErrorHandler.forward(routes[i].f))
            } else if ( routes[i].type === 0 && routes[i].c ){ // VIEW Route
                this._app.get(routes[i].url, routes[i].userMiddleware, this.getViewRoute.bind(this, routes[i]))
            } else if ( routes[i].type === 2 && routes[i].f ){ // MIDDLEWARE Route
                this._app.use(routes[i].url, routes[i].f)
            }
        }

        if ( this._serverSocket )
            this._serverSocket.listen(this.config.port, () => log.i(`Listening on port ${this.config.port}!`));
        else
            this._app.listen(this.config.port, () => log.i(`Listening on port ${this.config.port}!`))
    }

    async run(){
        const distPath = path.join(this._bundleLookupPath, 'dist')

        this._app.use('/scripts', express.static(path.join(distPath, 'scripts')))
        this._app.use('/styles', express.static(path.join(distPath, 'styles')))
        this._app.use('/', express.static(path.join(distPath, 'assets'), { index: false }))

        /// Handle routes

        let routes = this._routes
        for ( let i = 0; i < routes.length; ++i ){
            if ( routes[i].type === 0 && routes[i].f ){ // GET Route
                this._app.get(routes[i].url, ErrorHandler.forward(routes[i].f))
            } else if ( routes[i].type === 1 && routes[i].f ){ // POST Route
                this._app.post(routes[i].url, ErrorHandler.forward(routes[i].f))
            } else if ( routes[i].type === 0 && routes[i].c ){ // VIEW Route
                this._app.get(routes[i].url, this.getViewRouteUseDist.bind(this, routes[i], distPath))
            } else if ( routes[i].type === 2 && routes[i].f ){ // MIDDLEWARE Route
                this._app.use(routes[i].url, routes[i].f)
            }
        }

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
WebServer.Components    = null