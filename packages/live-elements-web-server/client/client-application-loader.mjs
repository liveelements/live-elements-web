import { BaseElement } from "live-elements-core/baseelement.js"

export default class ClientApplicationLoader{
    static loadAwaitingModuleAndReport(awaitingModule, componentName){
        awaitingModule.then(module => {
            const c = module[componentName]
            window.pageApplication = new c()
            BaseElement.complete(window.pageApplication)
        }).catch((e) => {
            console.error("Failed to load module:", e)
        })
    }
}
