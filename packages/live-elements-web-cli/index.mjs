#! /usr/bin/env node

import {Command} from 'commander'
const program = new Command()

import generate from './commands/generate.mjs'
import convert from './commands/convert.mjs'
import serve from './commands/serve.mjs'
import compile from './commands/compile.mjs'
import run from './commands/run.mjs'
import argumentPairsToObject from './lib/argument-pairs-to-object.mjs'
import readline from 'readline'
import path from 'path'
import runNpmI from './lib/run-npm-i.mjs'

program
    .name('lvweb')
    .description('Live Elements Web CLI')
    .version('0.1.9')

program.command('generate [path]')
    .description('Generate a project from a template.')
    .option("-t, --template <name>", 'Template to use.')
    .allowUnknownOption()
    .action((location, options) => {
        const excludeKeys = ['t', 'template']
        const props = argumentPairsToObject(process.argv, excludeKeys)
        const usedLocation = location
            ? path.isAbsolute(location) ? location : path.resolve(location)
            : process.cwd()
        generate(usedLocation, options, props)
    })

program.command('init [path]')
    .description('Initialize a project from a template.')
    .option("-t, --template <name>", 'Template to use.')
    .allowUnknownOption()
    .action(async (location, options) => {
        const excludeKeys = ['t', 'template']
        const props = argumentPairsToObject(process.argv, excludeKeys)
        const usedLocation = location
            ? path.isAbsolute(location) ? location : path.resolve(location)
            : process.cwd()
        await generate(usedLocation, options, props)
        console.log("Project initialized.\n")
        console.log("Project dependencies need to be installed before running the project.")
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
        rl.question('Do you want to run npm install? (y/n) ', answer => {
            if ( answer[0] === 'y' || answer[0] === 'Y' ){
                console.log("Running npm install...")
                runNpmI(usedLocation)
            } else {
                console.log(
                    "Dependencies have not been installed.",
                    "You will need to run npm manually before running the project."
                )
            }
            rl.close()
        })
    })

program.command('serve [bundle]')
    .description('Serve the bundle file.')
    .option('--port <port>', 'Port number', parseInt)
    .option('--baseUrl <url>', 'Base URL')
    .option('--renderMode <mode>', 'Page render mode (developement or production)')
    .option('--httpsHost', 'Whether the server is running under an https host.')
    .option('--view <view>', 'Additional view to the bundle')
    .action(serve)

program.command('compile [bundle]')
    .description('Compile the bundle file.')
    .action(compile)


program.command('run [bundle]')
    .description('Run the compiled bundle file.')
    .option('--port <port>', 'Port number', parseInt)
    .option('--baseUrl <url>', 'Base URL')
    .option('--httpsHost', 'Whether the server is running under an https host.')
    .action(run)

program.command('convert')
    .description('Converts html code to elements either from a file or from stdin.')
    .option('--file <file>', 'Input file.', '')
    .option('--indent <value>', 'Indent Value.', parseInt)
    .action(convert)

program.parse(process.argv)