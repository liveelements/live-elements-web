import path from 'path'
import url from 'url'
import fs from 'fs'

import lvimport from 'live-elements-core/lvimport.mjs'
import WebServer from 'live-elements-web-server/lib/web-server.mjs'
import PackagePath from 'live-elements-web-server/lib/package-path.cjs'
import ClassInfo from 'live-elements-web-server/lib/class-info.mjs'
import { BaseElement } from 'live-elements-core/baseelement.js'
import { Watcher } from 'live-elements-web-server/lib/watcher.mjs'

export { lvimport as lvimport }
export { WebServer as WebServer }
export { PackagePath as PackagePath }
export { ClassInfo as ClassInfo }
export { BaseElement as BaseElement }

export function currentDir(){
    return path.dirname(url.fileURLToPath(import.meta.url))
}

export class BundleLoader{
    static async loadBundle(bundle, config){
        return await WebServer.load(bundle, config)
    }

    static async loadBundleWithView(bundle, view, config){
        if ( !fs.existsSync(view) ){
            throw new Error(`Failed to find view '${view}'.`)
        }

        let res = await lvimport(view)
        const keys = Object.keys(res)
        const viewKey = keys.find(key => ClassInfo.extends(res[key],  WebServer.Components.PageView))
        const ViewComponent = viewKey ? res[viewKey] : null
    
        if ( !ViewComponent || typeof ViewComponent !== 'function' )
            throw new Error(`View ${view} should export a PageView component.`)
    
        const viewRoute = new WebServer.Components.ViewRoute()
        viewRoute.url = ViewComponent.serverUrl ? ViewComponent.serverUrl : '/'
        viewRoute.c = ViewComponent
        BaseElement.complete(viewRoute)
    
        const loadedBundle = await WebServer.loadBundleFile(bundle)
        loadedBundle.children = loadedBundle.children.concat([viewRoute])
    
        const server = await WebServer.loadBundle(loadedBundle, bundle, config)

        // overwrite loader to support any view name, in case the view name changes
        const virtualModules = server.webpack.virtualModulesPlugin
        const viewLoader = server.createViewLoader(ViewComponent)

        const newViewLoaderContent = [
            `import Loader from "${viewLoader.loaderType}"`,
            `Loader.loadAwaitingModule(import("./${ViewComponent.Meta.sourceFileName}"), "*", ${viewLoader.virtualLoaderPlacementContent})`
        ].join('\n')
        virtualModules.writeModule(viewLoader.virtualLoader, newViewLoaderContent)

        return server
    }

    static async findBundle(bundle, workDir){
        if ( bundle ){
            return { bundle: path.resolve(bundle), package: null, allowBundleView: false }
        } else {
            const packagePath = PackagePath.findPackageJson(workDir)
            if ( !packagePath )
                return null

            const packageObject = JSON.parse(fs.readFileSync(packagePath))
            if ( !packageObject.hasOwnProperty('lvweb' ) || !packageObject.lvweb.hasOwnProperty('bundle') ){
                return null
            }

            const allowViewArgument = packageObject.lvweb.allowBundleView ? packageObject.lvweb.allowBundleView : false

            if ( path.isAbsolute(packageObject.lvweb.bundle) ){
                return { bundle: packageObject.lvweb.bundle, package: packagePath, allowBundleView: allowViewArgument }
            } else {
                const bundleRelative = packageObject.lvweb.bundle
                if ( bundleRelative.startsWith('./') ){
                    return { 
                        bundle: path.join(path.dirname(packagePath), bundleRelative), 
                        package: packagePath, 
                        allowBundleView: allowViewArgument 
                    }
                } else {
                    const currentDir = path.dirname(url.fileURLToPath(import.meta.url))
                    const bundlePackageName = bundleRelative.substr(0, bundleRelative.indexOf('/'))
                    const bundlePackage = PackagePath.find(bundlePackageName, currentDir)
                    return {
                        bundle: path.join(bundlePackage, bundleRelative.substr(bundleRelative.indexOf('/') + 1)),
                        package: packagePath,
                        allowBundleView: allowViewArgument
                    }
                }
            }
        }
        return null
    }
}


