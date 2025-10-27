/**
 * Copyright (c) Dinu SV and other contributors.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class EventConnection{
    constructor(emitterObject, eventName, observerObject, observerCall){
        this.emitterObject = emitterObject
        this.eventName = eventName
        this.observerObject = observerObject
        this.__call = observerCall
    }
}

export class BaseElement{

    constructor(){
        this.id = ''
        this.parent = null
        Object.defineProperty(this, '__lv', { enumerable: false, value: {} })
    }

    setParent(parent){
        this.parent = parent
    }

    on(eventName, fn){
        try{
            var eventConnection = new EventConnection(this, eventName, null, fn)
            this[eventName].listeners.push(eventConnection)
        } catch ( e ){
            if ( !this.hasOwnProperty('eventName') ){
                throw new Error("Failed to find event: " + eventName)
            } else 
                throw e
        }
    }

    completed(){}

    release(){
        //TODO: close all events this object is listening to, and destroy its html if any
    }

    findId(id){
        let p = this
        while ( p && !p.ids ){
            p = p.parent
        }
        if ( p && p.ids.hasOwnProperty(id) ){
            return p.ids[id]
        }
        return null
    }

    static complete(element){
        element.completed()
    }

    static assignChildren(element, children){
        const propertyName = element.__lv.__default__
        element[propertyName] = children
    }

    static assignChildrenAndComplete(element, children){
        BaseElement.assignChildren(element, children)
        BaseElement.complete(element)
    }

    static assignId(element, newId){
        element.id = newId
    }

    static propertyNames(element){
        let keys = []
        for (let [key, _value] of Object.entries(element.__lv)) {
            if ( key !== '__default__' )
                keys.push(key)
        }
        return keys
    }

    static getProperty(obj, name){
        return obj.__lv[name].value
    }

    static setProperty(obj, name, newValue){
        const pm = obj.__lv[name]
        pm.value = newValue
    }

    static addProperty(element, propertyName, options){
        const propMeta = {
            expression: undefined,
            bindings: [], // events this property listens to
            value: ('value' in options ? options['value'] : undefined)
        }

        if ('notify' in options){
            propMeta['event'] = BaseElement.addEvent(element, options['notify'], [])
        }

        const isWritable = 'isWritable' in options ? options['isWritable'] : true
        const isDefault = 'type' in options && options['type'] === 'default'

        element.__lv[propertyName] = propMeta

        if ( isDefault ){
            element.__lv.__default__ = propertyName
        }

        if ( 'set' in options ){
            propMeta.setter = options['set'].bind(element)
        }

        Object.defineProperty(element, propertyName, {
            get: 'get' in options ? options['get'] : function(){ return this.__lv[propertyName].value },
            set: propMeta.setter
                ? function(newValue){ 
                    const pm = this.__lv[propertyName]
                    if ( pm.value !== newValue ){
                        if ( pm.bindings ){
                            for ( var i = 0; i < pm.bindings.length; ++i ){
                                BaseElement.disconnect(pm.bindings[i])
                            }
                            pm.bindings = []
                        }
                        pm.setter(newValue)
                        if ( pm.event ){
                            pm.event.emit()
                        }
                    } else {
                        pm.setter(newValue)
                    }
                }
                : function(newValue){
                    const pm = this.__lv[propertyName]
                    if ( pm.value !== newValue ){
                        if ( pm.bindings ){
                            for ( var i = 0; i < pm.bindings.length; ++i ){
                                BaseElement.disconnect(pm.bindings[i])
                            }
                            pm.bindings = []
                        }

                        if ( isDefault ){
                            if ( pm.value && pm.value.constructor === Array ){
                                for ( var i = 0; i < pm.value.length; ++i ){
                                    pm.value[i].parent = null
                                }
                            }
                            if ( newValue.constructor === Array){
                                for ( var i = 0; i < newValue.length; ++i ){
                                    newValue[i].parent = this
                                }
                            }
                        }

                        pm.value = newValue
                        if ( pm.event ){
                            pm.event.emit()
                        }
                    }
                },
            enumerable: true,
            isWritable: isWritable
        })
    }

    static addEvent(element, eventName, args){
        const eventMeta = {
            listeners: []
        }
        eventMeta['emit'] = function(){
            for( var i = 0; i < this.listeners.length; ++i ){
                this.listeners[i].__call.apply(null, arguments)
            }
        }.bind(eventMeta)

        Object.defineProperty(element, eventName, { enumerable: false, value: eventMeta })
        return eventMeta
    }

    static disconnect(eventConnection){
        const index = eventConnection.emitterObject[eventConnection.eventName].listeners.indexOf(eventConnection)
        if ( index !== -1 ){
            eventConnection.emitterObject[eventConnection.eventName].listeners.splice(index, 1)
        }
    }

    static __debugEventBindings(eventBindings, indent, objectIds){
        objectIds = objectIds || []
        indent = indent || ''
        let s = ''
        for ( let i = 0; i < eventBindings.length; ++i ){
            var propName = eventBindings[i].eventName
            propName = propName.substr(0, propName.lastIndexOf('Changed'))

            let objectId = 0
            const objectIdIndex = objectIds.indexOf(eventBindings[i].emitterObject)        
            if ( objectIdIndex !== -1 ){
                objectId = objectIdIndex
            } else {
                objectId = objectIds.length
                objectIds.push(eventBindings[i].emitterObject)
            }
            s += indent + eventBindings[i].emitterObject.constructor.name + '#' + objectId + '.' + propName + '\n'
            if ( eventBindings[i].childEvents ){
                s += BaseElement.__debugEventBindings(eventBindings[i].childEvents, indent + '  ', objectIds)
            }
        }
        return s
    }

    // for [element, ['z', 'a', 'b']] if z changes: [element.z, 'a', 'b']
    static __createBindingFormat(connection){
        const propName = connection.eventName.substr(0, connection.eventName.lastIndexOf('Changed'))
        const element = connection.emitterObject[propName]
        const result = [element]
        if ( connection.childEvents ){
            for ( var i = 0; i < connection.childEvents.length; ++i ){
                result.push(BaseElement.__createBindingFormatRecurse(element, connection.childEvents[i]))
            }
        }
        return result
    }

    static __createBindingFormatRecurse(element, connection){
        const propName = connection.eventName.substr(0, connection.eventName.lastIndexOf('Changed'))
        let nextElement = element[propName]
        if ( connection.childEvents ){
            const result = [propName]
            for ( var i = 0; i < connection.childEvents.length; ++i ){
                result.push(BaseElement.__createBindingFormatRecurse(nextElement, connection.childEvents[i]))
            }
            return result
        } else {
            return propName
        }
    }

    static __collectAllChildEventsFlat(bindingConnection, res){
        for ( var j = 0; j < bindingConnection.length; ++j ){
            res.push(bindingConnection[j])
            if ( bindingConnection[j].childEvents ){
                BaseElement.__collectAllChildEventsFlat(bindingConnection[j].childEvents, res)
            }
        }
    }

    static __createEventBindings(bindings, element, cb, nestCb){
        var result = []
        for ( var i = 0; i < bindings.length; ++i ){
            var r = BaseElement.__createEventBindingsRecurse(bindings[i], element, bindings[i][0], cb, nestCb)
            for ( var j = 0; j < r.length; ++j ){
                result.push(r[j])
            }
            for ( var j = 0; j < r.length; ++j ){
                if ( r[j].childEvents )
                   BaseElement.__collectAllChildEventsFlat(r[j].childEvents, result)
            }
        }
        return result
    }

    // Example: can receive: [element, ['z', 'a', 'b']], and ['z', 'a', 'b'] after
    static __createEventBindingsRecurse(bindings, mainElement, bindingElement, cb, nestCb){
        let result = []
        if ( !bindingElement )
            return result
        if ( !(bindingElement instanceof BaseElement) )
            return result
        for ( let i = 1; i < bindings.length; ++i ){ // itereate only properties
            let bind = bindings[i]
            if ( bind instanceof Array ){
                let nextElement = bindingElement[bind[0]]
                const connection = new EventConnection(bindingElement, bind[0] + 'Changed', mainElement, null)
                connection.basicCallback = cb
                connection.nestedCallback = nestCb
                connection.__call = nestCb.bind(connection)
                connection.childEvents = BaseElement.__createEventBindingsRecurse(bind, mainElement, nextElement, cb, nestCb)
                connection.childEventsTemplate = [null].concat(bind.slice(1))
                result.push(connection)
            } else {
                const connection = new EventConnection(bindingElement, bind + 'Changed', mainElement, cb)
                result.push(connection)
            }
        }
        return result
    }

    static propertyBindingsInfo(element, propertyName){
        return BaseElement.__debugEventBindings(element.__lv[propertyName].bindings)
    }

    static assignPropertyExpression(element, propertyName, propertyExpression, bindings){
        const propMeta = element.__lv[propertyName]
        propMeta['expression'] = propertyExpression.bind(element)

        const previousBindings = propMeta['bindings']

        for ( let i = 0; i < previousBindings.length; ++i ){
            BaseElement.disconnect(previousBindings[i])
        }

        const bindingEvents = BaseElement.__createEventBindings(
            bindings, 
            element, 
            function(){
                if ( propMeta.setter )
                    propMeta.setter(propMeta['expression']())
                else
                    propMeta.value = propMeta['expression']()
                propMeta.event.emit()
            }, 
            function(){
                const bindingFormat = this.childEventsTemplate

                // reset all child events
                const allChildEvents = []
                BaseElement.__collectAllChildEventsFlat(this.childEvents, allChildEvents)
                for ( let i = 0; i < allChildEvents.length; ++i ){
                    BaseElement.disconnect(allChildEvents[i])
                    const index = propMeta['bindings'].indexOf(allChildEvents[i])
                    propMeta['bindings'].splice(index, 1)
                }
                this.childEvents = []

                // reconfigure the events based on binding format
                const propName = this.eventName.substr(0, this.eventName.lastIndexOf('Changed'))
                this.childEvents = BaseElement.__createEventBindingsRecurse(bindingFormat, element, this.emitterObject[propName], this.basicCallback, this.nestedCallback )
                
                // add new events to property bindings
                let newChildEvents = []
                BaseElement.__collectAllChildEventsFlat(this.childEvents, newChildEvents)

                for ( let i = 0; i < newChildEvents.length; ++i ){
                    const conn = newChildEvents[i]
                    propMeta['bindings'].push(conn)
                    conn.emitterObject[conn.eventName].listeners.push(conn)
                }

                propMeta.value = propMeta['expression']()
                propMeta.event.emit()
            }
        )

        for ( let i = 0; i < bindingEvents.length; ++i ){
            const conn = bindingEvents[i]
            if ( !(conn.eventName in conn.emitterObject) ){
                throw new Error("Failed to find event \'" + conn.eventName + "\' in object of type \'" +  conn.emitterObject.constructor.name + "\'")
            }
            conn.emitterObject[conn.eventName].listeners.push(conn)
        }
        propMeta['bindings'] = bindingEvents
        propMeta.value = propMeta['expression']()
        if ( propMeta.event ){
            propMeta.event.emit()
        }
    }

}