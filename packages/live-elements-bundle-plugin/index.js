/**
 * Copyright (c) Dinu SV and other contributors.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

var process = require('process')
var path = require('path')
var fs = require('fs')
var childProcess = require('child_process')
const {Worker} = require('worker_threads')
const {sources: {RawSource}} = require('webpack');
const { exit } = require('process')
// Importing the compiler is required before importing inside the worker. Doing it the other way around
// causes an error. 
const _compiler = require('live-elements-js-compiler')

module.exports = class LiveElementsBundlePlugin{

  constructor ({bundle, beautifyHtml, verbose, output, onAssetsAdded} = {}){
    this.name = 'LiveElementsBundlePlugin'
    this.verbose = !!verbose
    this.filesAlreadyAdded = false
    this.generateAssets = this.generateAssets.bind(this)
    this.output = output
    this.onAssetsAdded = onAssetsAdded

    if ( !bundle ){
      throw new Error("Bundle option is required.")
    }
    if ( !path.isAbsolute(bundle) ){
      throw new Error("Path to bundle file needs to be absolute: " + bundle)
    }

    this.bundle = bundle
    this.beautifyHtml = beautifyHtml ? true : false
  }

  generateAssets(callback){
    const worker = new Worker(__dirname + "/bundleworker.js", {workerData: {file: this.bundle, beautify: this.beautifyHtml}});

    var res = {}
    worker.once("message", result => { res = result });
    worker.on("error", error => { callback(undefined, error) });
    worker.on("exit", _exitCode => { callback(res, undefined) })
  }

  walk(dir){
    var results = [];
    var list = fs.readdirSync(dir)
    list.forEach( file => {
        file = path.join(dir, file)
        var stat = fs.statSync(file)
        if (stat && stat.isDirectory()){
            results = results.concat(this.walk(file));
        } else {
            results.push(file);
        }
    });
    return results;
  }

  findFilesToWatch(){
    return this.walk(process.cwd()).filter(f => path.extname(f) === '.lv')
  }

  apply(compiler){
    compiler.hooks.afterCompile.tapAsync(this.name, (compilation, callback) => {
      var files = this.findFilesToWatch()
      if (Array.isArray(compilation.fileDependencies)) {
        files.map(file => compilation.fileDependencies.push(file))
      } else {
        files.map(file => compilation.fileDependencies.add(file))
      }
      callback()
    })

    compiler.hooks.run.tapAsync(this.name, (_params, callback) => {
      this.generateAssets((assetResult, err) => {
        if ( err ){
          callback(err)
        } else {
          this.assets = assetResult.assets
          callback()
        }
      })
    })

    compiler.hooks.watchRun.tapAsync(this.name, (comp, callback) => {
      var modifiedlvMjsFiles = false
      if (comp.modifiedFiles) {
        modifiedlvMjsFiles = true
        for (let modifiedFile of comp.modifiedFiles) {
          if ( !modifiedFile.endsWith('.lv.mjs') ){
            modifiedlvMjsFiles = false;
          }
        }
      }
      if ( !modifiedlvMjsFiles ){
        this.generateAssets((assetResult, err) => {
          if ( err ){
            callback(err)
          } else {
            this.assets = assetResult.assets
            callback()
          }
        })
      } else {
        callback()
      }
    });

    compiler.hooks.thisCompilation.tap(this.name, (compilation) => {
      compilation.hooks.additionalAssets.tapAsync(this.name, (callback) => {
        if ( this.assets ){
          for ( var i = 0; i < this.assets.length; ++i ){
            if ( this.assets[i].content ){
              compilation.emitAsset(this.assets[i].path, new RawSource(Buffer.from(this.assets[i].content)))
            } else {
              var content = fs.readFileSync(this.assets[i].out)
              compilation.emitAsset(this.assets[i].path, new RawSource(Buffer.from(content)))
            }
          }
        }
        callback()
      });
    })
  }
}