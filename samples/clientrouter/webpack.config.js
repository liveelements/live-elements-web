const path = require('path');
const LiveElementsBundlePlugin = require('live-elements-bundle-plugin')

// we need this both for the middleware and the webpack plugins
var liveElementsPlugin = new LiveElementsBundlePlugin({
  bundle: path.resolve('src/bundle.lv'),
  output: path.resolve(__dirname, 'dist'),
  beautifyHtml: true
})

module.exports = {
  entry: './src/main.lv',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist')
  },
  mode: 'development',
  devServer: {
      host: '0.0.0.0',
      port: 8080,
      hot: false,
      historyApiFallback: true,
      setupMiddlewares: (middlewares, devServer) => {
        if (!devServer) {
          throw new Error('webpack-dev-server is not defined');
        }
        // when assets change, refresh the page
        liveElementsPlugin.onAssetsAdded = () => {
          devServer.sendMessage(devServer.webSocketServer.clients, 'content-changed')
        }
        return middlewares
      }
  },
  plugins: [liveElementsPlugin], // include bundle plugin to render the pages
  module: {
    rules: [
        {
            test: /\.lv$/,
            use: [{
              loader: 'live-elements-loader', // add the live elements loader
            }],
        },
    ]
  }
};