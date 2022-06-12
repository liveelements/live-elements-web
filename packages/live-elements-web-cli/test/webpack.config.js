const path = require('path');
const LiveElementsBundlePlugin = require('live-elements-bundle-plugin')

var globalDevServer = null

module.exports = {
  entry: './src/app/main.lv',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist')
  },
  mode: 'development',
  devServer: {
      host: '0.0.0.0',
      port: 8080,
      hot: false,
      setupMiddlewares: (middlewares, devServer) => {
        if (!devServer) {
          throw new Error('webpack-dev-server is not defined');
        }
        globalDevServer = devServer
        return middlewares
      }
  },
  plugins: [
    new LiveElementsBundlePlugin({
      bundle: path.resolve('src/bundle/bundle.lv'),
      output: path.resolve(__dirname, 'dist'),
      beautifyHtml: true,
      onAssetsAdded: () => {
        globalDevServer.sendMessage(globalDevServer.webSocketServer.clients, 'content-changed')
      }
    })
  ],
  module: {
    rules: [
        {
            test: /\.lv$/,
            use: [{
              loader: 'live-elements-loader',
            }],
        },
    ]
  }
};