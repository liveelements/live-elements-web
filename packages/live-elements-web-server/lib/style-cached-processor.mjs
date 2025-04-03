import fs from 'fs'
import path from 'path'
import PackagePath from 'live-elements-web-server/lib/package-path.cjs'

export default class StyleCachedProcessor{

    constructor(){
        this._processedFiles = {}
    }

    static create(){
        return new StyleCachedProcessor()
    }

    static createFromCache(location){
        if ( !fs.existsSync(location) ){
            return new StyleCachedProcessor()
        }

        const processedFiles = {}

        const mainPackage = path.dirname(PackagePath.findPackageJson(location))

        const cachePath = path.join(location, 'files.json')
        const cacheData = JSON.parse(fs.readFileSync(cachePath))
        cacheData.forEach(file => {
            const filePackage = file.file.substr(0, file.file.indexOf('/'))
            const filePathFromPackage = file.file.substr(file.file.indexOf('/') + 1)
            const filePackagePath = PackagePath.find(filePackage, mainPackage)
            const filePath = path.join(filePackagePath, filePathFromPackage)
            const content = fs.readFileSync(path.join(location, file.name))
            processedFiles[filePath] = {
                content: content,
                stamp: new Date(file.stamp)
            }
        })
        const result = new StyleCachedProcessor()
        result._processedFiles = processedFiles
        return result
    }

    saveCache(location){
        if ( !fs.existsSync(location) ){
            fs.mkdirSync(location, { recursive: true })
        }
        const toSave = []
        for ( let [key, value] of Object.entries(this._processedFiles)){
            const name = path.basename(key)
            const saveLocation = path.join(location, name)

            const packageJson = PackagePath.findPackageJson(key)
            const packagePath = path.dirname(packageJson)
            const packageName = JSON.parse(fs.readFileSync(packageJson)).name
            fs.writeFileSync(saveLocation, value.content)
            toSave.push({
                file: packageName + '/' + path.relative(packagePath, key),
                name: name,
                stamp: value.stamp.toISOString()
            })
        }
        const cachePath = path.join(location, 'files.json')
        fs.writeFileSync(cachePath, JSON.stringify(toSave))
        return cachePath
    }

    invalidate(file){
        if ( this._processedFiles.hasOwnProperty(file) ){
            delete this._processedFiles[file]
        }
    }

    async process(file, processor, output){
        if ( this._processedFiles.hasOwnProperty(file) ){
            return this._processedFiles[file].content
        }

        const content = await fs.promises.readFile(file, 'utf8')
        if (processor) {
            let processedResult = typeof processor === 'function'
                ? await processor(file, content, output)
                : await processor.process(file, content, output)
            this._processedFiles[file] = {
                content: processedResult.content,
                stamp: new Date()
            }
            return processedResult.content
        } else {
            return content
        }
    }
}