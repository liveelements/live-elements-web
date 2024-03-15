import { BaseElement } from "live-elements-core/baseelement.js"

export default class ClientPageViewLoader{

    static async loadAwaitingModule(awaitingModule, componentName, placements, serverData){
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
            let c = null
            if ( componentName === "*" ){    
                for (let [_key, value] of Object.entries(module)) {
                    let prototype = Object.getPrototypeOf(value)
                    while (prototype != null) {
                        if ( prototype.name === 'PageView' )
                            break
                        prototype = Object.getPrototypeOf(prototype)
                    }
                    if ( prototype ){
                        c = value
                        break
                    }
                }
            } else {
                c = module[componentName]
            }
            if ( !c ){
                throw new Error(`Failed to find PageView component.`)
            }

            const result = ClientPageViewLoader.__populateScopedStyles(serverData.scopedStyles, c, serverData.scopedStyleAssertionSupport)
            if ( !result.value ){
                if ( serverData.scopedStyleAssertionSupport && window.clientBundleSocket ){
                    const usages = ClientPageViewLoader.__usagesToObject(c)
                    window.clientBundleSocket.sendActionToServer('update-use', usages)
                    window.clientBundleSocket.onAction('reload-use', (serverData) => {
                        const result = ClientPageViewLoader.__populateScopedStyles(serverData.scopedStyles, c, true)
                        if ( !result.value ){
                            throw new Error(result.error)
                        }
                        console.info("Scoped styles reloaded.", serverData)
                    })
                    console.warn(`Error while loading scoped styles '${result.error}, attempting to reload styles...`)
                } else {
                    throw new Error(result.error)
                }
            }

            window.pageView = window.__serverData__ ? new c(window.__serverData__) : new c()
            BaseElement.complete(window.pageView)

            if ( window.pageView.head )
                window.pageView.head.expand()

            if ( expandLocation ){
                expandLocation.children = [window.pageView]
            } else {
                window.pageView.expandTo(renderLocaiton)
            }

            if ( serverData.scopedStyleLinks  ){
                serverData.scopedStyleLinks.forEach(sl => {
                    var link = document.createElement('link');
                    link.rel = 'stylesheet'
                    link.type = 'text/css'
                    link.href = sl
                    document.head.appendChild(link)
                })
            }

        }).catch((e) => {
            console.error("Failed to load module:", e)
        })
    }

    static __usagesToObject(c){
        return { 
            type: 'component', 
            path: `${c.Meta.module}.${c.name}`, 
            file: `${c.Meta.sourceFileName}`,
            use: c.use ? c.use.map(u => {
                if ( typeof u === 'function' && u.name ){
                    return ClientPageViewLoader.__usagesToObject(u)
                } else if ( u.constructor && u.constructor.name === 'ScopedStyle' ){
                    return { type: 'ScopedStyle', src: u.src, process: u.process }
                }
                return null
            }) : null
        }
    }

    static __populateScopedStyles(scopedStyles, c, assertionSupport){
        if ( scopedStyles ){
            if ( assertionSupport ){
                if ( scopedStyles.renderProperties.name !== c.name ){
                    return { value: undefined, error: `${scopedStyles.renderProperties.name} !== ${c.name}` }
                }
            }
            c.renderProperties = scopedStyles.renderProperties
        } else { 
            return { value: undefined, error: `Undefined style for ${c.name}` }
        }
        if ( c.use ){
            for ( let i = 0; i < c.use.length && i < scopedStyles.use.length; ++i ){
                if ( typeof c.use[i] === 'function' && c.use[i].name ){
                    const result = ClientPageViewLoader.__populateScopedStyles(scopedStyles.use[i], c.use[i], assertionSupport)
                    if ( !result.value )
                        return result
                }
            }
        }
        return { value: true }
    }

}
