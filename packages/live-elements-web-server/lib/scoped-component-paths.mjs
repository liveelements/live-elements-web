import path from 'path'
import PackagePath from './package-path.cjs'
import ComponentRegistry from './component-registry.mjs'

export default class ScopedComponentPaths{

    static resolveRelativePaths(collection, bundleRootPath, options = {}){
        const packageRoots = options.packageRoots || {}

        for ( let i = 0; i < collection._components.length; ++i ){
            const c = collection._components[i]
            for ( let j = 0; j < c._styles.length; ++j ){
                const s = c._styles[j]

                const modulePath = ScopedComponentPaths.resolveComponentModulePath(c.uri, bundleRootPath, packageRoots)

                if ( s.src.startsWith('.') ){
                    s.resolved.src = path.resolve(path.join(modulePath, s.src))
                } else {
                    s.resolved.src = ScopedComponentPaths.resolveSrc(s.src, bundleRootPath, packageRoots)
                }
                

                if ( s.process ) {
                    if ( s.process.startsWith('.') ){
                        s.resolved.process = path.resolve(path.join(modulePath, s.process))
                    } else {
                        s.resolved.process = ScopedComponentPaths.resolveSrc(s.process, bundleRootPath, packageRoots)
                    }
                }
            }
        }
    }

    static resolveComponentModulePath(uriId, bundleRootPath, packageRoots){
        try{
            return ComponentRegistry.findComponentModulePathByUriId(uriId, bundleRootPath)
        } catch ( e ){
            const uriSegments = ComponentRegistry.componentUriIdSegments(uriId)
            if ( packageRoots.hasOwnProperty(uriSegments.package) ){
                const packageRoot = packageRoots[uriSegments.package]
                return uriSegments.modules.length ? path.join(packageRoot, uriSegments.modules.join('/')) : packageRoot
            }
            throw e
        }
    }

    static resolveSrc(src, bundleRootPath, packageRoots = {}){
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

        let packagePath = null
        try{
            packagePath = PackagePath.find(packageName, bundleRootPath)
        } catch ( e ){
            if ( packageRoots.hasOwnProperty(packageName) ){
                packagePath = packageRoots[packageName]
            } else {
                throw e
            }
        }
        let pathFromPackage = src.substr(packageSeparator + 1)
        return path.join(packagePath, pathFromPackage)
    }
}
