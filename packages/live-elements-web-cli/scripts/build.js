const path = require('path')
const fs = require('fs')

async function run(){
    var templatesPath = path.resolve(__dirname + '/../templates/')

    var compiler = await import('live-elements-js-compiler')
    var compilerConfig = await import('live-elements-core/compilerconfig.mjs')

    compiler.default.compileModule(templatesPath, compilerConfig.read(), (result, err) => {
        if ( result ){
            console.log("Compiled at: " + result)

            let livePackageFile = path.resolve(__dirname + '/../live.package.json')
            let contents = fs.readFileSync(livePackageFile)
            let contentsOb = JSON.parse(contents)
            contentsOb['release'] = 'build'
            contents = JSON.stringify(contentsOb)
            fs.writeFileSync(livePackageFile, contents)

            console.log("Updated 'release' flag in package file: " + livePackageFile)
        } else if ( err ){
            if ( err instanceof Error ){
                console.error(err)
            } else if ( err.error ){
                if ( err.source ){
                    err.error.source = err.source
                    err.error.message += ' At file ' + err.error.source.file + ':' + err.error.source.line + ':' + err.error.source.column
                }
                console.error(err.error)
            } else {
                console.error(err)
            }
        } else
            console.error(new Error("Internal lvimport error."))
    })
}

run()