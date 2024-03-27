import path from 'path'
import url from 'url'
import fs from 'fs'

import lvimport from 'live-elements-core/lvimport.mjs'
import WebServer from 'live-elements-web-server/lib/web-server.mjs'
import PackagePath from 'live-elements-web-server/lib/package-path.cjs'
import ClassInfo from 'live-elements-web-server/lib/class-info.mjs'
import BundleData from 'live-elements-web-server/lib/bundle-data.mjs'
import { BaseElement } from 'live-elements-core/baseelement.js'
import ComponentRegistry from 'live-elements-web-server/lib/component-registry.mjs'

export { lvimport as lvimport }
export { WebServer as WebServer }
export { PackagePath as PackagePath }
export { ClassInfo as ClassInfo }
export { BaseElement as BaseElement }
export { BundleData as BundleData }

export function currentDir(){
    return path.dirname(url.fileURLToPath(import.meta.url))
}

export async function loadBundleWithView(bundleData, view, config){
    if ( !fs.existsSync(view) ){
        throw new Error(`Failed to find view '${view}'.`)
    }

    let res = await lvimport(view)
    const keys = Object.keys(res)
    const viewKey = keys.find(key => ClassInfo.extends(res[key],  ComponentRegistry.Components.PageView))
    const ViewComponent = viewKey ? res[viewKey] : null

    if ( !ViewComponent || typeof ViewComponent !== 'function' )
        throw new Error(`View ${view} should export a PageView component.`)

    const viewRoute = new ComponentRegistry.Components.ViewRoute()
    viewRoute.url = ViewComponent.servoerUrl ? ViewComponent.serverUrl : '/'
    viewRoute.c = ViewComponent
    BaseElement.complete(viewRoute)

    bundleData.bundle.children = bundleData.bundle.children.concat([viewRoute])

    const server = await WebServer.loadBundle(bundleData, config)

    // overwrite loader to support any view name, in case the view name changes
    const virtualModules = server.webpack.virtualModulesPlugin
    const viewLoader = server.createViewLoader(ViewComponent)

    const newViewLoaderContent = [
        `import Loader from "${viewLoader.loaderType}"`,
        `Loader.loadAwaitingModule(import("./${ViewComponent.Meta.sourceFileName}"), "*", ${viewLoader.virtualLoaderPlacementContent}, ${viewLoader.virtualLoaderViewAssignments})`
    ].join('\n')
    virtualModules.writeModule(viewLoader.virtualLoader, newViewLoaderContent)

    return server
}


