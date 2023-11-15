const path = require('path')
const fs = require('fs')

module.exports = class PackagePath{

    static findPackageJson(currentPath) {
        const packageJsonPath = path.join(currentPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            return packageJsonPath;
        }
        const parentPath = path.resolve(currentPath, '..');
        if (parentPath === currentPath) {
            return null;
        }
        return PackagePath.findPackageJson(parentPath);
    }

    static __findThroughMainEntryPoint(name){
        try{
            const entry = require.resolve(name)
            if ( entry ){
                let current = entry
                let previous
                while ( current && current !== previous ){
                    if ( fs.existsSync(path.join(current, 'package.json')) )
                        return current
                    previous = current
                    current = path.dirname(current)
                }
            }
        } catch ( _ ) {}
        return null
    }

    static find(name, currentLocation){
        if ( name === '.' ){
            const currentPackage = PackagePath.findPackageJson(currentLocation)
            if ( currentPackage ){
                return path.dirname(currentPackage)
            }
            return path.resolve('.')
        }
        try{
            return path.dirname(require.resolve(`${name}/package.json`))
        } catch ( e ){
            if (e.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
                const found = PackagePath.__findThroughMainEntryPoint(name)
                if ( found )
                    return found
            }
            if ( currentLocation ){
                const currentPackage = PackagePath.findPackageJson(currentLocation)
                if ( currentPackage ){
                    const packageName = require(currentPackage).name
                    if( packageName === name )
                        return path.dirname(currentPackage)
                }
            }
            
            throw new Error(`Failed to find package ${name} (location: ${currentLocation})`)
        }  
    }

    static findLocation(relativePath, currentLocation){
        let packageSeparator = relativePath.indexOf('/')
        if (packageSeparator === -1) {
            throw new Error(`Cannot find path: ${relativePath}`)
        }

        let packageName = relativePath.substr(0, packageSeparator)
        let packagePath = PackagePath.find(packageName, currentLocation)
        let pathFromPackage = relativePath.substr(packageSeparator + 1)
        return path.join(packagePath, pathFromPackage);
    }
}
