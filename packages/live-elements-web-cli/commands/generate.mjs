import path from 'path'
import fs from 'fs'
import url from 'url'
import generateTemplateFiles from '../lib/generate-template-files.mjs'

export default function generate(template, _cmd, propArgs){
    const currentDir = path.dirname(url.fileURLToPath(import.meta.url))
    const templateComponent = template.replaceAll('-', '')
    const templatePath = path.resolve(currentDir + '/../templates/' + templateComponent + '.lv')
    if ( !fs.existsSync(templatePath) ){
        throw new Error("Failed to find template: " + template)
    }

    const props = {
        package: path.basename(process.cwd()),
        ...propArgs
    }
    generateTemplateFiles(template, templatePath, props).then(files => {
        for ( let i = 0; i < files.length; ++i ){
            const file = files[i]
            fs.mkdirSync(file.outputDir, {recursive: true} )
            fs.writeFileSync(file.outputPath, file.content)
        } 
    }).catch((err) => {
        throw err
    })
}