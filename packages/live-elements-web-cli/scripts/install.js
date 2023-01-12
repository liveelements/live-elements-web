const path = require('path')
const fs = require('fs')

function findLvFiles(d){
    var results = []
    if (!fs.existsSync(d)){
        return []
    }
    
    var files = fs.readdirSync(d)
    for(var i = 0; i < files.length; i++ ){
        var filepath = path.join(d, files[i])
        if ( filepath.endsWith('.lv') ){
            results.push(filepath)
        }
    }
    return results
}

async function run(){
    var importer = await import('live-elements-core/lvimport.mjs')
    var templatesPath = path.resolve(__dirname + '/../templates/')

    var filesToCompile = findLvFiles(templatesPath)
    for ( var i = 0; i < filesToCompile.length; ++i ){
        await importer.default(filesToCompile[i])
    }
}

run()