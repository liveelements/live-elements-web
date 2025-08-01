import path from 'path'
import fs from 'fs'
import url from 'url'
import PackagePath from 'live-elements-web-server/lib/package-path.cjs'
import { EventEmitter } from 'node:events'
import ScopedComponentSelectors from './scoped-component-selectors.mjs'
import BundleData from './bundle-data.mjs'
import StyleChainProcessor from './style-chain-processor.mjs'
import Memory from './memory/memory.mjs'
import StyleCachedProcessor from './style-cached-processor.mjs'

class StyleInput {
    constructor(file, processor, processorCache) {
        this._file = file
        this._processedContent = ''
        this._processor = processor
        this._processorCache = processorCache
    }

    invalidate(){
        this._processorCache.invalidate(this._file)
    }

    async reload(output) {
        this._processedContent = await this._processorCache.process(this._file, this._processor, output)
    }
}

class StyleOutput {
    constructor(output, dist, cacheProcessor) {
        this._inputs = []
        this._output = output
        this._content = ''
        this._dist = dist
        this._cachedStyleProcessor = cacheProcessor
    }

    get output() { return this._output }
    get content() { return this._content }

    addInput(file, processor) {
        const input = new StyleInput(file, processor, this._cachedStyleProcessor)
        this._inputs.push(input)
        return input
    }

    containsInput(file) {
        return this._inputs.find(inp => inp._file === file)
    }

    addInputUnique(file, processor) {
        const exists = this._inputs.find(inp => inp._file === file)
        if (!exists) {
            const input = new StyleInput(file, processor, this._cachedStyleProcessor)
            this._inputs.push(input)
            return input
        }
        return exists
    }

    allInputPaths() {
        return this._inputs.map(input => input._file)
    }

    async reload() {
        let content = ''
        for (let i = 0; i < this._inputs.length; ++i) {
            await this._inputs[i].reload(this._dist + '/' + this._output + '.css')
            content += this._inputs[i]._processedContent
        }
        this._content = content
    }

    async reloadInputFile(path) {
        const input = this._inputs.find(i => i._file === path)
        if (input) {
            input.invalidate()
            await input.reload(this._dist + '/' + this._output + '.css')
            let content = ''
            for (let i = 0; i < this._inputs.length; ++i) {
                content += this._inputs[i]._processedContent
            }
            this._content = content
        }
        return input
    }

    inputByPath(path) {
        return this._inputs.find(i => i._file === path)
    }
}

export default class StyleContainer extends EventEmitter {
    constructor(dist, cachePath) {
        super()
        this._dist = dist
        this._outputs = []
        this._cachedStyleProcessor = StyleCachedProcessor.create(cachePath)
    }

    addOutput(output) {
        const style = new StyleOutput(output, this._dist, this._cachedStyleProcessor)
        this._outputs.push(style)
        return style
    }

    removeOutput(output){
        this._outputs = this._outputs.filter(o => o !== output)
    }

    saveCache(location){
        this._cachedStyleProcessor.saveCache(location)
    }

    loadFromCache(location){
        this._cachedStyleProcessor = StyleCachedProcessor.createFromCache(location)
    }

    getOutput(key) {
        return this._outputs.find(s => s.output === key)
    }

    configureOutput(output) {
        const style = this.getOutput(output)
        return style ? style : this.addOutput(output)
    }

    async reload() {
        for (let i = 0; i < this._outputs.length; ++i) {
            await this._outputs[i].reload()
        }
        this.emit('change')
    }

    async reloadInputFile(path) {
        const outputsChanged = []
        for (let i = 0; i < this._outputs.length; ++i) {
            const hasInput = await this._outputs[i].reloadInputFile(path)
            if (hasInput)
                outputsChanged.push(this._outputs[i].output)
        }
        this.emit('change', outputsChanged)
    }

    static scopedCSSPath(){
        const currentDir = path.dirname(url.fileURLToPath(import.meta.url))
        return path.resolve(path.join(currentDir, '..', 'style', 'processors', 'private', 'ScopedCSS.lv'))
    }

    static resolveSrc(src, bundleRootPath) {
        let packageSeparator = src.indexOf('/');
        if (packageSeparator === -1) {
            throw new Error(`Cannot find style file: ${src}`);
        }
        let packageName = src.substr(0, packageSeparator)
        if (packageName.startsWith('@')) {
            let nextPackageSeparator = src.indexOf('/', packageSeparator + 1)
            if (nextPackageSeparator !== -1) {
                packageSeparator = nextPackageSeparator
                packageName = src.substr(0, nextPackageSeparator)
            }
        }

        let packagePath = PackagePath.find(packageName, bundleRootPath)
        let pathFromPackage = src.substr(packageSeparator + 1)
        return path.join(packagePath, pathFromPackage)
    }

    static async load(bundlePath, configuredStyles, cachePath) {
        let bundleRootPath = BundleData.findPackagePath(bundlePath)
        const styles = new StyleContainer(path.join(bundleRootPath, 'styles'), cachePath)

        for (var i = 0; i < configuredStyles.length; ++i) {
            let style = configuredStyles[i]
            if (!style.src) {
                throw new Error("Style missing 'src' field.")
            }
            if (!style.output) {
                throw new Error("Style missing 'output' field.")
            }

            const styleSrc = StyleContainer.resolveSrc(style.src, bundleRootPath)
            const styleOutput = styles.configureOutput(style.output)
            styleOutput.addInput(styleSrc, style.process)
        }

        for (let i = 0; i < styles._outputs.length; ++i) {
            await styles._outputs[i].reload()
        }

        return styles
    }

    /**
     * Iterates through the top styles of the scopedComponent, and creates an output with the proocessed
     * styles for that component
     */
    static async createTopLevelStyles(scopedComponent, scopedCollection, location, useDefaultPrefix){
        const styleContainer = new StyleContainer(location)
        const styleOutputs = []
        const pathToScopedCSS = StyleContainer.scopedCSSPath()

        for (let j = 0; j < scopedComponent._styles.length; ++j) {
            // add each component input style with it's own component selector transformations
            const sst = scopedComponent._styles[j]
            if (!sst.resolved.src) {
                throw new Error(`Style path was not resolved '${sst.src}' in component '${scopedComponent.uri}'`)
            }
            const styleOutput = styleContainer.configureOutput(sst.src)
            const selectors = ScopedComponentSelectors.fromStyle(scopedCollection, sst)

            const scopedProcessor = { file: pathToScopedCSS, args: { lookups: selectors, defaultPrefix: useDefaultPrefix ? scopedComponent.classNameWithPrefix : '' } }
            const sstProcessor = sst.resolved.process ? { file: sst.resolved.process, args: undefined } : null
            const processChain = sstProcessor ? [scopedProcessor, sstProcessor] : [scopedProcessor]
            styleOutput.addInputUnique(sst.resolved.src, await StyleChainProcessor.create(processChain))
            await styleOutput.reload()

            styleOutputs.push(styleOutput)
        }

        return styleOutputs
    }

    async __addComponentScopedStyles(ct, scopedComponentCollection, rootViews, output, theme){
        const isRoot = rootViews.includes(ct)
        const classNameWithPrefix = isRoot ? '' : ct.classNameWithPrefix
        if (ct.inherits) {
            await this.__addComponentScopedStyles(ct.inherits, scopedComponentCollection, rootViews, output, theme)
        }
        
        const pathToScopedCSS = StyleContainer.scopedCSSPath()

        for (let j = 0; j < ct._styles.length; ++j) {
            // add each component input style with it's own component selector transformations
            const sst = ct._styles[j]
            if (!sst.resolved.src) {
                throw new Error(`Style path was not resolved '${sst.src}' in component '${ct.uri}'`)
            }
            if (!output.containsInput(sst.resolved.src)) {
                const selectors = ScopedComponentSelectors.fromStyle(scopedComponentCollection, sst)

                const scopedProcessor = { file: pathToScopedCSS, args: { lookups: selectors, defaultPrefix: classNameWithPrefix } }

                const sstProcessor = sst.resolved.process ? { file: sst.resolved.process, args: undefined, theme: theme ? theme.toJSON() : null } : null
                const processChain = sstProcessor ? [scopedProcessor, sstProcessor] : [scopedProcessor]
                output.addInputUnique(sst.resolved.src, await StyleChainProcessor.create(processChain))
            }
        }
    }

    async addScopedStyles(scopedComponentCollection, output, themes){
        if (scopedComponentCollection.size()) {
            const scopedStylesOutput = output ? output : this.configureOutput('scoped.css')
            const rootViews = scopedComponentCollection.rootViews()
            for (let i = scopedComponentCollection.size() - 1; i >= 0; --i) {
                const ct = scopedComponentCollection._components[i]
                await this.__addComponentScopedStyles(ct, scopedComponentCollection, rootViews, scopedStylesOutput, themes && themes.length ? themes[0] : null)
            }
            await scopedStylesOutput.reload()
        }
    }

    inputFiles() {
        let files = []
        for (let i = 0; i < this._outputs.length; ++i) {
            files = files.concat(this._outputs[i].allInputPaths())
        }
        return files
    }

    get outputs() {
        return this._outputs
    }
}
