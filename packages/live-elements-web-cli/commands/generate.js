const path = require('path')
const fs = require('fs')

module.exports = function(template){
    var templateComponent = template.replaceAll('-', '')
    var templatePath = path.resolve(__dirname + '/../templates/' + templateComponent + '.lv')
    var templateBuildPath = path.resolve(__dirname + '/../build/templates/' + templateComponent + '.lv.mjs')
    if ( !fs.existsSync(templatePath) ){
        throw new Error("Failed to find template: " + template)
    }

    import('live-elements-core/lvimport.mjs').then((lvimport) => {
        import('live-elements-core/lvjsimport.mjs').then((lvjsimport) => {
            // var generatorModulePromise = lvimport.default(templatePath)
            var generatorModulePromise = fs.existsSync(templateBuildPath) ? lvjsimport.default(templateBuildPath) : lvimport.default(templatePath)

            generatorModulePromise.then((generatorModule) => {
                var generatorExport = Object.keys(generatorModule)
                if ( generatorExport.length !== 1 ){
                    throw new Error("Only a single export of type Generator is allowed in a template file.")
                }
        
                var generator = generatorModule[generatorExport[0]]
                if ( generator.name !== template ){
                    throw new Error("Generator name is different than the required template: " + generator.name)
                }
    
                for ( var i = 0; i < generator.children.length; ++i ){
                    var file = generator.children[i]
        
                    var outputPath = process.cwd() + '/' + file.output
                    var outputDir = path.dirname(outputPath)
    
                    var captureInfo = {
                        package: path.basename(process.cwd()),
                        file: file.output,
                        outputDir: outputDir,
                        outputFile: outputPath
                    }
        
                    fs.mkdirSync(outputDir, {recursive: true} )
                    fs.writeFileSync(outputPath, file.captureContent(captureInfo))
        
                    console.log("Added file: " + outputPath)
                }
                
            }).catch((err) => {
                console.log(err)
                return Promise.reject(err)
            })

        }).catch((err) => {
            throw err
        })
    }).catch((err) => {
        throw err
    })
}