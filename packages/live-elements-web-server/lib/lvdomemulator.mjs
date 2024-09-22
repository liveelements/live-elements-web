/**
 * Copyright (c) Dinu SV and other contributors.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as jsdomModule from 'jsdom'
import * as prettyModule from 'pretty'
import { parseHTML } from 'linkedom'

export default class LvDOMEmulator{

    constructor(opt){
        this.JSDOM = jsdomModule.default.JSDOM
        this.pretty = prettyModule.default
        this.options = opt ? opt : {}
    }

    setup(content){
        return parseHTML(content)
        // return new this.JSDOM(content)
    }

    serializeDOM(dom){
        const result = `<!DOCTYPE html>\n${dom.document.documentElement.outerHTML}`
        // const result = dom.serialize()
        return this.options.beautify ? this.pretty(result) : result
    }

    serialize(){
        if ( !this.dom ){
            throw new Error("DomInterface was not setup before calling serialize.")
        }
        return this.serializeDOM(this.dom)
    }

}