#! /usr/bin/env node

const {Command, Argument} = require('commander')

const program = new Command()
program
    .name('livetest')
    .arguments('<file>', "Path to lv file.")
    .description('Live Test CLI')
    .version('0.1.0')
    .parse(process.argv)

if ( program.args.length !== 1 ){
    console.log(program.help())
    process.exit(-1)
}

var testFile = program.args[0]

import('live-elements-core/lvimport.mjs').then((lvimport) => {
    lvimport.default(testFile).then((testModule) => {
        var testModuleExport = Object.keys(testModule)
        if ( testModuleExport.length !== 1 ){
            throw new Error("Only a single 'Spec' object should be exported from a test file.")
        }
        var testSpec = testModule[testModuleExport[0]]
        if ( !testSpec.run ){
            throw new Error("Test Spec doesn't have a run function.")
        }

        testSpec.run()
    }).catch((e) => {
        console.error(e)
        process.exit(-1)
    })
}).catch((e) => {
    console.error(e)
    process.exit(-1)
})
