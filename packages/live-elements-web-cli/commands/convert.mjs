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
        if ( typeof value === 'object' && value !== null ){
            result += key + '; ' + objectToCode(value)
        } else {
            result += key + ': \'' + value + '\''
        }
    }
    return '{' + result + '}'
}

function domChildrenToLv(window, dom, indent = -1, indentMultiplier = 1){
    var result = ''
    var indentValue = indent > 0 ? ' '.repeat(indent * indentMultiplier) : ''
    for ( var i = 0; i < dom.childNodes.length; ++i ){
        if ( dom.childNodes[i] instanceof window.Text ){
            var content = dom.childNodes[i].nodeValue.replaceAll('\"', '\\\"').replaceAll('\`', '\\\`').trim()
            if ( content.length > 0 )
                result += indentValue + 'T`' + content + '`\n'
        } else {
            result += htmlToLv(window, dom.childNodes[i], indent, indentMultiplier)
        }
    }
    return result
}


function htmlToLv(window, dom, indent = -1, indentMultiplier = 1){
    var result = ''
    if ( !dom.tagName )
        return ''


    var indentValue = indent > 0 ? ' '.repeat(indent * indentMultiplier) : ''
    var nextIndentValue = indent >= 0 ? ' '.repeat(indent * indentMultiplier + indentMultiplier) : ''

    var tagName = dom.tagName.toLowerCase()
    var componentName = capitalizeFirstLetter(tagName)
    if ( tagName === 'textarea' )
        componentName = 'TextArea'

    result += indentValue + componentName + '{ '

    var props = {}

    for ( var i = 0; i < dom.attributes.length; ++i ){
        var attr = dom.attributes[i]
        if ( attr.name === 'id' ){
            result += nextIndentValue + 'glid: \'' + attr.value + '\';'
        } else if ( attr.name === 'class' ){
            result += nextIndentValue + 'classes: [' + attr.value.split(' ').map( v => '\'' + v + '\'' ).join(',') + '];'
        } else {
            var dashIndex = attr.name.indexOf('-')
            if ( dashIndex !== -1 ){
                var key = attr.name.substr(0, dashIndex)
                var nextKey = dashToCamelCase(attr.name.substr(dashIndex + 1))
                if ( !props.hasOwnProperty(key) ){
                    props[key] = {}
                }
                props[key][nextKey] = attr.value
            } else {
                props[attr.name] = attr.value
            }
        }
    }
    var propsStr = ''
    for (const [key, value] of Object.entries(props)) {
        if ( propsStr.length > 0 )
            propsStr += ','
        if ( typeof value === 'object' && value !== null ){
            propsStr += key + ': ' + objectToCode(value)
        } else {
            propsStr += key + ': \'' + value + '\''
        }
    }
    if ( propsStr.length > 0 ){
        result += nextIndentValue + 'props: ({ ' + propsStr + ' })'
    }
    result += '\n'

    result += domChildrenToLv(window, dom, indent >= 0 ? indent + 1 : indent, indentMultiplier)

    result += indentValue + '}\n'
    return result
}

export default function generate(options){
    var data = ''
    if ( options.file ){
        data = fs.readFileSync(options.file, 'utf-8')
    } else {
        data = fs.readFileSync(0, 'utf-8')
    }
    var dom = new JSDOM(data)
    var str = domChildrenToLv(dom.window, dom.window.document.body, 0, 2)
    console.log(str)
}
