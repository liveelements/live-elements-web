import path from 'path'
import fs from 'fs'
import jsdom from 'jsdom'
const { JSDOM } = jsdom

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function dashToCamelCase(string){
    var capitalWords = string.split('-').map( s => capitalizeFirstLetter(s.toLowerCase()) ).join('')
    return capitalWords.length > 0 ? capitalWords.charAt(0).toLowerCase() + capitalWords.slice(1) : ''
}

function objectToCode(obj){
    var result = ''
    for (const [key, value] of Object.entries(obj)) {
        if ( result.length > 0 )
            result += ','
        const keyString = key ? key : "''"
        if ( typeof value === 'object' && value !== null ){
            result += keyString + '; ' + objectToCode(value)
        } else {
            result += keyString + ': \'' + value + '\''
        }
    }
    return '{' + result + '}'
}

function domChildrenToLv(window, dom, indent = -1, indentMultiplier = 1){
    var result = ''
    var indentValue = indent > 0 ? ' '.repeat(indent * indentMultiplier) : ''
    for ( var i = 0; i < dom.childNodes.length; ++i ){
        if ( dom.childNodes[i] instanceof window.Text ){
            var content = dom.childNodes[i].nodeValue.replaceAll('\"', '\\\"').replaceAll('\`', '\\\`').trim().replaceAll('\n', '\\n')
            if ( content.length > 0 )
                result += indentValue + 'T`' + content + '`\n'
        } else {
            result += htmlToLv(window, dom.childNodes[i], indent, indentMultiplier)
        }
    }
    return result
}


function htmlToLv(window, dom, indent = -1, indentMultiplier = 1){
    let result = ''
    if ( !dom.tagName )
        return ''

    const indentValue = indent > 0 ? ' '.repeat(indent * indentMultiplier) : ''
    const nextIndentValue = indent >= 0 ? ' '.repeat(indent * indentMultiplier + indentMultiplier) : ''

    const tagName = dom.tagName.toLowerCase()
    let componentName = capitalizeFirstLetter(tagName)
    if ( tagName === 'textarea' )
        componentName = 'TextArea'

    result += indentValue + componentName + '{ '

    let props = {}
    let attrs = []


    for ( let i = 0; i < dom.attributes.length; ++i ){
        const attr = dom.attributes[i]
        if ( attr.name === 'id' ){
            attrs.push('glid: \'' + attr.value + '\'')
        } else if ( attr.name === 'class' ){
            attrs.push('classes: [' + attr.value.split(' ').map( v => '\'' + v + '\'' ).join(',') + ']')
        } else {
            var dashIndex = attr.name.indexOf('-')
            if ( dashIndex !== -1 ){
                var key = attr.name.substr(0, dashIndex)
                var nextKey = dashToCamelCase(attr.name.substr(dashIndex + 1))
                if ( !props.hasOwnProperty(key) ){
                    props[key] = {}
                } else {
                    if ( props[key].constructor !== Object ){
                        props[key] = { '' : props[key] }
                    }
                }
                props[key][nextKey] = attr.value
            } else {
                if ( props.hasOwnProperty(attr.name) && props[attr.name].constructor === Object ){
                    props[attr.name][''] = attr.value
                } else {
                    props[attr.name] = attr.value
                }
            }
        }
    }
    var propsStr = ''
    for (const [key, value] of Object.entries(props)) {
        if ( propsStr.length > 0 )
            propsStr += ', '
        const keyString = key ? key : "''"
        if ( typeof value === 'object' && value !== null ){
            propsStr += keyString + ': ' + objectToCode(value)
        } else {
            propsStr += keyString + ': \'' + value + '\''
        }
    }
    if ( propsStr.length > 0 ){
        attrs.push('props: ({' + propsStr + '})')
    }
    const attrsLength = attrs.reduce((total, current) => total + current.length, 0)
    if ( indentValue.length + componentName.length + attrsLength > 80 )
        result += '\n' + nextIndentValue + attrs.join('\n' + nextIndentValue)
    else
        result += attrs.join(';')
    result += '\n'
    result += domChildrenToLv(window, dom, indent >= 0 ? indent + 1 : indent, indentMultiplier)
    result += indentValue + '}\n'
    return result
}

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

export default async function generate(options){
    let data = ''
    if ( options.file ){
        data = fs.readFileSync(options.file, 'utf-8')
    } else {
        data = await readFromStdIn()
    }
    const indentValue = options.indent ? options.indent : 2

    var dom = new JSDOM(data)
    var str = domChildrenToLv(dom.window, dom.window.document.body, 0, indentValue)
    console.log(str)
}
