import path from 'node:path'
import { fileURLToPath } from 'node:url'

import compiler from 'live-elements-js-compiler'
import { load as loadCompilerConfig } from 'live-elements-core/compilerconfig.mjs'

export function lvEsbuildPlugin() {
    return {
        name: 'live-elements-lv',
        setup(build) {
            build.onResolve({ filter: /\.lv$/ }, async (args) => {
                const sourcePath = args.path.startsWith('file://')
                    ? fileURLToPath(args.path)
                    : path.resolve(args.resolveDir, args.path)

                const config = await loadCompilerConfig()

                const compiledPath = await new Promise((resolve, reject) => {
                    compiler.compile(sourcePath, config, (resultFile, err) => {
                        if (err) {
                            const error = err instanceof Error
                                ? err
                                : (err && err.error ? err.error : new Error(String(err)))

                            if (err && err.source && !String(error.message).includes(err.source.file)) {
                                error.message += ` At file ${err.source.file}:${err.source.line}:${err.source.column}`
                            }
                            return reject(error)
                        }

                        if (!resultFile) {
                            return reject(new Error(`Internal compiler error: Undefined compilation result: ${sourcePath}`))
                        }

                        resolve(resultFile)
                    })
                })

                return { path: compiledPath }
            })
        }
    }
}
