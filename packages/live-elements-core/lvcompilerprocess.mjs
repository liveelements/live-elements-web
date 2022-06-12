/**
 * Copyright (c) Dinu SV and other contributors.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {exec} from 'child_process'
import * as path from 'path'
import * as url from 'url'
import * as fs from 'fs'

export class LvCompilerProcess{
    constructor(compilerPath){
        var dirPath = path.dirname(url.default.fileURLToPath(import.meta.url))
        this.compilerOptionsPath = dirPath + '/compiler.config.json'
        var fileData = fs.readFileSync(this.compilerOptionsPath, {encoding:'utf8', flag:'r'});
        this.compilerOptions = JSON.parse(fileData)
        this.compilerPath = compilerPath
    }

    packagePath(file){
      var moduleFile = path.dirname(file) + '/live.module.json'
      var fileData = fs.readFileSync(moduleFile, {encoding:'utf8', flag:'r'});
      var fileDataObject = JSON.parse(fileData)

      return path.resolve(path.dirname(file) + '/' + fileDataObject.package)
    }

    run(file, cb){
        exec(this.compilerPath + ' --compile --compile-config-file "' + this.compilerOptionsPath + '" "' + file + '"', (err, stdout, stderr) => {
          if (err) { // node couldn't execute the command
            return;
          }
          var moduleFile = path.dirname(file) + '/live.module.json'
          var fileData = fs.readFileSync(moduleFile, {encoding:'utf8', flag:'r'});
          var fileDataObject = JSON.parse(fileData)

          var packagePath = path.resolve(path.dirname(file) + '/' + fileDataObject.package)
          var packageToPlugin = path.dirname(file).replace(packagePath, '')

          var buildFile = packagePath + '/build' + packageToPlugin + '/' + path.basename(file) + '.' + this.compilerOptions.outputExtension
          cb(buildFile, stderr, stdout)
        });
    }
}
