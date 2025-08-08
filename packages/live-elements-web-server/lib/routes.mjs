import ComponentRegistry from "./component-registry.mjs"
import ValueWithReport from "./core/value-with-report.mjs"
import ServerRenderer from "./server-renderer.mjs"
import { BaseElement } from 'live-elements-core/baseelement.js'

import log from './server-log.mjs'

import path from 'path'
import url from 'url'
import WebpackBundler from "./bundle-webpack.mjs"

export class ServerRoute{
    constructor(url, userMiddleware, f){
        this._userMiddleware = userMiddleware
        this._url = url
        this._f = f
    }

    get userMiddleware(){ return this._userMiddleware }
    get url(){ return this._url }
    get f(){ return this._f }

    appendMiddleware(middlewares){
        if ( !Array.isArray(this._userMiddleware) ){
            this._userMiddleware = [this._userMiddleware]
        }
        const toAdd = Array.isArray(middlewares) ? middlewares : [middlewares]
        this._userMiddleware = this._userMiddleware.concat(toAdd)
    }

    typeString(){ return 'route' }
}

export class ServerApiRoute extends ServerRoute{
    constructor(url, userMiddleware, f, type){
        super(url, userMiddleware, f)
        this._type = type
    }

    get type(){ return this._type }
    static isType(ob){ return ob instanceof ServerApiRoute }

    typeString(){ return this._type === ServerApiRoute.GET ? 'api/get' : 'api/post' }
}

ServerApiRoute.GET  = 1
ServerApiRoute.POST = 2

export class ServerMiddlewareRoute extends ServerRoute{
    constructor(url, userMiddleware, f){
        super(url, userMiddleware, f)
    }

    static isType(ob){ return ob instanceof ServerMiddlewareRoute }

    typeString(){ return 'middleware' }
}

export class ServerViewRoute extends ServerRoute{

    constructor(url, userMiddleware, f, c, render, data, placement, page){
        super(url, userMiddleware, f)
        this._c            = c
        this._render       = render
        this._data         = data
        this._placement    = placement
        this._page         = page
        this._renders      = []
        this._scripts      = []
        this._styles       = []
        this._bundleScript = null
        this._pageInfo     = null
    }

    get c(){ return this._c }
    get render(){ return this._render }
    get placement(){ return this._placement }
    get data(){ return this._data }
    get page(){ return this._page }
    get pageInfo(){ return this._pageInfo }
    get scripts(){ return this._scripts }
    get styles(){ return this._styles }
    get bundleScript(){ return this._bundleScript }

    addStyle(style){ this._styles.push(style) }
    addScript(script){ this._scripts.push(script) }
    setBundleScript(script){ this._bundleScript = script }

    static isType(ob){ return ob instanceof ServerViewRoute }
    typeString(){ return 'view' }

    urlPathToFileName(){
        let filename = this.url.replace(/_/g, '__')
        filename = filename.replace(/\//g, '_')
        filename = filename.replace(/:/g, '_')
        const queryParamIndex = filename.indexOf('?');
        if (queryParamIndex !== -1) {
            filename = filename.substring(0, queryParamIndex);
        }
        if (filename.startsWith('_')) {
            filename = filename.substring(1);
        }
        return filename
    }

    static async createRender(route, data, req, page, domEmulator, baseUrl, bundleLookupPath, distPath, scopedStyleLinks, viewStyles){
        const currentDir = path.dirname(url.fileURLToPath(import.meta.url)) 
        const packageDir = path.dirname(currentDir)

        ComponentRegistry.add({
            ViewRoute: path.join(packageDir, 'router', 'ViewRoute.lv'),
            PageView: path.resolve(path.join(packageDir, 'view', 'PageView.lv'))
        })
        await ComponentRegistry.update()

        page.entryScript = route.bundleScript ? '/scripts/' + route.bundleScript : null
        const pageDOM = page.captureDOM(domEmulator)
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

        const info = req 
            ? { url: req.url, render: 'S' }
            : { url: route.url, render: 'S-C' }

        const v = ComponentRegistry.Components.ViewRoute.createView(route.c, data, info)
        if ( v instanceof ComponentRegistry.Components.PageView ){
            if ( v.head )
                v.head.expand(pageDOM.window.document)
        }

        if ( expandLocation ){
            expandLocation.children = [v]
        } else {
            v.expandTo(insertionDOM)
        }

        const viewPath = ComponentRegistry.findComponentPath(route.c, bundleLookupPath)
        const viewPathName = path.parse(viewPath).name.toLowerCase() + '.behaviors'
        const viewBehaviorBundlePath = path.join(path.dirname(viewPath), viewPathName + '.mjs')
        const viewPackage = route.c.Meta.module.substr(0, route.c.Meta.module.indexOf('.'))

        const behaviorResult = ServerRenderer.scanBehaviors(
            pageDOM.window.document, 
            pagePlacements.length ? pagePlacements[0] : v, 
            viewBehaviorBundlePath,
            viewPackage,
            viewStyles
        )
        const behaviorReport = behaviorResult.hasReport ? behaviorResult.report : null
        const behaviors = behaviorResult.behaviors
        const behaviorScriptsUrl = baseUrl === '/' ? '/scripts/behavior/' : `${baseUrl}/scripts/behavior/`
        let compiledBundles = { assets: [] }

        const clientBehaviorEvents = path.join(currentDir, '../client/client-behavior-events.mjs')

        if ( behaviors.length ){
            ServerRenderer.assignBehaviorsId(0, behaviors)
            ServerRenderer.assignBehaviorsToDom(behaviors)
            const behaviorsSource = ServerRenderer.behaviorsSource(behaviors)            

            const compiledBundlesResult = await WebpackBundler.compile(
                [
                    WebpackBundler.Entry.create('main', [
                        { path: viewBehaviorBundlePath, content: `window._bhvs_ = ${behaviorsSource}` },
                        { path: clientBehaviorEvents }
                    ])
                ],
                WebpackBundler.Config.create({
                    mode: 'production',
                    outputFileName: `${path.parse(viewPath).name.toLowerCase()}.[name].bundle.js`,
                    publicPath: behaviorScriptsUrl,
                    outputPath: path.join(distPath, 'behaviors')
                })
            )

            const compiledBundles = compiledBundlesResult.unwrapAnd((_errors, warning) => {
                warning.forEach(w => log.w(w.message))
            })
            
            if ( !compiledBundlesResult.hasErrors ){
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
                
                if ( scopedStyleLinks ){
                    scopedStyleLinks.forEach(sl => {
                        var link = document.createElement('link');
                        link.rel = 'stylesheet'
                        link.type = 'text/css'
                        link.href = sl
                        document.head.appendChild(link)
                    })
                }
        
                const content = domEmulator.serializeDOM(pageDOM)
                return new ValueWithReport(content, behaviorReport)
            } else {
                return compiledBundlesResult
            }
        }

        return new ValueWithReport(undefined, behaviorReport)
    }
}

ServerViewRoute.Render = class Render{
    constructor(route, url, content, behaviors){
        this._route = route
        this._url = url
        this._content = content
        this._behaviors = behaviors
    }
}

export class RouteCollection{
    constructor(){
        this._routes = []
    }

    merge(other){
        const r = new RouteCollection()
        r._routes = this._routes.concat(other._routes)
        return r
    }
    
    add(route){
        this._routes.push(route)
    }

    each(c){
        for ( let i = 0; i < this._routes.length; ++i ){
            c(this._routes[i])
        }
    }

    allRoutes(){ return this._routes }
    
    viewRoutes(){
        return this._routes.filter(ServerViewRoute.isType)
    }
}