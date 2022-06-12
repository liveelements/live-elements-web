import {BaseElement} from 'live-elements-core/baseelement.js'
import {FileGenerator} from '../lib/FileGenerator.lv.mjs'
import {FileGeneratorContent} from '../lib/FileGeneratorContent.lv.mjs'
import {FileGeneratorInfo} from '../lib/FileGeneratorInfo.lv.mjs'
import {GeneratorPack} from '../lib/GeneratorPack.lv.mjs'

export let webpackBundle = (function(parent){
    this.setParent(parent)
    this.name = 'webpack-bundle'
    BaseElement.assignChildrenAndComplete(this, [
        (function(parent){
            this.setParent(parent)
            this.output = 'webpack.config.js'
            BaseElement.assignChildrenAndComplete(this, [
                (function(parent){
                    this.setParent(parent)
                    BaseElement.complete(this)
                    return this
                }.bind(new FileGeneratorContent("const path = require('path');\nconst LiveElementsBundlePlugin = require('live-elements-bundle-plugin')\n\nvar globalDevServer = null\n\nmodule.exports = {\n  entry: './src/app/main.lv',\n  output: {\n    filename: 'main.js',\n    path: path.resolve(__dirname, 'dist')\n  },\n  mode: 'development',\n  devServer: {\n      host: '0.0.0.0',\n      port: 8080,\n      hot: false,\n      setupMiddlewares: (middlewares, devServer) => {\n        if (!devServer) {\n          throw new Error('webpack-dev-server is not defined');\n        }\n        globalDevServer = devServer\n        return middlewares\n      }\n  },\n  plugins: [\n    new LiveElementsBundlePlugin({\n      bundle: path.resolve('src/bundle/bundle.lv'),\n      output: path.resolve(__dirname, 'dist'),\n      beautifyHtml: true,\n      onAssetsAdded: () => {\n        globalDevServer.sendMessage(globalDevServer.webSocketServer.clients, 'content-changed')\n      }\n    })\n  ],\n  module: {\n    rules: [\n        {\n            test: /\\.lv$/,\n            use: [{\n              loader: 'live-elements-loader',\n            }],\n        },\n    ]\n  }\n};"))(this))

            ])
            return this
        }.bind(new FileGenerator())(this))

,
        (function(parent){
            this.setParent(parent)
            this.output = 'package.json'
            BaseElement.assignChildrenAndComplete(this, [
                (function(parent){
                    this.setParent(parent)
                    BaseElement.complete(this)
                    return this
                }.bind(new FileGeneratorContent("{\n  \"name\": \""))(this))

,
                (function(parent){
                    this.setParent(parent)
                    BaseElement.complete(this)
                    return this
                }.bind(new FileGeneratorInfo("package"))(this))

,
                (function(parent){
                    this.setParent(parent)
                    BaseElement.complete(this)
                    return this
                }.bind(new FileGeneratorContent("\",\n  \"version\": \"0.1.0\",\n  \"description\": \"\",\n  \"main\": \"index.js\",\n  \"scripts\": {\n    \"test\": \"echo \\\"Error: no test specified\\\" && exit 1\"\n  },\n  \"author\": \"\",\n  \"license\": \"UNLICENSED\",\n  \"devDependencies\": {\n    \"webpack\": \"^5.65.0\",\n    \"webpack-cli\": \"^4.9.1\",\n    \"webpack-dev-server\": \"^4.7.4\"\n  },\n  \"dependencies\": {\n    \"live-elements-bundle-plugin\": \"^0.1.1\",\n    \"live-elements-core\": \"^0.1.1\",\n    \"live-elements-web\": \"^0.1.1\",\n    \"live-web\": \"^0.1.1\"\n  }\n}"))(this))

            ])
            return this
        }.bind(new FileGenerator())(this))

,
        (function(parent){
            this.setParent(parent)
            this.output = 'live.package.json'
            BaseElement.assignChildrenAndComplete(this, [
                (function(parent){
                    this.setParent(parent)
                    BaseElement.complete(this)
                    return this
                }.bind(new FileGeneratorContent("{\n  \"name\": \""))(this))

,
                (function(parent){
                    this.setParent(parent)
                    BaseElement.complete(this)
                    return this
                }.bind(new FileGeneratorInfo("package"))(this))

,
                (function(parent){
                    this.setParent(parent)
                    BaseElement.complete(this)
                    return this
                }.bind(new FileGeneratorContent("\",\n    \"version\" : \"0.1.0\"\n}"))(this))

            ])
            return this
        }.bind(new FileGenerator())(this))

,
        (function(parent){
            this.setParent(parent)
            this.output = 'src/app/live.module.json'
            BaseElement.assignChildrenAndComplete(this, [
                (function(parent){
                    this.setParent(parent)
                    BaseElement.complete(this)
                    return this
                }.bind(new FileGeneratorContent("{\n    \"name\" : \"app\",\n    \"package\": \"../..\",\n    \"modules\": [\"main\"]\n}"))(this))

            ])
            return this
        }.bind(new FileGenerator())(this))

,
        (function(parent){
            this.setParent(parent)
            this.output = 'src/app/main.lv'
            BaseElement.assignChildrenAndComplete(this, [
                (function(parent){
                    this.setParent(parent)
                    BaseElement.complete(this)
                    return this
                }.bind(new FileGeneratorContent("import live-web\nimport live-web.style\nimport live-web.dom\n \ninstance app Application{\n    render: Div{\n        H1\`Welcome from Live Elements\`\n    }\n}"))(this))

            ])
            return this
        }.bind(new FileGenerator())(this))

,
        (function(parent){
            this.setParent(parent)
            this.output = 'src/bundle/live.module.json'
            BaseElement.assignChildrenAndComplete(this, [
                (function(parent){
                    this.setParent(parent)
                    BaseElement.complete(this)
                    return this
                }.bind(new FileGeneratorContent("{\n    \"name\" : \"bundle\",\n    \"package\": \"../..\",\n    \"modules\": [\"bundle\", \"IndexPage\"]\n}"))(this))

            ])
            return this
        }.bind(new FileGenerator())(this))

,
        (function(parent){
            this.setParent(parent)
            this.output = 'src/bundle/bundle.lv'
            BaseElement.assignChildrenAndComplete(this, [
                (function(parent){
                    this.setParent(parent)
                    BaseElement.complete(this)
                    return this
                }.bind(new FileGeneratorContent("import live-web.bundle\n\ninstance bundle Bundle{\n    pages: [IndexPage]\n}"))(this))

            ])
            return this
        }.bind(new FileGenerator())(this))

,
        (function(parent){
            this.setParent(parent)
            this.output = 'src/bundle/IndexPage.lv'
            BaseElement.assignChildrenAndComplete(this, [
                (function(parent){
                    this.setParent(parent)
                    BaseElement.complete(this)
                    return this
                }.bind(new FileGeneratorContent("import live-web.bundle\nimport live-web.dom\n\ncomponent IndexPage < Page{\n    output: 'index.html'\n    title: 'Index'\n    clientRender: body\n\n    Body{\n        id: body\n    }\n}"))(this))

            ])
            return this
        }.bind(new FileGenerator())(this))

    ])
    return this
}.bind(new GeneratorPack())(null))
 // webpackBundle Generator