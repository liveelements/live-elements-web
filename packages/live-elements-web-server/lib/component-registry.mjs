import lvimport from "live-elements-core/lvimport.mjs"
import PackagePath from './package-path.cjs'
import path from 'path'

export default class ComponentRegistry{

    static add(comps){
        for (const [name, location] of Object.entries(comps)) {
            const exists = ComponentRegistry.loadQueue.find(c => c.alias === name)
            if ( exists ){
                throw new Error(`Component '${name}' already exists. Use ComponentRegistry.addAlias function.`)
            }
            const loaded = ComponentRegistry.ComponentsInfo.find(c => c.alias === name)
            if ( loaded && loaded.location !== location ){
                throw new Error(`Component '${name}' already exists. Use ComponentRegistry.addAlias function.`)
            }
            if ( !loaded ){
                ComponentRegistry.loadQueue.push(
                    { name: name, location: location, alias: name }
                )
            }
        }
    }

    static addAlias(name, location, aliasParam){
        const alias = aliasParam ? aliasParam : name
        const exists = loadQueue.find(c => c.alias === alias)
        if ( exists ){
            throw new Error(`Component '${alias}' already exists. Use a diffeernt alias.`)
        }
        const loaded = ComponentRegistry.ComponentsInfo.find(c => c.alias === alias)
        if ( loaded && loaded.location !== location ){
            throw new Error(`Component '${alias}' already exists. Use a different alias.`)
        }
        if ( !loaded ){
            ComponentRegistry.loadQueue.push(
                { name: name, location: value, alias: name }
            )
        }
    }

    static async update(){
        for ( let i = 0; i < ComponentRegistry.loadQueue.length; ++i ){
            const toLoad = ComponentRegistry.loadQueue[i]
            ComponentRegistry.ComponentsInfo.push(
                { name: toLoad.name, location: toLoad.location, alias: toLoad.alias }
            )
            const module = await lvimport(toLoad.location)
            ComponentRegistry.Components[toLoad.alias] = module[toLoad.name]
        }
        ComponentRegistry.loadQueue = []
        return ComponentRegistry.Components
    }

    /**
     * Dot-separated LV module paths use either `pkgname.a.b` or `@scope.pkgname.a.b`.
     * Scoped npm packages always appear as two dot segments after the split.
     */
    static splitPackageFromUriSegments(segments){
        if (segments.length === 0) {
            throw new Error('ComponentRegistry: empty module segments')
        }
        if (segments[0].startsWith('@')) {
            if (segments.length < 2) {
                throw new Error(`ComponentRegistry: invalid scoped module path (expected @scope/pkg): ${segments.join('.')}`)
            }
            const packageName = `${segments[0]}/${segments[1]}`
            return { packageName, rest: segments.slice(2) }
        }
        return { packageName: segments[0], rest: segments.slice(1) }
    }

    static findComponentPath(c, lookupPath){
        const module = c.Meta.module
        const moduleSegments = module.split('.')
        if ( moduleSegments.length === 0 ){
            throw new Error(`Cannot determine components '${c.name}' module. Result is empty.`)
        }
        const { packageName, rest } = ComponentRegistry.splitPackageFromUriSegments(moduleSegments)
        const modulePackagePath = PackagePath.find(packageName, lookupPath)
        const moduleDirectoryPath = rest.length
            ? path.join(modulePackagePath, rest.join('/'))
            : modulePackagePath
        return path.join(moduleDirectoryPath, c.Meta.sourceFileName)
    }

    static findComponentModulePathByUriId(uriId, searchLocation){
        const uriSegments = ComponentRegistry.componentUriIdSegments(uriId)
        const packagePath = PackagePath.find(uriSegments.package, searchLocation)
        const modulePath = path.join(packagePath, uriSegments.modules.join('/'))
        return modulePath
    }

    static findComponentByUriId(uriId, file, searchLocation){
        const componentModulePath = ComponentRegistry.findComponentModulePathByUriId(uriId, searchLocation)
        const componentPath = path.join(componentModulePath, file)
        return componentPath
    }

    static componentUriIdSegments(uriId){
        const uriSegments = uriId.split('.')
        if ( uriSegments.length < 2 )
            throw new Error(`ComponentRegistry: Invalid component uri: ${uriId}`)
        const { packageName, rest } = ComponentRegistry.splitPackageFromUriSegments(uriSegments)
        if (rest.length < 1)
            throw new Error(`ComponentRegistry: Invalid component uri (missing component name): ${uriId}`)
        return {
            package: packageName,
            modules: rest.slice(0, rest.length - 1),
            name: rest[rest.length - 1]
        }
    }

    static async importComponentFromUriId(uriId, file, searchLocation){
        const componentModulePath = ComponentRegistry.findComponentModulePathByUriId(uriId, searchLocation)
        const componentPath = path.join(componentModulePath, file)
        const componentName = ComponentRegistry.componentUriIdSegments(uriId).name
        const componentModule = await lvimport(componentPath)
        return componentModule[componentName]
    }

    static componentUriId(c){
        return `${c.Meta.module}.${c.name}`
    }
}

ComponentRegistry.loadQueue = []
ComponentRegistry.ComponentsInfo = []
ComponentRegistry.Components = {}
