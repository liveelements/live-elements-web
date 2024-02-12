import path from 'path'
import fs from 'fs'
import url from 'url'
import PackagePath from 'live-elements-web-server/lib/package-path.cjs'

async function loadServerModules(bundle){
    const workDir = bundle
        ? path.dirname(path.resolve(bundle))
        : process.cwd() 
    const packageJson = PackagePath.findPackageJson(workDir)

    if ( packageJson ){
        const packageJsonDir = path.dirname(packageJson)
        const packageNodeModules = path.join(packageJsonDir, 'node_modules')
        const bundleServerLoaderPath = path.join(packageNodeModules, 'live-elements-web-cli', 'lib', 'server-modules.mjs')
        if ( fs.existsSync(bundleServerLoaderPath) ){
            return await import(url.pathToFileURL(bundleServerLoaderPath))
        }
    }
    console.warn(`Failed to find local live-elements-web-cli package in '${workDir}'. This might trigger errors.`)
    return await import('../lib/server-modules.mjs')
}

export default async function compile(bundle, _options){
    try{
        const serverModules = await loadServerModules(bundle)
        const WebServer = serverModules.WebServer
        const bundleData = await serverModules.BundleData.findAndLoad(bundle, process.cwd())
        if ( !bundleData ){
            throw new Error(`No bundle file specified and package.json not found or does not contain bundle info.`)
        }

        await WebServer.Init.run()
        const webServerConfig = new WebServer.Configuration({
            runMode : WebServer.RunMode.Production,
            useSocket: false
        })

        let server = await WebServer.loadBundle(bundleData, webServerConfig)
        server.compile()
    } catch ( e ){
        console.error(e)
    }
}
