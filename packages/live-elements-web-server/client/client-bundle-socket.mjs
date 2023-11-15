
export default class ClientBundleSocket{
    constructor(location){
        this.actions = ClientBundleSocket.defaultActions
        this.socket = new WebSocket(location, 'echo-protocol')
        this.socket.addEventListener('message', event => {
            const ed = JSON.parse(event.data)
            if ( ed.action ){
                this.actions[ed.action]()
            }
        })
    }
}

ClientBundleSocket.defaultActions = {
    'reload' : () => {
        location.reload()
    },
    'reload-style' : (style) => {
        var links = document.getElementsByTagName("link");
        for (var i = 0; i < links.length; i++) {
            var link = links[i];
            if (link.rel === "stylesheet") {
                // Get the current href
                var href = link.href;
                href = href.split("?")[0]
                href += "?v=" + new Date().getTime()
                link.href = href
            }
        }
    }
};