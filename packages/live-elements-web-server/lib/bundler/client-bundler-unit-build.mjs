import fs from 'node:fs'
import path from 'node:path'

import { CompiledPackage } from './compiled-package.mjs'
import { ClientBundlerAsset } from './client-bundler-asset.mjs'
import { ClientBundlerUnit } from './client-bundler-unit.mjs'
import { Warning } from '../../shared/errors/warning.mjs'

/** One immutable build record, owned by a single ClientBundlerRun. */
export class ClientBundlerUnitBuild {
    constructor(key, kind, assets, warnings, inputPaths, externalImports, dependencies, compiledPackage = null) {
        this.key = key
        this.kind = kind
        this.assets = assets
        this.warnings = warnings
        this.inputPaths = inputPaths
        this.externalImports = externalImports
        this.dependencies = dependencies
        this.package = compiledPackage
        Object.freeze(this)
    }

    static createFromBuildResult(unit, result, { outputPath, workingDir, bundleFileNameFor, compilation = null }) {
        const metafile = result.metafile
        const entryNameByPath = new Map()
        const entryNameByFileName = new Map()
        for (const [entryName, entryPath] of unit.syntheticEntries) {
            entryNameByPath.set(path.resolve(workingDir, entryPath).replace(/\\/g, '/'), entryName)
            entryNameByFileName.set(bundleFileNameFor(entryName), entryName)
        }
        const entryNameByOutput = new Map()
        const externalImports = new Set()
        for (const [outputKey, output] of Object.entries(metafile.outputs)) {
            if (output.entryPoint) {
                const entryPoint = output.entryPoint.replace(/^le-virtual:/, '')
                entryNameByOutput.set(
                    path.resolve(workingDir, outputKey).replace(/\\/g, '/'),
                    entryNameByPath.get(path.resolve(workingDir, entryPoint).replace(/\\/g, '/'))
                        ?? entryNameByFileName.get(path.basename(outputKey))
                        ?? null
                )
            }
            if (unit.isPage) {
                for (const imported of output.imports) {
                    if (imported.external === true) externalImports.add(imported.path)
                }
            }
        }
        const assets = result.outputFiles.map((outputFile) => {
            const entryName = entryNameByOutput.get(path.resolve(workingDir, outputFile.path).replace(/\\/g, '/')) ?? null
            const outputName = path.relative(outputPath, outputFile.path).split(path.sep).join('/')
            return new ClientBundlerAsset(outputName, outputFile.path, outputFile.text, entryName)
        })
        const dependencies = [...unit.sharedPackageData.collectedDependencies.values()]
            .sort((left, right) => left.name.localeCompare(right.name))
        const warnings = result.warnings.map((message) => new Warning(message.location?.file && !message.location.file.includes('node_modules')
            ? `${message.text} At file ${message.location.file}:${message.location.line}:${message.location.column}`
            : message.text))
        const inputPaths = Object.keys(metafile.inputs)
        const imports = unit.isPage ? [...externalImports].sort() : null
        let compiledPackage = null
        if (unit.isPackage) {
            const entryName = CompiledPackage.fileNameFor(unit.key)
            const mainAsset = assets.find((asset) => asset.entryName === entryName) ?? null
            if (!mainAsset) {
                throw new Error(`ClientBundler did not produce a main asset for client package "${unit.packageName}".`)
            }
            compiledPackage = new CompiledPackage(
                unit.packageName,
                unit.packageDir,
                mainAsset.relativeTo(unit.packageDir),
                mainAsset.versionTag,
                dependencies,
                compilation?.modules ?? [],
                assets.map((asset) => asset.relativeTo(unit.packageDir))
            )
        }
        return new ClientBundlerUnitBuild(
            unit.key,
            unit.kind,
            assets,
            warnings,
            inputPaths,
            imports,
            dependencies,
            compiledPackage
        )
    }

    static createFromCompiledPackage(compiledPackage, outputPath) {
        if (!compiledPackage.packageDir || !compiledPackage.bundlePath || !Array.isArray(compiledPackage.assetPaths)
            || !compiledPackage.assetPaths.includes(compiledPackage.bundlePath)) {
            return null
        }

        try {
            const assets = compiledPackage.assetPaths.map((relativePath) => {
                if (!relativePath || path.isAbsolute(relativePath)) {
                    throw new Error('invalid asset path')
                }
                const absolute = path.resolve(compiledPackage.packageDir, relativePath)
                const packageRelative = path.relative(compiledPackage.packageDir, absolute)
                if (packageRelative.startsWith('..') || path.isAbsolute(packageRelative)) {
                    throw new Error('asset path outside package')
                }
                return ClientBundlerAsset.createFromDisk(
                    path.relative(outputPath, absolute).split(path.sep).join('/'),
                    absolute,
                    fs.readFileSync(absolute, 'utf8'),
                    relativePath === compiledPackage.bundlePath
                        ? CompiledPackage.fileNameFor(compiledPackage.packageName)
                        : null
                )
            })
            return new ClientBundlerUnitBuild(
                compiledPackage.packageName,
                ClientBundlerUnit.Kind.Package,
                assets,
                [],
                [],
                null,
                compiledPackage.dependencies,
                compiledPackage
            )
        } catch {
            return null
        }
    }

    discoveredPackages() {
        if (this.isPage) {
            return (this.externalImports ?? []).flatMap((name) => {
                const dependency = this.dependencies.find((entry) => entry.name === name)
                return dependency?.packageDir && dependency.inlined !== true
                    ? [{ name, packageDir: dependency.packageDir }]
                    : []
            })
        }
        return this.dependencies
            .filter((dependency) => dependency.inlined !== true && dependency.packageDir)
            .map((dependency) => ({ name: dependency.name, packageDir: dependency.packageDir }))
    }

    get isPage() { return this.kind === ClientBundlerUnit.Kind.Page }
    get isPackage() { return this.kind === ClientBundlerUnit.Kind.Package }
    get isSyncedToDisk() { return this.assets.length > 0 && this.assets.every((asset) => asset.isSyncedToDisk) }
}
