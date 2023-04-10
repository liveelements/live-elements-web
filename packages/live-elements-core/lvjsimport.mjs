/**
 * Copyright (c) Dinu SV and other contributors.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as tmp from 'tmp'
import * as fs from 'fs'
import * as path from 'path'
import url from 'url'

import {spawn} from 'child_process'

export default function(importPath){
    return new Promise((resolve, reject) => {
        if ( !path.isAbsolute(importPath) ){
            reject(new Error('Import requires absolute path: ' + importPath))
            return
        }

        import(url.pathToFileURL(importPath)).then(resolve).catch((err) => {
            if ( !(err instanceof SyntaxError) ){ reject(err); return }
            if ( err.fileName ){ reject(err); return }
            try{
                const tmpfile = tmp.fileSync({postfix: '.mjs'})
                fs.writeFileSync(tmpfile.name, 'import * as test from \'' + importPath + '\' ')
    
                let stderr = ''
                const captureErrorProcess = spawn('node', [tmpfile.name], {timeout: 1000})
                captureErrorProcess.stderr.on('data', (data) => { stderr += data })
                captureErrorProcess.on('close', (code) => {
                    tmpfile.removeCallback()
                    if ( code === 0 ){ reject(err); return }

                    var indexOfMessage = stderr.indexOf(err.toString())
                    if ( indexOfMessage === -1 ){ reject(err); return }

                    var msgCut = stderr.substring(0, indexOfMessage)
                    var indexOfFile = msgCut.indexOf('file:///')
                    if ( indexOfFile === -1 ){ reject(err); return }

                    var fileNameAndLineNumber = msgCut.substring(indexOfFile, msgCut.indexOf('\n', indexOfFile) - indexOfFile)
                    msgCut = msgCut.replace(fileNameAndLineNumber + '\n', '')
                    var fileName = fileNameAndLineNumber.substring(0, fileNameAndLineNumber.lastIndexOf(':'))
                    var lineNumber = fileNameAndLineNumber.substring(fileNameAndLineNumber.lastIndexOf(':') + 1)

                    var newError = new SyntaxError(err.message + '\nat ' + fileName + ':' + lineNumber + '\n' + msgCut)
                    newError.stack = err.stack
                    newError.fileName = fileName
                    newError.lineNumber = lineNumber
                    reject(newError)
                })
            } catch ( e ){
                reject(err)
            }
        })
    })
}