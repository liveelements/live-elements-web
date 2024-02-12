import path from 'path'
import fs from 'fs'
import url from 'url'
import lvimport from 'live-elements-core/lvimport.mjs'
import PackagePath from './package-path.cjs'

class BundleDataScanControl{
    constructor(bundle, collectors){
        this._bundle = bundle
        this._collectors = collectors
        this._result = {}
    }

    iterate(group, trail){
        for ( let j = 0; j < this._collectors.length; ++j ){
            const collector = this._collectors[j]
            const newTrail = collector.iterateStart(group, trail)
            if ( newTrail )
                trail = newTrail
        }

        for ( let i = 0; i < group.children.length; ++i ){
            const node = group.children[i]
            for ( let j = 0; j < this._collectors.length; ++j ){
                const collector = this._collectors[j]
                collector.visit(node, trail, this)
            }
        }

        for ( let j = 0; j < this._collectors.length; ++j ){
            this._collectors[j].iterateEnd()
        }
    }

    runIteration(trail){
        for ( let j = 0; j < this._collectors.length; ++j ){
            const collector = this._collectors[j]
            const newTrail = collector.start(this._bundle, trail)
            if ( newTrail )
                trail = newTrail
        }

        this.iterate(this._bundle, trail)

        for ( let j = 0; j < this._collectors.length; ++j ){
            const collector = this._collectors[j]
            const collectorResult = collector.end(trail)
            if ( collector.name() ){
                this._result[collector.name()] = collectorResult
            }
        }

        return Promise.resolve(this._result)
    }
}

export default class BundleData{
    constructor(bundle, file, packagePath){
        this._bundle = bundle
        this._file = file
        this._packagePath = packagePath
        this._supportsExtraViews = false
    }

    get bundle(){ return this._bundle }
    get file(){ return this._file }
    get packagePath(){ return this._packagePath }
    get supportsExtraViews(){ return this._supportsExtraViews }

    scan(collectors){
        if ( !Array.isArray(collectors) ){
            throw new Error(`BundleData.scan: Expected array: ${collectors}`)
        }
        const trail = { bundleFilePath: this._file, bundlePackagePath: this._packagePath }
        const control = new BundleDataScanControl(this._bundle, collectors)
        return control.runIteration(trail)
    }

    static async load(bundlePath){
        const bundlePathFull = path.resolve(bundlePath)
        const bundleImport = await BundleData.importBundleFile(bundlePathFull)
        const bundlePackagePath = BundleData.findPackagePath(bundlePathFull)
        return new BundleData(bundleImport, bundlePath, bundlePackagePath)
    }

    static async importBundleFile(bundlePath){
        let res = await lvimport(bundlePath)
        var keys = Object.keys(res)
        if ( keys.length > 1 ){
            throw new Error("Bundle file should only export a single Bundle object.")
        }
    
        const bundle = res[keys[0]]
        if ( bundle.constructor.name !== 'Bundle' ){
            throw new Error("Bundle file should only export a single Bundle object.")
        }
        return bundle
    }

    static async findAndLoad(bundle, lookupDir){
        if ( bundle ){
            if ( !fs.existsSync(bundle) )
                throw new Error(`Bundle file not found: ${path.resolve(bundle)}`)
            return await BundleData.load(bundle)
        } else {
            const packagePath = PackagePath.findPackageJson(lookupDir)
            if ( !packagePath )
                return null

            const packageObject = JSON.parse(fs.readFileSync(packagePath))
            if ( !packageObject.hasOwnProperty('lvweb' ) || !packageObject.lvweb.hasOwnProperty('bundle') ){
                return null
            }

            const allowViewArgument = packageObject.lvweb.allowBundleView ? packageObject.lvweb.allowBundleView : false

            if ( path.isAbsolute(packageObject.lvweb.bundle) ){
                const bundleData = await BundleData.load(bundle)
                bundleData._supportsExtraViews = allowViewArgument
                return bundleData
            } else {
                const bundleRelative = packageObject.lvweb.bundle
                if ( bundleRelative.startsWith('./') ){
                    const bundleData = await BundleData.load(bundle)
                    bundleData._supportsExtraViews = allowViewArgument
                    return bundleData
                } else {
                    const currentDir = path.dirname(url.fileURLToPath(import.meta.url))
                    const bundlePackageName = bundleRelative.substr(0, bundleRelative.indexOf('/'))
                    const bundlePackage = PackagePath.find(bundlePackageName, currentDir)
                    const bundleData = await BundleData.load(path.join(bundlePackage, bundleRelative.substr(bundleRelative.indexOf('/') + 1)))
                    bundleData._supportsExtraViews = allowViewArgument
                    return bundleData
                }
            }
        }
    }

    static findPackagePath(bundlePath){
        let d = path.dirname(bundlePath);
        while (d) {
            if (fs.existsSync(path.join(d, 'live.package.json')))
                return d
            if (fs.existsSync(path.join(d, 'package.json')))
                return d

            let next = path.dirname(d)
            if (next === d)
                return ''
            d = next
        }
        return ''
    }
}