import path from 'node:path'

import log from './server-log.mjs'

export class ImportMap {
    static OutputFile = 'import-map.json'

    static inlineJson(value) {
        return JSON.stringify(value ?? null).replaceAll('<', '\\u003c')
    }

    constructor(imports, modulepreloads) {
        this._imports = imports
        this._modulepreloads = modulepreloads
    }

    get imports() { return this._imports }
    get modulepreloads() { return this._modulepreloads }
    get isEmpty() {
        return Object.keys(this._imports).length === 0 && this._modulepreloads.length === 0
    }

    toJSON() {
        return { imports: this._imports, modulepreloads: this._modulepreloads }
    }

    static fromJSON(json) {
        return new ImportMap(json.imports, json.modulepreloads)
    }

    withUrlPrefix(prefix) {
        if (!prefix || prefix === '/') return this
        const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
        const rebase = (value) => value?.startsWith('/') ? `${base}${value}` : value
        return new ImportMap(
            Object.fromEntries(Object.entries(this._imports).map(([name, value]) => [name, rebase(value)])),
            this._modulepreloads.map(rebase)
        )
    }

    static build(packages, scriptsBaseUrl, outputPath) {
        const entries = packages
        const imports = {}
        const modulepreloads = []
        const seenPreloads = new Set()

        for (let i = 0; i < entries.length; ++i) {
            const { packageName, bundleAbsolutePath } = entries[i]
            if (!packageName || !bundleAbsolutePath || !outputPath) continue

            const relative = path.relative(outputPath, bundleAbsolutePath)
            if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
                log.w(`Package "${packageName}" bundle is not under the bundler output path; it cannot be served from the scripts route and is omitted from the import map.`)
                continue
            }

            const url = `${scriptsBaseUrl ?? ''}${relative.split(path.sep).join('/')}`
            imports[packageName] = url
            if (!seenPreloads.has(url)) {
                seenPreloads.add(url)
                modulepreloads.push(url)
            }
        }

        return new ImportMap(imports, modulepreloads)
    }

    expandTo(document) {
        if (this.isEmpty) return
        const head = document?.head
        if (!head) return

        const importMapScript = document.createElement('script')
        importMapScript.type = 'importmap'
        importMapScript.textContent = ImportMap.inlineJson({ imports: this._imports })
        const children = head.childNodes
        let inserted = false
        for (let i = 0; i < children.length; ++i) {
            const child = children[i]
            if (child?.tagName && child.tagName.toLowerCase() === 'meta' && child.getAttribute('charset')) {
                head.insertBefore(importMapScript, child.nextSibling)
                inserted = true
                break
            }
        }
        if (!inserted) head.insertBefore(importMapScript, head.firstChild)

        for (const preloadUrl of this._modulepreloads) {
            if (!preloadUrl) 
                continue
            const link = document.createElement('link')
            link.rel = 'modulepreload'
            link.href = preloadUrl
            head.appendChild(link)
        }
    }

    headMarkup() {
        if (this.isEmpty) return ''
        const importMap = ImportMap.inlineJson({ imports: this._imports })
        const links = this._modulepreloads.filter(Boolean).map((href) => `<link rel="modulepreload" href="${href}">`).join('')
        return `<script type="importmap">${importMap}</script>${links}`
    }
}
