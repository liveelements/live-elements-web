const path = require('path');
const LiveElementsBundlePlugin = require('live-elements-bundle-plugin')

module.exports = {
  entry: './src/main.lv',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist'),
  },
  mode: 'development',
  devServer: {
      host: "0.0.0.0",
      port: 8080,
      hot: false,
  },
  plugins: [
    new LiveElementsBundlePlugin({
      bundle: path.resolve('src/bundle.lv'),
      beautifyHtml: true
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