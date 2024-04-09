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

export default async function addView(viewUrl, viewName, bundle, _opt){
    try{
        const serverModules = await loadServerModules(bundle)
        const bundleData = await serverModules.BundleData.findAndLoad(bundle, process.cwd())
        if ( !bundleData ){
            throw new Error(`No bundle file specified and package.json not found or does not contain bundle info.`)
        }

        const appPath  = path.join(bundleData.packagePath, 'app')
        const viewPath = path.join(bundleData.packagePath, 'views')
        const pagesPath = path.join(bundleData.packagePath, 'pages')

        const componentPathDir = fs.existsSync(appPath) ? appPath : fs.existsSync(pagesPath) ? pagesPath : viewPath
        if ( !fs.existsSync(componentPathDir) ){
            fs.mkdirSync(componentPathDir)
        }
       
        const viewUrlComponent = viewUrl.substr(viewUrl.lastIndexOf('/') + 1)
        const viewComponent = viewName ? viewName : (viewUrlComponent[0].toUpperCase() + viewUrlComponent.substr(1, viewUrlComponent.length))

        

        const componentPath = path.join(componentPathDir, viewComponent.toLowerCase() + '.lv')
        if ( fs.existsSync(componentPath) ){
            throw new Error(`Component already exists in path: ${componentPath}`)
        }

        const content = fs.readFileSync(bundleData.file)
        const lastBracket = content.lastIndexOf('}')
        const componentImport = `import .${path.basename(componentPathDir)}`

        const bundleOutput = 
             (content.indexOf(componentImport) === -1 ? `${componentImport}\n` : '')
            + content.subarray(0, lastBracket) 
            + `    ViewRoute{ url: '${viewUrl.toLowerCase()}' c: ${viewComponent} }\n` 
            + content.subarray(lastBracket)

        const viewOutput = `import live-web.dom\nimport live-elements-web-server.view\n\ncomponent ${viewComponent} < PageView{\n    Body{\n    }\n}\n`

        fs.writeFileSync(componentPath, viewOutput)
        fs.writeFileSync(bundleData.file, bundleOutput)

        console.info(` * Added view: ${componentPath}.`)
        console.info(` * Updated bundle: ${bundleData.file}`)

    } catch ( e ){
        console.error(e)
    }
}
