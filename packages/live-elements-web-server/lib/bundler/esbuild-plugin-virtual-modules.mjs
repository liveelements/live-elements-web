import fs from 'node:fs'
import path from 'node:path'

export function virtualModulesPlugin(scripts) {
    if (!Array.isArray(scripts)) {
        throw new Error('virtualModulesPlugin(scripts) expects an array of VirtualScript.')
    }

    const names = scripts.map((script) => path.basename(script.location).replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&'))
    const filter = names.length ? new RegExp(`(?:^|[\\\\/])(?:${names.join('|')})$`) : /[^\s\S]/

    return {
        name: 'le-virtual-modules',
        setup(build) {
            build.onResolve({ filter }, (args) => {
                const resolvedPath = path.resolve(path.isAbsolute(args.path)
                    ? args.path
                    : path.resolve(args.resolveDir, args.path))
                const absPath = path.resolve('/', resolvedPath).replace(/\\/g, '/')

                return scripts.some((script) => path.resolve('/', script.location).replace(/\\/g, '/') === absPath)
                    ? { path: absPath, namespace: 'le-virtual' }
                    : null
            })

            build.onLoad({ filter: /.*/, namespace: 'le-virtual' }, (args) => {
                const script = scripts.find((entry) => path.resolve('/', entry.location).replace(/\\/g, '/') === args.path)
                if (!script) {
                    throw new Error(`Virtual module has no content registered for "${args.path}".`)
                }

                const resolveDir = path.dirname(args.path)
                if (!fs.existsSync(resolveDir) || !fs.statSync(resolveDir).isDirectory()) {
                    throw new Error(
                        `Virtual module directory does not exist for "${args.path}". `
                        + 'Create the directory on disk before using relative imports.'
                    )
                }

                return { contents: script.content, loader: 'js', resolveDir }
            })
        }
    }
}
