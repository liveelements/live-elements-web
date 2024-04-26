import lvimport from "live-elements-core/lvimport.mjs"
import path from 'path'
import url from 'url'

export default class ScopedStyleProcess{
    static processFunction(style){
        return style.resolved.process
            ? lvimport(style.resolved.process).then(m => m.CSSProcessor.create()) 
            : Promise.resolve(null) 
    }

    static async loadScopedProcessor(){
        if ( !ScopedStyleProcess.ScopedProcessor ){
            const currentDir = path.dirname(url.fileURLToPath(import.meta.url)) 
            ScopedStyleProcess.ScopedProcessor = (await lvimport(path.resolve(path.join(currentDir, '..', 'style', 'processors', 'private', 'ScopedCSS.lv')))).ScopedCSS
        }
        return ScopedStyleProcess.ScopedProcessor
    }

}

ScopedStyleProcess.ScopedProcessor = null