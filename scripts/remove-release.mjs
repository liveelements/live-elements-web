import fs from 'fs'
import path from 'path'

function scan(directory) {
    const filePaths = [];
    const items = fs.readdirSync(directory, { withFileTypes: true });

    items.forEach(item => {
        if (item.isDirectory()) {
            const packageJsonPath = path.join(directory, item.name, 'live.package.json');
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

function writePackage(filePath, content){
    const str = JSON.stringify(content)
    fs.writeFileSync(filePath, str)
}
    
scan('packages').forEach(filePath => {
    console.log("READING PACKAGE:", filePath)
    const content = readPackage(filePath)
    delete content.release
    writePackage(filePath, content)
})
