import ComponentRegistry from "./component-registry.mjs"
import ResultWithReport from "./result-with.report.mjs"
import ServerRenderer from "./server-renderer.mjs"
import { BaseElement } from 'live-elements-core/baseelement.js'

import path from 'path'
import url from 'url'

export class ServerRoute{
    constructor(url, userMiddleware, f){
        this._userMiddleware = userMiddleware
        this._url = url
        this._f = f
    }

    get userMiddleware(){ return this._userMiddleware }
    get url(){ return this._url }
    get f(){ return this._f }
}

export class ServerApiRoute extends ServerRoute{
    constructor(url, userMiddleware, f, type){
        super(url, userMiddleware, f)
        this._type = type
    }

    get type(){ return this._type }
    static isType(ob){ return ob instanceof ServerApiRoute }
}

ServerApiRoute.GET  = 1
ServerApiRoute.POST = 2

export class ServerMiddlewareRoute extends ServerRoute{
    constructor(url, userMiddleware, f){
        super(url, userMiddleware, f)
    }

    static isType(ob){ return ob instanceof ServerMiddlewareRoute }
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
        this._bundleScript = null
    }

    get c(){ return this._c }
    get render(){ return this._render }
    get placement(){ return this._placement }
    get data(){ return this._data }
    get page(){ return this._page }
    get scripts(){ return this._scripts }
    get bundleScript(){ return this._bundleScript }

    addScript(script){ this._scripts.push(script) }
    setBundleScript(script){ this._bundleScript = script }

    static isType(ob){ return ob instanceof ServerViewRoute }

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

    static async createRender(route, data, req, page, domEmulator, baseUrl, bundleLookupPath, webpack, viewScopedStyles){
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

        const v = ComponentRegistry.Components.ViewRoute.createView(route.c, data)
        if ( v instanceof ComponentRegistry.Components.PageView ){
            if ( v.head )
                v.head.expand(pageDOM.window.document)
        }

        if ( expandLocation ){
            expandLocation.children = [v]
        } else {
            v.expandTo(insertionDOM)
        }

        const behaviorResult = ServerRenderer.scanBehaviors(pageDOM.window.document, pagePlacements.length ? pagePlacements[0] : v)
        const behaviorReport = behaviorResult.hasReport ? behaviorResult.report : null
        const behaviors = behaviorResult.behaviors
        const behaviorScriptsUrl = baseUrl === '/' ? '/scripts/behavior/' : `${baseUrl}/scripts/behavior/`
        let compiledBundles = { assets: [] }

        const clientBehaviorEvents = path.join(currentDir, '../client/client-behavior-events.mjs')

        if ( behaviors.length ){
            ServerRenderer.assignBehaviorsId(0, behaviors)
            ServerRenderer.assignBehaviorsToDom(behaviors)
            const behaviorsSource = ServerRenderer.behaviorsSource(behaviors)            
            const viewPath = ComponentRegistry.findComponentPath(route.c, bundleLookupPath)
            const viewPathName = path.parse(viewPath).name.toLowerCase() + '.behaviors'
            const viewBehaviorBundlePath = path.join(path.dirname(viewPath), viewPathName + '.mjs')
            compiledBundles = await webpack.compileExternalBundle(
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
        
        const scopedStyleLinks = viewScopedStyles.styleLinks(route.c)
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
        return new ResultWithReport(content, behaviorReport)
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

    viewRoutes(){
        return this._routes.filter(ServerViewRoute.isType)
    }
}