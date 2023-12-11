import fs from 'fs'
import path from 'path'
import url from 'url'

const currentDir = path.dirname(url.fileURLToPath(import.meta.url)) 

export function readDb(){
    const filePath = path.join(currentDir, 'db.json')
    return JSON.parse(fs.readFileSync(filePath))
}

export function writeDb(content){
    const filePath = path.join(currentDir, 'db.json')
    fs.writeFileSync(filePath, JSON.stringify(content))
}