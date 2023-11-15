const path = require('path')
const fs = require('fs')

function compileModule(compiler, compilerConfig, modulePath){
    return new Promise((resolve, reject) => {
        compiler.default.compileModule(modulePath, compilerConfig.read(), (result, err) => {
            if ( result ){
                resolve(result)
            } else if ( err ){
                if ( err instanceof Error ){
                    reject(err)
                } else if ( err.error ){
                    if ( err.source ){
                        err.error.source = err.source
                        err.error.message += ' At file ' + err.error.source.file + ':' + err.error.source.line + ':' + err.error.source.column
                    }
                    reject(err.error)
                } else {
                    reject(err)
                }
            } else {
                reject(new Error("Internal lvimport error."))
            }
        })
    })
}

async function run(){
    var compiler = await import('live-elements-js-compiler')
    var compilerConfig = await import('live-elements-core/compilerconfig.mjs')

    let livePackageFile = path.resolve(__dirname + '/../live.package.json')
    let contents = fs.readFileSync(livePackageFile)
    let contentsOb = JSON.parse(contents)
    if ( contentsOb['release'] === 'build' ){
        delete contentsOb['release']
        contents = JSON.stringify(contentsOb)
        fs.writeFileSync(livePackageFile, contents)
    }

    try{
        const templatesResult = await compileModule(compiler, compilerConfig, path.resolve(__dirname + '/../templates/'))
        console.log("Compiled at: " + templatesResult)
        const bundlesDemoResult = await compileModule(compiler, compilerConfig, path.resolve(__dirname + '/../templates/bundles/demo'))
        console.log("Compiled at: " + bundlesDemoResult)

        let livePackageFile = path.resolve(__dirname + '/../live.package.json')
        let contents = fs.readFileSync(livePackageFile)
        let contentsOb = JSON.parse(contents)
        contentsOb['release'] = 'build'
        contents = JSON.stringify(contentsOb)
        fs.writeFileSync(livePackageFile, contents)

        console.log("Updated 'release' flag in package file: " + livePackageFile)

    } catch ( e ){
        console.error(e)
        return -1
    }
    
    return 0
}

run().then(code => {
    process.exit(code)
})