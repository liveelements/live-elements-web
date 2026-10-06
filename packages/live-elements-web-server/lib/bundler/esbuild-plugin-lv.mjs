import path from 'node:path'
import { fileURLToPath } from 'node:url'

import compiler from 'live-elements-js-compiler'
import { load as loadCompilerConfig } from 'live-elements-core/compilerconfig.mjs'

export class LvEsbuildCompilation {
    static async create() {
        const config = await loadCompilerConfig()
        const created = compiler.createCompiler(config)
        if (created.error) {
            const error = created.error
            throw error instanceof Error ? error : new Error(error?.message ?? String(error))
        }
        return new LvEsbuildCompilation(created.value)
    }

    constructor(compilerHandle) {
        this._compiler = compilerHandle
        this._compiledPaths = new Map()
    }

    get compiler() { return this._compiler }

    compiledPathFor(sourcePath) {
        return this._compiledPaths.get(path.resolve(sourcePath)) ?? null
    }

    compile(sourcePath) {
        return new Promise((resolve, reject) => {
            compiler.runCompiler(this._compiler, sourcePath, (compilation, err) => {
                if (err) {
                    const error = err instanceof Error
                        ? err
                        : (err.error instanceof Error ? err.error : new Error(err?.error?.message ?? String(err)))
                    if (err.source && !String(error.message).includes(err.source.file)) {
                        error.message += ` At file ${err.source.file}:${err.source.line}:${err.source.column}`
                    }
                    reject(error)
                    return
                }

                if (!compilation) {
                    reject(new Error(`Internal compiler error: Undefined compilation result: ${sourcePath}`))
                    return
                }

                try {
                    for (const file of compilation.files()) {
                        this._compiledPaths.set(file.path, file.jsPath)
                    }
                    const compiledPath = compilation.jsPath(compilation.target)
                    if (!compiledPath) {
                        throw new Error(`Internal compiler error: No compilation result for: ${sourcePath}`)
                    }
                    resolve(compiledPath)
                } catch (error) {
                    reject(error)
                } finally {
                    compilation.release()
                }
            })
        })
    }

    close() {
        this._compiledPaths.clear()
        this._compiler = null
    }
}

export class LvPluginData {
    constructor() {
        this.compilation = null
    }

    open(compilation) {
        this.compilation = compilation
        return this
    }

    close() {
        this.compilation = null
    }
}

export function lvEsbuildPlugin(data = null) {
    return {
        name: 'live-elements-lv',
        setup(build) {
            build.onResolve({ filter: /\.lv$/ }, async (args) => {
                const sourcePath = args.path.startsWith('file://')
                    ? fileURLToPath(args.path)
                    : path.resolve(args.resolveDir, args.path)

                const compilation = data?.compilation ?? null
                const cachedPath = compilation?.compiledPathFor(sourcePath)
                if (cachedPath) {
                    return { path: cachedPath }
                }

                if (compilation) {
                    return { path: await compilation.compile(sourcePath) }
                }

                const temporary = await LvEsbuildCompilation.create()
                try {
                    return { path: await temporary.compile(sourcePath) }
                } finally {
                    temporary.close()
                }
            })
        }
    }
}
