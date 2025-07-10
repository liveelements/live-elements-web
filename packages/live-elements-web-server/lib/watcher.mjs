import chokidar from 'chokidar'
import { globSync } from 'glob'

export class WatcherGroup {
    constructor(name) {
        this.name = name
        this.onFileChange = null
    }

    fileChanged(file) {
        if (this.onFileChange) {
            this.onFileChange(file)
        }
    }
}

export class Watcher{
    constructor() {
        this.files = {}
        this.groups = new Set()
        this.watcher = chokidar.watch([], {
            ignored: '**/node_modules/**',
            persistent: true,
            awaitWriteFinish: { stabilityThreshold: 500 }
        })
        this.watcher.on('change', (changedFile) => {
            const group = this.files[changedFile];
            if (group) {
                group.fileChanged(changedFile);
            }
        })
    }

    findGroup(name){
        for (const item of this.groups) {
            if (item.name === name) {
              return item
            }
        }
        return null
    }

    addGroup(group) {
        if (!(group instanceof WatcherGroup)) {
            throw new Error('Provided group must be an instance of WatcherGroup.');
        }
        this.groups.add(group)
    }

    assignFiles(files, group) {
        for (let file of files) {
            this.files[file] = group;
        }
        this.watcher.add(files);
    }

    static scanPackage(dir, pattern){
        return globSync('**/' + pattern, { 
            cwd: dir,
            absolute: true,
            ignore: '**/node_modules/**' 
        })
    }

    static createFromGroups(groupNames){
        const watcher = new Watcher()
        const groups = groupNames.map(g => new WatcherGroup(g))
        for ( let i = 0; i < groups.length; ++i )
            watcher.addGroup(groups[i])
        return watcher
    }

    close(){
        this.watcher.close()
    }

    unwatchFile(file) {
        this.watcher.unwatch(file);
        delete this.files[file];
    }
}