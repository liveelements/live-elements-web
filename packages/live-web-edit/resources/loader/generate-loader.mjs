import url from 'url'
import fs from 'fs'
import path from 'path'

export default function generateLoader(replacements){
    const currentDir = path.dirname(url.fileURLToPath(import.meta.url)) 

    let content = fs.readFileSync(path.join(currentDir, 'loader.jstpl'), 'utf8')

    for (const [key, value] of Object.entries(replacements)) {
        const regex = new RegExp(`<<<${key}>>>`, 'g');
        content = content.replace(regex, value);
    }

    return content
}