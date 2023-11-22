
export default class ClientBundleSocket{
    constructor(location){
        this.actions = ClientBundleSocket.defaultActions
        this.socket = new WebSocket(location, 'echo-protocol')
        this.socket.addEventListener('message', event => {
            const ed = JSON.parse(event.data)
            if ( ed.action ){
                this.actions[ed.action](...ed.params)
            }
        })
    }
}

ClientBundleSocket.defaultActions = {
    'reload' : () => {
        location.reload()
    },
    'reload-style' : (styles) => {
        const stylePaths = styles.map(s => `/styles/${s}`)
        let links = document.getElementsByTagName("link")
        for (let i = 0; i < links.length; i++) {
            const link = links[i]
            if (link.rel === "stylesheet"){
                const href = link.getAttribute('href') // use getAttribute to not resolve href to full url
                const stylePath = stylePaths.find(s => href.startsWith(s))
                if ( stylePath ){
                    link.href = href.split("?")[0] + "?v=" + new Date().getTime()
                }
            }
        }
    }
};