
module.exports = {
  mode: 'production',
  entry: './src/index.ts',
  output: {
    filename: 'index.js'
  },
  resolve: {
    extensions: ['.js', '.ts']
  },
  module: {
    rules: [
      { test: /\.ts$/, loader: "ts-loader" }
    ]
  }
}

if (process.env.NODE_ENV === 'development') {
  module.exports.devtool = 'inline-source-map'
}