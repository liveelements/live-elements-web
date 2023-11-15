import { BaseElement } from "live-elements-core/baseelement.js"

export default class ClientPageViewLoader{
    static async loadAwaitingModule(awaitingModule, componentName, placements){
        const locations = document.querySelectorAll('[data-content-type="main"]')
        if ( locations.length === 0 ){
            throw new Error("Failed to find insertion location.")
        }
        const renderLocaiton = locations[0]

        let pagePlacements = await Promise.all(placements.map(async (placement) => {
            const module = await placement.module
            const c = module[placement.name]
            const pagePlacement = new c()
            pagePlacement.renderProperties = { url: window.location.pathname }
            BaseElement.complete(pagePlacement)
            return pagePlacement
        }))

        let expandLocation = null
        if ( pagePlacements.length ){
            pagePlacements.forEach(l => { if ( l.head ) l.head.expand() })
            expandLocation = pagePlacements[0].render
            for ( let i = 1; i < pagePlacements.length; ++i ){
                expandLocation.children = [pagePlacements[i]]
                expandLocation = pagePlacements[i].render
            }
            pagePlacements[0].children[0].expandTo(renderLocaiton)
        }

        awaitingModule.then(module => {
            const c = module[componentName]
            window.pageView = new c()
            BaseElement.complete(window.pageView)

            if ( window.pageView.head )
                window.pageView.head.expand()

            if ( expandLocation ){
                expandLocation.children = [window.pageView]
            } else {
                window.pageView.expandTo(renderLocaiton)
            }
        }).catch((e) => {
            console.error("Failed to load module:", e)
        })
    }
}
