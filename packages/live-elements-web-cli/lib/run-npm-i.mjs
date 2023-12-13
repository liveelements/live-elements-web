import { spawn } from 'child_process'

export default function runNpmI(wd){
    const npmInstall = spawn('npm', ['install'], { shell: true, cwd: wd ? wd : process.cwd() });
    npmInstall.stdout.on('data', d => console.log(d.toString()))
    npmInstall.stderr.on('data', d => console.error(d.toString()))
    npmInstall.on('close', (code) => {
        console.log(`Process exited with code ${code}`)
    })
}