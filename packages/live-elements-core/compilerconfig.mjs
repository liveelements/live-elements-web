/**
 * Copyright (c) Dinu SV and other contributors.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as path from 'path'
import * as fs from 'fs'
import * as url from 'url'

export function read(){
    var dirPath = path.dirname(url.default.fileURLToPath(import.meta.url))
    var compilerOptionsPath = dirPath + '/compiler.config.json'
    var fileData = fs.readFileSync(compilerOptionsPath, {encoding:'utf8', flag:'r'});
    return JSON.parse(fileData)
}