/**
 * Copyright (c) Dinu SV and other contributors.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as fs from 'fs'
import * as path from 'path'
import lvimport from 'live-elements-core/lvimport.mjs'

export class LvBundler{
    constructor(domInterface){
        this._domInterface = domInterface
    }

    packagePath(file){
        var moduleFile = path.dirname(file) + '/live.module.json'
        var fileData = fs.readFileSync(moduleFile, {encoding:'utf8', flag:'r'});
        var fileDataObject = JSON.parse(fileData)
  
        return path.resolve(path.dirname(file) + '/' + fileDataObject.package)
      }

    async load(file, callback){
        lvimport(file).then((res) => {
            var keys = Object.keys(res)
            if ( keys.length > 1 ){
                var msg = "Only a single bundle object is expected when using the bundle loader."
                callback(undefined, new Error(msg))
            }
            var bundle = res[keys[0]]
            if ( bundle.constructor.name !== 'Bundle' ){
                var msg = "Only a single bundle object is expected when using the bundle loader."
                callback(undefined, new Error(msg))
            }
            bundle._domInterface = this._domInterface
            callback(bundle)
        }).catch(err => {
            callback(undefined, err)
        })
    }

    generate(file, bundle, options){
        try{
            var packagePath = this.packagePath(file)
            bundle.generatePages({
                onPageReady: (page, pageContent) => {
                    if ( options.onFileReady ){
                        options.onFileReady(page.output, pageContent)
                    }
                },
                onAssetReady: (_type, from, to) => {
                    var fromAbsPath = packagePath + '/' + from
                    if ( options.onFileReady ){
                        var fileData = fs.readFileSync(fromAbsPath)
                        options.onFileReady(to, fileData)
                    }
                }
            })

            if ( options.onReady ){
                var componentName = bundle.application ? bundle.application.name : ''
                var file = bundle.application ? bundle.application.resourceUrl() : ''
                options.onReady(file, componentName)
            }

        } catch (e){
            if ( options && options.onError ){
                options.onError(e)
            }
        }
    }

    run(file, options){
        this.load(file, (bundle, err) => {
            if ( err ){
                if ( options && options.onError ){
                    options.onError(err.error ? err.error : err)
                }
                return
            }
            this.generate(file, bundle, options)
        })
    }
}
