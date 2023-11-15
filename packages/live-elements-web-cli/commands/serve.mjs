import path from 'path'
import fs from 'fs'
import lvimport from 'live-elements-core/lvimport.mjs'
import WebServer from 'live-elements-web-server/lib/web-server.mjs'
import PackagePath from 'live-elements-web-server/lib/package-path.cjs'
import ClassInfo from 'live-elements-web-server/lib/class-info.mjs'
import { BaseElement } from 'live-elements-core/baseelement.js'

async function serveBundle(bundle, config){    
    let server = await WebServer.load(bundle, config)
    server.serve()
}

async function serveBundleWithView(bundle, view, config){
    await WebServer.loadComponents()

    let res = await lvimport(view)
    const keys = Object.keys(res)
    const viewKey = keys.find(key => ClassInfo.extends(res[key],  WebServer.Components.PageView))
    const ViewComponent = viewKey ? res[viewKey] : null
    if ( !ViewComponent || typeof ViewComponent !== 'function' )
        throw new Error(`View ${view} should only export a PageView component.`)

    const viewRoute = new WebServer.Components.ViewRoute()
    viewRoute.url = ViewComponent.serverUrl ? ViewComponent.serverUrl : '/'
    viewRoute.c = ViewComponent
    BaseElement.complete(viewRoute)

    const loadedBundle = await WebServer.loadBundleFile(bundle)
    loadedBundle.children = loadedBundle.children.concat([viewRoute])

    let server = await WebServer.loadBundle(loadedBundle, bundle, config)
    server.serve()
}

export default async function serve(bundle, options){
    try{
        await WebServer.Init.run()

        const viewArgument = options.hasOwnProperty('view') ? options.view : null

        const webServerConfig = new WebServer.Configuration({
            runMode : WebServer.RunMode.Development,
            watch: true,
            baseUrl: options.baseUrl ? options.baseUrl : undefined,
            port: options.port ? options.port : undefined,
            renderMode: options.renderMode ? WebServer.Configuration.renderModeFromString(options.renderMode) : undefined,
            bundleLookupPath: viewArgument ? path.resolve('.') : undefined
        })

        if ( bundle ){
            if ( viewArgument )
                throw new Error('View argument provided but the bundle was not configured to support views.')
            return serveBundle(path.resolve(bundle), webServerConfig)
        } else if ( !bundle && fs.existsSync('package.json') ){
            const packagePath = path.resolve('package.json')
            const packageObject = JSON.parse(fs.readFileSync(packagePath))
            if ( !packageObject.hasOwnProperty('lvweb' ) || !packageObject.lvweb.hasOwnProperty('bundle') ){
                throw new Error(`No bundle file specified and package.json not found or does not contain bundle info.`)
            }

            if ( path.isAbsolute(packageObject.lvweb.bundle) ){
                bundle = packageObject.lvweb.bundle
            } else {
                const bundleRelative = packageObject.lvweb.bundle
                if ( bundleRelative.startsWith('./') ){
                    bundle = path.join(path.dirname(packagePath), bundleRelative)
                } else {
                    const bundlePackage = PackagePath.find(bundleRelative.substr(0, bundleRelative.indexOf('/')))
                    bundle = path.join(bundlePackage, bundleRelative.substr(bundleRelative.indexOf('/') + 1))
                }
            }

            const allowViewArgument = packageObject.lvweb.allowBundleView ? packageObject.lvweb.allowBundleView : false
            if ( viewArgument && !allowViewArgument )
                throw new Error('View argument provided but the bundle was not configured to support views.')

            if ( !bundle ){
                throw new Error(`No bundle file specified and package.json not found or does not contain bundle info.`)
            }

            return viewArgument 
                ? serveBundleWithView(path.resolve(bundle), viewArgument, webServerConfig) 
                : serveBundle(path.resolve(bundle), webServerConfig)
        } else {
            throw new Error(`No bundle file specified and package.json not found or does not contain bundle info.`)
        }
        
    } catch ( e ){
        console.error(e)
    }
}
