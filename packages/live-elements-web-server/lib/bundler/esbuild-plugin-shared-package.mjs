import fs from 'node:fs'
import path from 'node:path'

import { CompiledPackage, CompiledPackageDependency } from './compiled-package.mjs'

export class SharedPackagePluginData {
    constructor() {
        this.unit = null
        this.run = null
        this.collectedDependencies = null
        this.packageNameToPaths = null
    }

    open(unit, run) {
        this.unit = unit
        this.run = run
        this.collectedDependencies = new Map()
        this.packageNameToPaths = new Map()
        return this
    }

    close() {
        this.unit = null
        this.run = null
        this.collectedDependencies = null
        this.packageNameToPaths = null
    }
}

export function sharedPackageEsbuildPlugin(data) {
    return {
        name: 'le-shared-package',
        setup(build) {
            build.onResolve({ filter: /^[^./#]/ }, async (args) => {
                if (args.pluginData?.externalsProbe) {
                    return null
                }

                if (!data?.unit || !data?.run) {
                    throw new Error('sharedPackageEsbuildPlugin was used outside an active ClientBundler build.')
                }

                const { unit, run, collectedDependencies, packageNameToPaths } = data

                const dependencyName = CompiledPackage.packageNameOf(args.path)
                if (!dependencyName || dependencyName.startsWith('node:')) {
                    return null
                }

                if (dependencyName === unit.packageName) {
                    return null
                }

                let knownDependency = collectedDependencies.get(dependencyName)
                if (!knownDependency) {
                    const compiledPackage = run.compiledPackage(dependencyName)
                    if (compiledPackage) {
                        knownDependency = new CompiledPackageDependency(dependencyName, false, compiledPackage.packageDir)
                        collectedDependencies.set(dependencyName, knownDependency)
                    }
                }

                if (knownDependency) {
                    return knownDependency.inlined === true
                        ? null
                        : { path: dependencyName, external: true }
                }

                if (!packageNameToPaths.has(dependencyName)) {
                    const resolveOptions = {
                        kind: 'import-statement',
                        resolveDir: args.resolveDir,
                        pluginData: { externalsProbe: true }
                    }

                    packageNameToPaths.set(dependencyName, build.resolve(args.path, resolveOptions)
                        .then((resolved) => {
                            if (resolved.path && resolved.errors.length === 0) {
                                return resolved
                            }

                            return args.path === dependencyName
                                ? build.resolve(`${dependencyName}/package.json`, resolveOptions)
                                : resolved
                        })
                        .then((resolved) => resolved.path && resolved.errors.length === 0
                            ? CompiledPackage.packageRootOf(resolved.path, dependencyName)
                            : null))
                }

                const resolvedPackageDir = await packageNameToPaths.get(dependencyName)
                if (!resolvedPackageDir) {
                    return null
                }

                const external = fs.existsSync(path.join(resolvedPackageDir, 'client.package.json'))
                if (!collectedDependencies.has(dependencyName)) {
                    collectedDependencies.set(
                        dependencyName,
                        new CompiledPackageDependency(dependencyName, !external, resolvedPackageDir)
                    )
                }

                return external
                    ? { path: dependencyName, external: true }
                    : null
            })
        }
    }
}
