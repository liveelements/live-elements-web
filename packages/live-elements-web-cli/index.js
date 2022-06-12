#! /usr/bin/env node

const {Command, Argument} = require('commander')
const program = new Command()

const generateCommand = require('./commands/generate')
const convertCommand = require('./commands/convert')

program
    .name('lvweb')
    .description('Live Elements Web CLI')
    .version('0.1.2')

program.command('generate <template>')
    .description('Generate a project from a template.')
    .action(generateCommand)

program.command('convert')
    .description('Converts html code to elements either from a file or from stdin.')
    .option('--file <file>', 'Input file.', '')
    .action(convertCommand)

program.parse(process.argv)