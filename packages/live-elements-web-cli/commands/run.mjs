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

export default async function run(bundle, options){
    try{
        const serverModules = await loadServerModules(bundle)
        const WebServer = serverModules.WebServer

        const bundleInfo = await serverModules.BundleLoader.findBundle(bundle, process.cwd())
        if ( !bundleInfo ){
            throw new Error(`No bundle file specified and package.json not found or does not contain bundle info.`)
        }

        await WebServer.Init.run()
        const webServerConfig = new WebServer.Configuration({
            runMode: WebServer.RunMode.Production,
            watch: false,
            useSocket: false,
            baseUrl: options.baseUrl ? options.baseUrl : undefined,
            port: options.port ? options.port : undefined,
        })

        const server = await WebServer.load(bundleInfo.bundle, webServerConfig)
        server.run()
    } catch ( e ){
        console.error(e)
    }
}
