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
        let lvcompilerm = await import('live-elements-js-compiler')
        let lvcompilerconfigm = await import('live-elements-core/compilerconfig.mjs')

        lvcompilerm.default.compile(this.resourcePath, lvcompilerconfigm.read(), (resultFile, err) => {
            if ( resultFile ){
                let mainPath = resultFile
                let relative = path.relative(path.dirname(this.resourcePath), mainPath)
                if ( process.platform === "win32" )
                    relative = relative.split(path.sep).join(path.posix.sep);
                if ( !relative.startsWith('.') ){
                    relative = './' + relative
                }

                callback(undefined, "export * from '" + relative + "'")
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
                callback(new Error("Internal compiler error: Undefined compilation result: " + this.resourcePath + ")."))
        })
    }.bind(this))()
}