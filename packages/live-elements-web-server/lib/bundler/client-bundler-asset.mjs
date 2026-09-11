import { createHash } from 'node:crypto'
import path from 'node:path'

/** One emitted output file. produced by a run, read by everything downstream. */
export class ClientBundlerAsset {
    constructor(outputName, assetPath, content, entryName = null, isSyncedToDisk = false) {
        if (typeof assetPath !== 'string' || !path.isAbsolute(assetPath)) {
            throw new TypeError('ClientBundlerAsset: path must be absolute.')
        }
        if (typeof content !== 'string') {
            throw new TypeError('ClientBundlerAsset: content must be a string.')
        }

        this.outputName = outputName
        this.path = assetPath
        this.content = content
        this.entryName = entryName
        this.isSyncedToDisk = isSyncedToDisk
        Object.freeze(this)
    }

    /** Content that already exists on disk at `path` — read back, not built. */
    static createFromDisk(outputName, assetPath, content, entryName = null) {
        return new ClientBundlerAsset(outputName, assetPath, content, entryName, true)
    }

    get isMainEntry() { return this.entryName !== null }
    get size() { return Buffer.byteLength(this.content) }
    get versionTag() { return createHash('sha1').update(this.content).digest('hex') }

    relativeTo(dir) {
        return path.relative(dir, this.path)
    }
}
