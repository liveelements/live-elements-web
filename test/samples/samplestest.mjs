import { spawn } from 'child_process'
import path from 'path'
import url from 'url'
import chalk from 'chalk'

const currentDir = path.dirname(url.fileURLToPath(import.meta.url)) 

function serveBundleSample(sampleName, sampleBundlePath, port){
    const scriptUrl = path.resolve(path.join(currentDir, '..', '..', 'packages', 'live-elements-web-cli', 'index.mjs'))
    const proc = spawn('node', [scriptUrl, 'serve', '--port', port, sampleBundlePath]);
    proc.stdout.on('data', d => console.log(`[${sampleName}:${port}]`, d.toString()))
    proc.stderr.on('data', d => console.error(`[${sampleName}:${port}]`, chalk.red(d.toString())))
    proc.on('close', (code) => {
        console.log(`[${sampleName}:${port}]: Process exited with code ${code}`)
    })
    return proc
}


function run(){
    let startPort = 6001
    let bundleSamples = [
        'clientrouting',
        'customstyle',
        'fileassets',
        'nestedroutes',
        'placements',
        'slider',
        'staticpages',
        'stylesheets',
        'welcome'
    ]

    let bundleSamplesInfo = bundleSamples.map(b => {
        return {
            name: b,
            path: path.resolve(path.join(path.join(currentDir, '..', '..', 'samples', b, 'bundle', 'bundle.lv'))),
            port: startPort++
        }
    })

    for ( let i = 0; i < bundleSamplesInfo.length; ++i ){
        const bundleSample = bundleSamplesInfo[i]
        serveBundleSample(bundleSample.name, bundleSample.path, bundleSample.port)
    }
}

run()
    