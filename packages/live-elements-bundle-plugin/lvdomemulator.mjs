/**
 * Copyright (c) Dinu SV and other contributors.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as jsdomModule from 'jsdom'
import * as prettyModule from 'pretty'

export class LvDOMEmulator{

    constructor(opt){
        this.JSDOM = jsdomModule.default.JSDOM
        this.pretty = prettyModule.default
        this.options = opt ? opt : {}
    }

    setup(content){
        this.dom = new this.JSDOM(content);
        global.document = this.dom.window.document
    }

    serialize(){
        if ( !this.dom ){
            throw new Error("DomInterface was not setup before calling serialize.")
        }
        var result = this.dom.serialize()
        return this.options.beautify ? this.pretty(result) : result
    }

    close(){
        if ( !this.dom ){
            throw new Error("DomInterface was not setup before calling close.")
        }
        global.document = undefined
    }

}