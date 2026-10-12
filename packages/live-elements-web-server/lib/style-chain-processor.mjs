import lvimport from "live-elements-core/lvimport.mjs"
import { Worker } from 'worker_threads'
import {errors} from "../shared/errors/errors.mjs"
import path from 'path'
import url from 'url'
import {WorkerError} from "../shared/errors/worker-error.mjs"

let currentWorker = null
let lastTaskId = 0

export default class StyleChainProcessor{
    
    constructor(items){
        this._items = items
    }

    static terminateWorkers(){
        if ( currentWorker ){
            currentWorker.terminate()
            currentWorker = null
        }
    }

    /**
     * Starts the shared style worker. Replies carry the request id, since packages compile their
     * styles concurrently and the worker answers out of order.
     */
    static __startWorker(){
        const workerPath = path.join(StyleChainProcessor.currentDir(), 'worker', 'style-chain-worker.mjs')
        const worker = new Worker(workerPath, { workerData: null })
        worker.taskCount = 0
        worker.pending = new Map()

        worker.on('message', ({ id, value, error }) => {
            const task = worker.pending.get(id)
            if ( !task )
                return
            worker.pending.delete(id)
            if ( error ){
                const we = WorkerError.fromJSON(error, errors)
                task.reject(we instanceof WorkerError ? we.source : we)
            } else {
                task.resolve(value)
            }
            if ( worker !== currentWorker && worker.pending.size === 0 )
                worker.terminate()
        })
        worker.on('error', (error) => {
            for ( const task of worker.pending.values() )
                task.reject(error)
            worker.pending.clear()
            if ( currentWorker === worker )
                currentWorker = null
        })
        worker.once('exit', (code) => {
            for ( const task of worker.pending.values() )
                task.reject(new Error(`Worker stopped with exit code ${code}`))
            worker.pending.clear()
            if ( currentWorker === worker )
                currentWorker = null
        })
        return worker
    }

    static currentDir(){ 
        return path.dirname(url.fileURLToPath(import.meta.url)) 
    }

    static async create(chain){
        const itemsChain = []
        for ( let i = 0; i < chain.length; ++i ){
            const ci = chain[i]
            const ciFile = ci.file
            const ciArgs = ci.args
            const ciTheme = ci.theme

            const ciComponent = StyleChainProcessor.Components.hasOwnProperty(ciFile)
                ? StyleChainProcessor.Components[ciFile]
                : await StyleChainProcessor.__importComponent(ciFile)
    
            itemsChain.push({
                path: ci.file,
                args: ci.args,
                theme: ciTheme,
                processor: ciComponent.create(ciArgs, ciTheme)
            })
        }
        return new StyleChainProcessor(itemsChain)
    }

    async processInCurrentContext(file, content, destination){
        let result = { content: content }
        for ( let i = 0; i < this._items.length; ++i ){
            result = await this._items[i].processor.process(file, result.content, destination)
        }
        return result
    }

    processInWorker(file, content, destination){
        return new Promise((resolve, reject) => {
            if ( currentWorker && currentWorker.taskCount >= StyleChainProcessor.MaxWorkerTaskCount ){
                // Retire the worker; it terminates after answering the tasks it still holds.
                const retired = currentWorker
                currentWorker = null
                if ( retired.pending.size === 0 )
                    retired.terminate()
            }
            if ( !currentWorker ){
                currentWorker = StyleChainProcessor.__startWorker()
            }
            const worker = currentWorker
            const id = ++lastTaskId
            worker.taskCount++
            worker.pending.set(id, { resolve, reject })
            worker.postMessage({ id, file, content, destination, chain: this._items.map(item => ({ path: item.path, args: item.args, theme: item.theme })) })
        })
    }

    process(file, content, destination){
        // return this.processInCurrentContext(file, content, destination)
        return this.processInWorker(file, content, destination)
    }

    static async __importComponent(cpath){
        const m = await lvimport(cpath)
        if ( Object.keys(m).length !== 1 ){
            throw new Error(`Expected a single root item for css processor at: ${cpath}`)
        }
        const c = m[Object.keys(m)[0]]
        StyleChainProcessor.Components[cpath] = c
        return c
    }
}

StyleChainProcessor.Components = {}
StyleChainProcessor.MaxWorkerTaskCount = 30