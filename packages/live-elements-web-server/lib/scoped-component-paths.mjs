import path from 'path'
import PackagePath from './package-path.cjs'
import ComponentRegistry from './component-registry.mjs'

export default class ScopedComponentPaths{
        
    static resolveRelativePaths(collection, bundleRootPath){
        for ( let i = 0; i < collection._components.length; ++i ){
            const c = collection._components[i]
            for ( let j = 0; j < c._styles.length; ++j ){
                const s = c._styles[j]

                const modulePath = ComponentRegistry.findComponentModulePathByUriId(c.uri, bundleRootPath)
                s.resolved.src = path.resolve(path.join(modulePath, s.src))

                if ( s.process ) {
                    if ( s.process.startsWith('.') ){
                        s.resolved.process = path.resolve(path.join(modulePath, s.process))
                    } else {
                        s.resolved.process = ScopedComponentPaths.resolveSrc(s.process, bundleRootPath)
                    }
                }
            }
        }
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
}