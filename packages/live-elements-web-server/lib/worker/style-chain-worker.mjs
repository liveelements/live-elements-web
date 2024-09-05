import { parentPort } from 'worker_threads'
import lvimport from 'live-elements-core/lvimport.mjs'

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
            const ciComponent = await getComponent(ciFile)
        
            itemsChain.push({
                path: ci.file,
                args: ci.args,
                processor: ciComponent.create(ciArgs)
            })
        }

        let result = { content: content }
        for ( let i = 0; i < itemsChain.length; ++i ){
            result = await itemsChain[i].processor.process(file, result.content, destination)
        }
        parentPort.postMessage({ value: { content: result.content, map: result.map ? result.map.toString() : null }});
    } catch ( error ) {
        console.error(error)
        parentPort.postMessage({ error: error.message })
    }
})