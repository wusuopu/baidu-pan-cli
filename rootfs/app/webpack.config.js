const path = require('path');
const nodeExternals = require('webpack-node-externals');
const WebpackShellPlugin = require('webpack-shell-plugin');

const { NODE_ENV = 'production' } = process.env;
const rootPath = path.resolve(__dirname)

let plugins = []
if (NODE_ENV === 'development') {
  plugins.push(new WebpackShellPlugin({
    onBuildEnd: ['yarn run:dev']
  }))
}

module.exports = {
  devtool: 'hidden-source-map',
  entry: {
    index: path.resolve(rootPath, './src/index.ts'),
    cli: path.resolve(rootPath, './src/cli.ts')
  },
  mode: NODE_ENV,
  target: 'node',
  watch: NODE_ENV === 'development',
  externals: [ nodeExternals() ],
  output: {
    path: path.resolve(rootPath, 'build', NODE_ENV === 'development' ? 'dev' : 'prod'),
    filename: '[name].js'
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  plugins: plugins,
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          'ts-loader',
        ]
      }
    ]
  },
}
