import lvimport from "live-elements-core/lvimport.mjs"
import { Worker } from 'worker_threads'
import errors from "../shared/errors/errors.mjs"
import path from 'path'
import url from 'url'
import WorkerError from "../shared/errors/worker-error.mjs"

let currentWorker = null

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

    static currentDir(){ 
        return path.dirname(url.fileURLToPath(import.meta.url)) 
    }

    static async create(chain){
        const itemsChain = []
        for ( let i = 0; i < chain.length; ++i ){
            const ci = chain[i]
            const ciFile = ci.file
            const ciArgs = ci.args

            const ciComponent = StyleChainProcessor.Components.hasOwnProperty(ciFile)
                ? StyleChainProcessor.Components[ciFile]
                : await StyleChainProcessor.__importComponent(ciFile)
    
            itemsChain.push({
                path: ci.file,
                args: ci.args,
                processor: ciComponent.create(ciArgs)
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
            const workerPath = path.join(StyleChainProcessor.currentDir(), 'worker', 'style-chain-worker.mjs')
            if ( currentWorker && currentWorker.taskCount >= StyleChainProcessor.MaxWorkerTaskCount ){
                currentWorker.terminate()
                currentWorker = null
            }
            if ( !currentWorker ){
                currentWorker = new Worker(workerPath, { workerData: null })
                currentWorker.taskCount = 0
                currentWorker.once('exit', (code) => {
                    if (code !== 0) {
                        reject(new Error(`Worker stopped with exit code ${code}`));
                    }
                })
            }
            currentWorker.taskCount++
            currentWorker.postMessage( { file, content, destination, chain: this._items.map(item => ({ path: item.path, args: item.args })) } )

            const messageListener = (result) => { 
                if (result.error) {
                    const we = WorkerError.fromJSON(result.error, errors)
                    const errorToSend = we instanceof WorkerError ? we.source : we
                    reject(errorToSend);
                } else {
                    resolve(result.value);
                }
                if ( currentWorker ){
                    currentWorker.off('message', messageListener)
                    currentWorker.off('error', errorListener)
                }
            }

            const errorListener = (error) => {
                reject(error)
                if ( currentWorker ){
                    currentWorker.off('message', messageListener)
                    currentWorker.off('error', errorListener)
                }
            }


            currentWorker.once('message', messageListener)
            currentWorker.once('error', errorListener)
            

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