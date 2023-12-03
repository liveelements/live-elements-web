import fs from 'fs'
import path from 'path'

function scan(directory) {
    const filePaths = [];
    const items = fs.readdirSync(directory, { withFileTypes: true });

    items.forEach(item => {
        if (item.isDirectory()) {
            const packageJsonPath = path.join(directory, item.name, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                filePaths.push(packageJsonPath);
            }
        }
    });

    return filePaths;
}

function readPackage(filePath){
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}


const currentVersion = readPackage('package.json').version

if ( !process.argv[2] ){
    console.error("Usage: update-version.mjs <version>")
    process.exit(1)
}

const newVersion = process.argv[2]
console.log("Updating: ", currentVersion, " -> ", newVersion)
    
const packages = scan('packages').map(filePath => {
    return { file: filePath, content: readPackage(filePath) }
})

const newPackages = packages.map(packageInfo => {
    packageInfo.content.version = newVersion
    console.log(`In ${packageInfo.content.name} -> ${newVersion}`)
    for ( let [key, _value] of Object.entries(packageInfo.content.dependencies) ){
        if ( packages.find(p => p.content.name === key) ){
            console.log(`  * ${packageInfo.content.name}, updating dependency '${key}' -> ${newVersion}`)
            packageInfo.content.dependencies[key] = `^${newVersion}`
        }
    }
    return packageInfo
})

const newPackagesContent = newPackages.map(p => ({ file: p.file, source: JSON.stringify(p.content, null, 4) }))

newPackagesContent.forEach(pc => {
    fs.writeFileSync(pc.file, pc.source)
    console.log(`Written ${pc.file}`)
})


const newMainPackageContent = readPackage(path.resolve('package.json'))
newMainPackageContent.version = newVersion
fs.writeFileSync(path.resolve('package.json'), JSON.stringify(newMainPackageContent, null, 4))

console.log(`Written package.json`)