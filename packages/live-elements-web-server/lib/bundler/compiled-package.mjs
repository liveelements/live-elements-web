import fs from 'node:fs'
import path from 'node:path'
import { CompiledModuleManifest } from 'live-elements-web-server/lib/compiled-module-manifest.mjs'

export class CompiledPackageDependency {
    constructor(name, inlined = false, packageDir = null) {
        this.name = name
        this.inlined = inlined
        this.packageDir = inlined ? null : packageDir
    }

    static fromJSON(json) {
        return new CompiledPackageDependency(
            json.name,
            json.inlined === true,
            json.packageDir ?? null
        )
    }

    toJSON() {
        return {
            name: this.name,
            inlined: this.inlined,
            packageDir: this.packageDir
        }
    }
}

export class CompiledPackage {
    static MANIFEST_FILE = 'package.manifest.json'

    static fileNameFor(packageName) {
        return packageName.replace(/^@/, '').replaceAll('/', '__')
    }

    static outputDirFor(packageDir) {
        return path.join(packageDir, 'dist', 'client')
    }

    static writeFileAtomicSync(filePath, contents) {
        const tempPath = `${filePath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
        try {
            fs.writeFileSync(tempPath, contents, 'utf8')
            fs.renameSync(tempPath, filePath)
        } catch (error) {
            fs.rmSync(tempPath, { force: true })
            throw error
        }
    }

    static read(packageDir) {
        const manifestPath = path.join(CompiledPackage.outputDirFor(packageDir), CompiledPackage.MANIFEST_FILE)
        if (!fs.existsSync(manifestPath)) {
            return null
        }

        const json = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        if (
            !Array.isArray(json?.dependencies)
            || json.dependencies.some((entry) => entry?.inlined !== true && !entry?.packageDir)
        ) {
            return null
        }
        return CompiledPackage.fromJSON(json, packageDir)
    }

    readDependenciesFlatten(seen = new Set()) {
        if (seen.has(this.packageDir)) {
            return []
        }
        seen.add(this.packageDir)

        const flattened = [this]
        for (const dependency of this.dependencies) {
            if (dependency.inlined === true || !dependency.packageDir) {
                continue
            }

            const child = CompiledPackage.read(dependency.packageDir)
            const childFlattened = child?.readDependenciesFlatten(seen)
            if (!childFlattened) {
                return null
            }
            flattened.push(...childFlattened)
        }
        return flattened
    }

    constructor(packageName, packageDir = null, bundlePath = null, versionTag = null, dependencies = [], modules = [], assetPaths = []) {
        if (bundlePath && path.isAbsolute(bundlePath)) {
            throw new Error('CompiledPackage bundlePath must be relative to packageDir.')
        }

        this.packageName = packageName
        this.packageDir = packageDir
        this.modules = Object.freeze(modules)
        this.bundlePath = bundlePath
        this.versionTag = versionTag
        this.dependencies = dependencies
        this.assetPaths = Object.freeze(assetPaths)
    }

    get bundleAbsolutePath() {
        if (!this.packageDir || !this.bundlePath) {
            return null
        }
        return path.resolve(this.packageDir, this.bundlePath)
    }

    get bundleDir() {
        return this.bundleAbsolutePath ? path.dirname(this.bundleAbsolutePath) : null
    }

    static findExportCollisions(clientExports, modules, packageDir) {
        const exported = new Set(clientExports.map((entry) => path.resolve(packageDir, entry)))
        const filesByExport = new Map()
        for (const module of modules) {
            const match = /^build[\\/](.*)\.mjs$/.exec(module.compiledModulePath ?? '')
            const source = match ? path.resolve(packageDir, match[1]) : null
            if (!source || !exported.has(source)) {
                continue
            }

            const file = path.relative(packageDir, source)
            for (const { name } of module.exports) {
                if (!filesByExport.has(name)) {
                    filesByExport.set(name, [])
                }
                filesByExport.get(name).push(file)
            }
        }

        return [...filesByExport]
            .filter(([, files]) => files.length > 1)
            .map(([name, files]) => ({ name, files: files.sort() }))
            .sort((left, right) => left.name.localeCompare(right.name))
    }

    listExports(kind = null) {
        return this.modules.flatMap((module) =>
            module.exports
                .filter((entry) => kind === null || entry.kind === kind)
                .map((entry) => ({
                    module,
                    name: entry.name,
                    kind: entry.kind,
                    meta: entry.meta,
                    declared: entry.declared
                }))
        )
    }

    findModule(uri) {
        return this.modules.find((entry) => entry.uri === uri)
    }

    static packageNameOf(specifier) {
        const value = String(specifier ?? '').trim()
        if (!value || value.startsWith('.') || value.startsWith('/') || value.startsWith('#')) {
            return null
        }

        if (value.startsWith('node:')) {
            return value
        }

        if (value.startsWith('@')) {
            const segments = value.split('/')
            return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : value
        }

        const slashIndex = value.indexOf('/')
        return slashIndex === -1 ? value : value.slice(0, slashIndex)
    }

    static packageRootOf(resolvedFilePath, packageName) {
        const targetName = String(packageName ?? '').trim()
        if (!resolvedFilePath || !targetName) {
            return null
        }

        if (!path.isAbsolute(resolvedFilePath) || !fs.existsSync(resolvedFilePath)) {
            return null
        }

        let currentDir = fs.statSync(resolvedFilePath).isDirectory()
            ? path.resolve(resolvedFilePath)
            : path.dirname(path.resolve(resolvedFilePath))

        while (currentDir && currentDir !== path.dirname(currentDir)) {
            const packageJsonPath = path.join(currentDir, 'package.json')
            if (fs.existsSync(packageJsonPath)) {
                try {
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
                    if (String(packageJson?.name ?? '').trim() === targetName) {
                        return currentDir
                    }
                } catch {
                    return null
                }
            }
            currentDir = path.dirname(currentDir)
        }

        return null
    }

    static fromJSON(json, packageDir = null) {
        return new CompiledPackage(
            json.packageName,
            packageDir,
            json.bundlePath,
            json.versionTag,
            (json?.dependencies ?? []).map((entry) => CompiledPackageDependency.fromJSON(entry)),
            (json?.modules ?? []).map((entry) => CompiledModuleManifest.fromJSON(entry)),
            Array.isArray(json?.assetPaths) ? json.assetPaths : []
        )
    }

    toJSON() {
        return {
            packageName: this.packageName,
            bundlePath: this.bundlePath,
            assetPaths: this.assetPaths,
            versionTag: this.versionTag,
            dependencies: this.dependencies.map((entry) => entry.toJSON()),
            modules: this.modules.map((entry) => entry.toJSON())
        }
    }
}
