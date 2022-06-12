const {parentPort, workerData} = require("worker_threads")

run(workerData).then((result) => {
    parentPort.postMessage(result)
}).catch((err) => {
    throw err
})

function run(data){
    return new Promise((resolve, reject) => {
        var defaultOptions = {
            beautify: true
        }
    
        for (const [key, value] of Object.entries(defaultOptions)) {
            if ( !data.hasOwnProperty(key) ){
                data[key] = value
            }
        }

        import('./lvbundler.mjs').then((lvbundlerm) => {
            import('./lvdomemulator.mjs').then((lvdomemulatorm) => {

                var LvBundler = lvbundlerm.LvBundler
                var LvDOMEmulator = lvdomemulatorm.LvDOMEmulator
                
                var bundler = new LvBundler(new LvDOMEmulator({beautify: data.beautify}))
        
                var collector = []
                
                bundler.run(data.file, {
                    onFileReady: (filePath, content) => {
                        collector.push({ path: filePath, content: content })
                    },
                    onReady : (file, componentName) => {
                        var result = {
                            assets: collector,
                            file: file,
                            component: componentName
                        }
                        resolve(result)
                    },
                    onError: (err) => {
                        reject(err)
                    }
                })


            }).catch( err => {reject(err)} )
        }).catch( err => { reject(err) })

    })
}
