import path from 'path'
import fs from 'fs'
import PackagePath from 'live-elements-web-server/lib/package-path.cjs'
import { EventEmitter } from 'node:events'
import ScopedComponentSelectors from './scoped-component-selectors.mjs'
import BundleData from './bundle-data.mjs'
import ScopedStyleProcess from './scoped-style-process.mjs'

class StyleInput{
    constructor(file, processor){
        this._file = file
        this._processedContent = ''
        this._processor = processor
    }
    
    async reload(output){
        const content = await fs.promises.readFile(this._file, 'utf8')
        if (this._processor) {
            let processedResult = typeof this._processor === 'function'
                ? await this._processor(this._file, content, output)
                : await this._processor.process(this._file, content, output)
            this._processedContent = processedResult.content
        } else {
            this._processedContent = content
        }
    }
}

class StyleOutput{
    constructor(output, dist){
        this._inputs = []
        this._output = output
        this._content = ''
        this._dist = dist
    }

    get output(){ return this._output }
    get content(){ return this._content }

    addInput(file, processor){
        const input = new StyleInput(file, processor)
        this._inputs.push(input)
        return input
    }

    containsInput(file){
        return this._inputs.find(inp => inp._file === file)
    }

    addInputUnique(file, processor){
        const exists = this._inputs.find(inp => inp._file === file)
        if ( !exists ){
            const input = new StyleInput(file, processor)
            this._inputs.push(input)
            return input
        }
        return exists
    }

    allInputPaths(){
        return this._inputs.map(input => input._file)
    }

    async reload(){
        let content = ''
        for ( let i = 0; i < this._inputs.length; ++i ){
            await this._inputs[i].reload(this._dist + '/' + this._output + '.css')
            content += this._inputs[i]._processedContent
        }
        this._content = content
    }

    async reloadInputFile(path){
        const input = this._inputs.find(i => i._file === path )
        if ( input ){
            await input.reload(this._dist + '/' + this._output + '.css')
            let content = ''
            for ( let i = 0; i < this._inputs.length; ++i ){
                content += this._inputs[i]._processedContent
            }
            this._content = content
        }
        return input
    }

    inputByPath(path){
        return this._inputs.find(i => i._file === path)
    }
}

export default class StyleContainer extends EventEmitter {
    constructor(dist) {
        super()
        this._dist = dist
        this._outputs = []
    }

    addOutput(output){
        const style = new StyleOutput(output, this._dist)
        this._outputs.push(style)
        return style
    }

    getOutput(key){
        return this._outputs.find(s => s.output === key)
    }

    configureOutput(output){
        const style = this.getOutput(output)
        return style ? style : this.addOutput(output)
    }

    async reload(){
        for ( let i = 0; i < this._outputs.length; ++i ){
            await this._outputs[i].reload()
        }
        this.emit('change')
    }

    async reloadInputFile(path){
        const outputsChanged = []
        for ( let i = 0; i < this._outputs.length; ++i ){
            const hasInput = await this._outputs[i].reloadInputFile(path)
            if ( hasInput )
                outputsChanged.push(this._outputs[i].output)
        }
        this.emit('change', outputsChanged)
    }

    static resolveSrc(src, bundleRootPath){
        let packageSeparator = src.indexOf('/');
        if (packageSeparator === -1) {
            throw new Error(`Cannot find style file: ${src}`);
        }
        let packageName = src.substr(0, packageSeparator)
        if ( packageName.startsWith('@') ){
            let nextPackageSeparator = src.indexOf('/', packageSeparator + 1)
            if ( nextPackageSeparator !== -1 ){
                packageSeparator = nextPackageSeparator
                packageName = src.substr(0, nextPackageSeparator)
            }
        }

        let packagePath = PackagePath.find(packageName, bundleRootPath)
        let pathFromPackage = src.substr(packageSeparator + 1)
        return path.join(packagePath, pathFromPackage)
    }

    static async load(bundlePath, configuredStyles){
        let bundleRootPath = BundleData.findPackagePath(bundlePath)
        const styles = new StyleContainer(path.join(bundleRootPath, 'styles'))

        for (var i = 0; i < configuredStyles.length; ++i) {
            let style = configuredStyles[i]
            if ( !style.src ){
                throw new Error("Style missing 'src' field.")
            }
            if ( !style.output ){
                throw new Error("Style missing 'output' field.")
            }

            const styleSrc = StyleContainer.resolveSrc(style.src, bundleRootPath)
            const styleOutput = styles.configureOutput(style.output)
            styleOutput.addInput(styleSrc, style.process)
        }

        for ( let i = 0; i < styles._outputs.length; ++i ){
            await styles._outputs[i].reload()
        }

        return styles
    }

    async __addComponentScopedStyles(ct, ScopedProcessor, scopedComponentCollection, rootViews, output){
        const isRoot = rootViews.includes(ct)
        const classNameWithPrefix = isRoot ? '' : ct.classNameWithPrefix
        if ( ct.inherits ){
            await this.__addComponentScopedStyles(ct.inherits, ScopedProcessor, scopedComponentCollection, rootViews, output)
        }

        for ( let j = 0; j < ct._styles.length; ++j ){
            // add each component input style with it's own component selector transformations
            const sst = ct._styles[j]
            if ( !output.containsInput(sst.resolved.src) ){
                const selectors = ScopedComponentSelectors.fromStyle(scopedComponentCollection, sst)
                output.addInputUnique(sst.resolved.src, ScopedProcessor.create(selectors, `${classNameWithPrefix}`, await ScopedStyleProcess.processFunction(sst)))
            }
        }
    }

    async addScopedStyles(scopedComponentCollection){
        if ( scopedComponentCollection.size() ){
            const ScopedProcessor = await ScopedStyleProcess.loadScopedProcessor()
            const scopedStylesOutput = this.configureOutput('scoped.css')
            const rootViews = scopedComponentCollection.rootViews()
            for ( let i = scopedComponentCollection.size() - 1; i >= 0; --i ){
                const ct = scopedComponentCollection._components[i]
                await this.__addComponentScopedStyles(ct, ScopedProcessor, scopedComponentCollection, rootViews, scopedStylesOutput)
            }
            await scopedStylesOutput.reload()
        }
    }

    inputFiles(){
        let files = []
        for ( let i = 0; i < this._outputs.length; ++i ){
            files = files.concat(this._outputs[i].allInputPaths())
        }
        return files
    }

    get outputs(){
        return this._outputs
    }
}
