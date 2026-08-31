import fs from 'node:fs'
import path from 'node:path'

class TxtarFileEntry {
    constructor(name, content = '') {
        this.name = String(name ?? '')
        this.content = String(content ?? '')
    }
}

export default class Txtar {

    static NEWLINE_MARKER = '\n-- '
    static MARKER = '-- '
    static MARKER_END = ' --'

    #entries
    #comment

    constructor(entries = [], comment = '') {
        this.#entries = entries.map((entry) => {
            if (entry instanceof TxtarFileEntry) {
                return entry
            }
            return new TxtarFileEntry(entry.name, entry.content)
        })
        this.#comment = comment
    }

    static parse(text) {
        const data = String(text ?? '')
        const archive = new Txtar()

        let marker = Txtar._findFileMarker(data)
        archive.#comment = marker.before

        while (marker.name !== '') {
            const entry = new TxtarFileEntry(marker.name)
            marker = Txtar._findFileMarker(marker.after ?? '')
            entry.content = marker.before
            archive.#entries.push(entry)
        }

        return archive
    }

    static parseFile(filePath) {
        const text = fs.readFileSync(filePath, 'utf8')
        return Txtar.parse(text)
    }

    static fromDirectory(directoryPath) {
        const root = path.resolve(directoryPath)
        const stats = fs.statSync(root)

        if (!stats.isDirectory()) {
            throw new Error(`Txtar.fromDirectory expects a directory path, got "${directoryPath}".`)
        }

        const entries = []
        Txtar._collectDirectoryEntries(root, root, entries)
        return new Txtar(entries, '')
    }

    get entries() {
        return this.#entries
    }

    get comment() {
        return this.#comment
    }

    set comment(value) {
        this.#comment = String(value ?? '')
    }

    format() {
        let output = Txtar._fixNL(this.#comment)
        for (const entry of this.#entries) {
            output += `-- ${entry.name} --\n`
            output += Txtar._fixNL(entry.content)
        }
        return output
    }

    toString() {
        return this.format()
    }

    extract(directoryPath) {
        const root = path.resolve(directoryPath)
        fs.mkdirSync(root, { recursive: true })

        for (const entry of this.#entries) {
            const relativePath = String(entry.name).replaceAll('\\', '/')
            const targetPath = path.resolve(root, relativePath)

            if (targetPath !== root && !targetPath.startsWith(`${root}${path.sep}`)) {
                throw new Error(`Txtar.extract refused to write outside target directory: "${entry.name}".`)
            }

            fs.mkdirSync(path.dirname(targetPath), { recursive: true })
            fs.writeFileSync(targetPath, entry.content, 'utf8')
        }
    }

    static _collectDirectoryEntries(root, currentPath, entries) {
        const children = fs.readdirSync(currentPath, { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name))

        for (const child of children) {
            const absoluteChildPath = path.join(currentPath, child.name)

            if (child.isDirectory()) {
                Txtar._collectDirectoryEntries(root, absoluteChildPath, entries)
                continue
            }

            if (!child.isFile()) {
                continue
            }

            const relativePath = path.relative(root, absoluteChildPath).split(path.sep).join('/')
            const content = fs.readFileSync(absoluteChildPath, 'utf8')
            entries.push(new TxtarFileEntry(relativePath, content))
        }
    }

    static _findFileMarker(data) {
        let offset = 0
        while (true) {
            const marker = Txtar._isMarker(data.slice(offset))
            if (marker.name !== '') {
                return {
                    before: data.slice(0, offset),
                    name: marker.name,
                    after: marker.after
                }
            }

            const nextLineMarker = data.indexOf(Txtar.NEWLINE_MARKER, offset)
            if (nextLineMarker < 0) {
                return {
                    before: Txtar._fixNL(data),
                    name: '',
                    after: ''
                }
            }

            offset = nextLineMarker + 1
        }
    }

    static _isMarker(data) {
        if (!data.startsWith(Txtar.MARKER)) {
            return { name: '', after: '' }
        }

        let line = data
        let after = ''
        const newlineIndex = data.indexOf('\n')
        if (newlineIndex >= 0) {
            line = data.slice(0, newlineIndex)
            after = data.slice(newlineIndex + 1)
        } else {
            after = ''
        }

        if (!line.endsWith(Txtar.MARKER_END) || line.length <= Txtar.MARKER.length + Txtar.MARKER_END.length) {
            return { name: '', after: '' }
        }

        return {
            name: line.slice(Txtar.MARKER.length, line.length - Txtar.MARKER_END.length),
            after
        }
    }

    static _fixNL(value) {
        if (value === '') {
            return ''
        }
        return value.endsWith('\n') ? value : `${value}\n`
    }
}

Txtar.FileEntry = TxtarFileEntry
