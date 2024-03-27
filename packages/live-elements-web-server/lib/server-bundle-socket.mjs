import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { EventEmitter } from 'node:events';

export class ServerBundleSocket extends EventEmitter {
    constructor(app) {
        super();
        this._httpServer = createServer(app)
        this._socketServer = new WebSocketServer({ noServer: true })
        this._actionListeners = {}

        this._socketServer.on('connection', ws => {
            this.emit('connectionOpen', ws);
            ws.on('message', (message) => {
                const e = JSON.parse(message)
                if ( e.action ){
                    if ( this._actionListeners.hasOwnProperty(e.action) ){
                        this._actionListeners[e.action](e.params)
                    } else {
                        this.emit('action', e.action, e.params)
                    }
                } else {
                    this.emit('message', e)
                }
            })
            ws.on('close', () => {
                this.emit('connectionClose', ws);
            });
        });

        this._httpServer.on('upgrade', (request, socket, head) => {
            this._socketServer.handleUpgrade(request, socket, head, ws => {
                this._socketServer.emit('connection', ws, request);
            });
        });
    }

    get clients() { return this._socketServer.clients; }

    onAction(actionName, actionFn){
        this._actionListeners[actionName] = actionFn
    }

    sendToClients(message) {
        this._socketServer.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message)
            }
        })
    }

    sendActionToClients(action, params){
        this.sendToClients(JSON.stringify({ action, params }))
    }

    listen(port, cb) {
        this._httpServer.listen(port, cb);
    }
}
