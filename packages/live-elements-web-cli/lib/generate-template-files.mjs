import path from 'path'

export async function loadTemplate(template, templatePath){
    const lvimport = await import('live-elements-core/lvimport.mjs')
    const generatorModule = await lvimport.default(templatePath)

    const generatorExport = Object.keys(generatorModule)
    if ( generatorExport.length !== 1 ){
        throw new Error(`Internal: Only a single export of type Generator is allowed in template file: ${template}`)
    }

    const generator = generatorModule[generatorExport[0]]
    if ( generator.name !== template ){
        throw new Error(`Generator name is different than the required template: '${generator.name}' != '${template}'`)
    }
    return generator
}

export function generateFiles(generator, props, resultPath){
    let files = []
    for ( let i = 0; i < generator.children.length; ++i ){
        const file = generator.children[i]

        var outputPath = path.join(resultPath, file.output)
        var outputDir = path.dirname(outputPath)

        var captureInfo = {
            file: file.output,
            outputDir: outputDir,
            outputFile: outputPath
        }

        for (let key in captureInfo) {
            if (props.hasOwnProperty(key)) {
                throw new Error(`Generate: Property '${key}' cannot be user assigned.`);
            }
        }

        const captureInfoProps = { ...captureInfo, ...props }
        const content = file.captureContent(captureInfoProps)
        files.push({
            outputDir: outputDir,
            outputPath: outputPath,
            content: content
        })
    }
    return files
}

export async function generateTemplateFiles(template, templatePath, props){
    const generator = await loadTemplate(template, templatePath)
    const files = generateFiles(generator, props, process.cwd())
    return files
}
