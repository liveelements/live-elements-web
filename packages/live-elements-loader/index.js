/**
 * Copyright (c) Dinu SV and other contributors.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

var path = require("path")

module.exports = function (_source){

    const callback = this.async();

    (async function run(){
        var lvcompilerm = await import('live-elements-js-compiler')
        var lvcompilerconfigm = await import('live-elements-core/compilerconfig.mjs')

        lvcompilerm.default.compile(this.resourcePath, lvcompilerconfigm.read(), (resultFile, err) => {
            if ( resultFile ){
                var mainPath = resultFile
                var relative = path.relative(path.dirname(this.resourcePath), mainPath)
                callback(undefined, "import '" + relative + "'")
            } else if ( err ){
                if ( err instanceof Error ){
                    callback(err)
                } else if ( err.error ){
                    if ( err.source ){
                        err.error.source = err.source
                        err.error.message += ' At file ' + err.error.source.file + ':' + err.error.source.line + ':' + err.error.source.column
                    }
                    callback(err.error)
                } else {
                    callback(err)
                }
            } else
                callback(new Error("Internal compiler error: Undefined result."))
        })
    }.bind(this))()
}