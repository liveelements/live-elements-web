import path from 'path'
import fs from 'fs'
import PackagePath from 'live-elements-web-server/lib/package-path.cjs'
import WebServer from 'live-elements-web-server/lib/web-server.mjs'

function findBundleInPackageFile(packagePath){
    if ( !fs.existsSync(packagePath) )
        return null
    const packageObject = JSON.parse(fs.readFileSync(packagePath))
    if ( !packageObject.hasOwnProperty('lvweb' ) || !packageObject.lvweb.hasOwnProperty('bundle') ){
        return null
    }

    if ( path.isAbsolute(packageObject.lvweb.bundle) ){
        return packageObject.lvweb.bundle
    } else {
        const bundleRelative = packageObject.lvweb.bundle
        if ( bundleRelative.startsWith('./') ){
            return path.join(path.dirname(packagePath), bundleRelative)
        } else {
            const bundlePackage = PackagePath.find(bundleRelative.substr(0, bundleRelative.indexOf('/')))
            return path.join(bundlePackage, bundleRelative.substr(bundleRelative.indexOf('/') + 1))
        }
    }
}

export default async function run(bundle, options){
    try{
        await WebServer.Init.run()
        
        const webServerConfig = new WebServer.Configuration({
            runMode: WebServer.RunMode.Production,
            watch: false,
            baseUrl: options.baseUrl ? options.baseUrl : undefined,
            port: options.port ? options.port : undefined,
        })

        bundle = bundle ? bundle : findBundleInPackageFile(path.resolve('package.json'))
        if ( !bundle ){
            throw new Error(`No bundle file specified and package.json not found or does not contain bundle info.`)
        }
        
        const bundleResolved = path.resolve(bundle)
        let server = await WebServer.load(bundleResolved, webServerConfig)
        server.run()
    } catch ( e ){
        console.error(e)
    }
}
