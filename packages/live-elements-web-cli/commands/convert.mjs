import path from 'path'
import fs from 'fs'
import jsdom from 'jsdom'
const { JSDOM } = jsdom

import HtmlToLv from 'live-elements-web-server/shared/convert/html-to-lv.mjs'

function readFromStdIn(){
    return new Promise((resolve, _reject) => {
        let builder = ''
        process.stdin.setEncoding('utf8')

        process.stdin.on('readable', () => {
            let chunk
            while ((chunk = process.stdin.read()) !== null) {
                builder += chunk
            }
        })

        process.stdin.on('end', () => {
            resolve(builder)
        })
    })
}

export default async function convert(options){
    let data = ''
    if ( options.file ){
        data = fs.readFileSync(options.file, 'utf-8')
    } else {
        data = await readFromStdIn()
    }
    const indentValue = options.indent ? options.indent : 2

    const dom = new JSDOM(data)
    const str = HtmlToLv.convert(dom.window, dom.window.document.body, 0, indentValue)
    console.log(str)
}
