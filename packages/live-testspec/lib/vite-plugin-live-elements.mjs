import path from 'node:path'

import compiler from 'live-elements-js-compiler'
import * as compilerConfig from 'live-elements-core/compilerconfig.mjs'

export default function liveElements() {
    return {
        name: 'live-elements',
        enforce: 'pre',
        async transform(_code, id) {
            if (!id.endsWith('.lv')) {
                return null
            }

            const config = await compilerConfig.load()
            const resultFile = await new Promise((resolve, reject) => {
                compiler.compile(id, config, (result, err) => {
                    if ( result )
                        resolve(result)
                    else if ( err ){
                        if ( err instanceof Error ){
                            reject(err)
                        } else if ( err.error ){
                            if ( err.source ){
                                err.error.source = err.source
                                err.error.message += ' At file ' + err.error.source.file + ':' + err.error.source.line + ':' + err.error.source.column
                            }
                            reject(err.error)
                        } else {
                            reject(err)
                        }
                    } else
                        reject(new Error("Internal compile error at path: " + id))
                })
            })

            let relative = path.relative(path.dirname(id), resultFile)
            if (process.platform === 'win32') {
                relative = relative.split(path.sep).join(path.posix.sep)
            }
            if (!relative.startsWith('.')) {
                relative = `./${relative}`
            }

            return { code: `export * from ${JSON.stringify(relative)};`, map: null }
        }
    }
}
