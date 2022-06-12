const path = require('path');

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
      hot: true,
  },
  module: {
    rules: [
        {
            test: /\.lv$/,
            use: [
                {
                    loader: 'live-elements-loader'
                },
            ],
        },
    ]
  }
};