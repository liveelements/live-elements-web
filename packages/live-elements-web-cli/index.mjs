#! /usr/bin/env node

import {Command} from 'commander'
const program = new Command()

import generate from './commands/generate.mjs'
import convert from './commands/convert.mjs'
import argumentPairsToObject from './lib/argument-pairs-to-object.mjs'

program
    .name('lvweb')
    .description('Live Elements Web CLI')
    .version('0.1.4')

program.command('generate <template>')
    .description('Generate a project from a template.')
    .allowUnknownOption()
    .action((template, cmd) => {
        const excludeKeys = []
        const props = argumentPairsToObject(process.argv, excludeKeys)
        generate(template, cmd, props)
    })

program.command('convert')
    .description('Converts html code to elements either from a file or from stdin.')
    .option('--file <file>', 'Input file.', '')
    .action(convert)

program.parse(process.argv)