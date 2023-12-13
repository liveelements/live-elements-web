import path from 'path'
import fs from 'fs'
import url from 'url'
import {generateTemplateFiles} from '../lib/generate-template-files.mjs'

function populatePackageFile(currentDir){
    let d = currentDir
    while (d) {
        if ( fs.existsSync(path.join(d, 'package.json')) ){
            const livePackage = path.join(d, 'live.package.json')
            if ( !fs.existsSync(livePackage)){
                try{
                    const name = path.basename(d)
                    const version = '0.1.0'
                    fs.writeFileSync(livePackage, JSON.stringify(name, version))
                } catch ( e ){
                    console.warn(e)
                }
            }
        }
        let next = path.dirname(d)
        if ( d === next )
            break
        d = next
    }
}

export default async function generate(location, options, propArgs){
    const template = options.template ? options.template : 'bundle'
    const currentDir = path.dirname(url.fileURLToPath(import.meta.url))
    const templateComponent = template.replaceAll('-', '')
    const templatePath = path.resolve(currentDir + '/../templates/' + templateComponent + '.lv')
    if ( !fs.existsSync(templatePath) ){
        throw new Error("Failed to find template: " + template)
    }
    
    if ( !fs.existsSync(location) )
        fs.mkdirSync(location, { recursive: true })

    console.log("Initializing:")
    console.log(` * Template: '${template}'`)
    console.log(` * Location: '${location}'`)

    const props = {
        package: path.basename(location),
        ...propArgs
    }

    populatePackageFile(currentDir)

    const files = await generateTemplateFiles(template, templatePath, props, location)
    for ( let i = 0; i < files.length; ++i ){
        const file = files[i]
        fs.mkdirSync(file.outputDir, {recursive: true} )
        fs.writeFileSync(file.outputPath, file.content)
    }
}