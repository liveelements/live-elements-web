/**
 * Copyright (c) Dinu SV and other contributors.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import lvjsimport from './lvjsimport.mjs'
import * as compiler from 'live-elements-js-compiler'
import * as compilerConfig from './compilerconfig.mjs'

export default function(path){
    return new Promise((resolve, reject) => {
        compiler.default.compile(path, compilerConfig.read(), (result, err) => {    
            if ( result )
                lvjsimport(result).then(res => resolve(res)).catch( err => reject(err) )
            else if ( err ){
                if ( err instanceof Error ){
                    reject(err)
                } else if ( err.error ){
                    if ( err.source ){
                        err.error.source = err.source
                        err.error.message += ' At file ' + err.error.source.file + ':' + err.error.source.line + ':' + err.error.source.column
                    }
                    reject(err.error)
                } else {
                    reject(err)
                }
            } else
                reject(new Error("Internal lvimport error at path: " + path))
        })
    })
}