import fs from 'node:fs'
import path from 'node:path'

export class ClientPackageConfig {
    
    static read(configPath) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
        return new ClientPackageConfig(path.dirname(configPath), raw.exports, raw.docs)
    }

    constructor(packageDir, exports, docs) {
        this.packageDir = packageDir
        this.exports = Object.freeze([...exports])
        this.docs = docs ?? null
    }

    get docsPath() {
        return this.docs === null ? null : path.resolve(this.packageDir, this.docs)
    }

    resolveClientExports() {
        const included = new Set()
        const excluded = new Set()

        for (const pattern of this.exports) {
            const negate = pattern.startsWith('!')
            const glob = negate ? pattern.slice(1) : pattern
            const matches = fs.globSync(glob, { cwd: this.packageDir })
                .map((relPath) => path.resolve(this.packageDir, relPath))
                .filter((fullPath) => fs.statSync(fullPath).isFile())

            for (const match of matches) {
                if (negate) {
                    excluded.add(match)
                } else {
                    included.add(match)
                }
            }
        }

        return [...included]
            .filter((fullPath) => !excluded.has(fullPath))
            .sort((left, right) => left.localeCompare(right))
    }

    bundleEntrySource() {
        const clientExports = this.resolveClientExports()
        return clientExports.length > 0
            ? `${clientExports.map((filePath) =>
                `export * from ${JSON.stringify(filePath.replace(/\\/g, '/'))};`
            ).join('\n')}\n`
            : 'export {}\n'
    }
}
