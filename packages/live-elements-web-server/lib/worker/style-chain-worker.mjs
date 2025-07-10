import { parentPort } from 'worker_threads'
import lvimport from 'live-elements-core/lvimport.mjs'
import CSSError from '../../shared/errors/css-error.mjs'
import WorkerError from '../../shared/errors/worker-error.mjs'
import StandardError from '../../shared/errors/standard-error.mjs'

const loadedComponents = {}

async function getComponent(cpath){
    if ( loadedComponents.hasOwnProperty(cpath) ){
        return loadedComponents[cpath]
    }

    const m = await lvimport(cpath)
    if ( Object.keys(m).length !== 1 ){
        throw new Error(`Expected a single root item for css processor at: ${cpath}`)
    }
    const ciComponent = m[Object.keys(m)[0]]
    loadedComponents[cpath] = ciComponent
    return ciComponent
}

parentPort.on('message', async ({ file, content, destination, chain }) => {
    try{
        const itemsChain = []
        for ( let i = 0; i < chain.length; ++i ){
            const ci = chain[i]
            const ciFile = ci.path
            const ciArgs = ci.args
            const ciTheme = ci.theme
            const ciComponent = await getComponent(ciFile)
        
            itemsChain.push({
                path: ci.file,
                args: ci.args,
                processor: ciComponent.create(ciArgs, ciTheme)
            })
        }

        let result = { content: content }
        for ( let i = 0; i < itemsChain.length; ++i ){
            result = await itemsChain[i].processor.process(file, result.content, destination)
        }
        parentPort.postMessage({ value: { content: result.content, map: result.map ? result.map.toString() : null }});
    } catch ( error ) {
        const sourceError = error.constructor.name === 'CssSyntaxError'
            ? new CSSError(error.message, error.file, error.line, error.column)
            : new StandardError(error.message)
        const traceError = new WorkerError(`Error in worker.`, sourceError)
        parentPort.postMessage({ error: traceError.toJSON() })
    }
})