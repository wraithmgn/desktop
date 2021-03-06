'use strict'

const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const webpack = require('webpack')

module.exports = {
  entry: {
    main: ['./app/src/main-process/main'],
    renderer: ['./app/src/ui/index'],
    shared: ['./app/src/shared-process/index'],
    'ask-pass': ['./app/src/ask-pass/main']
  },
  output: {
    filename: '[name].js',
    path: path.join(__dirname, '..', 'out'),
    libraryTarget: 'commonjs2'
  },
  module: {
    loaders: [
      {
        test: /\.tsx?$/,
        loaders: ['ts'],
        include: path.join(__dirname, 'src')
      },
      {
        test: /\.(jpe?g|png|gif|ico)$/,
        loaders: ['file?name=[path][name].[ext]']
      }
    ]
  },
  resolve: {
    extensions: ['', '.js', '.ts', '.tsx'],
    packageMains: ['webpack', 'browser', 'web', 'browserify', ['jam', 'main'], 'main']
  },
  target: 'electron',
  plugins: [
    new HtmlWebpackPlugin({
      'template': path.join(__dirname, 'static', 'index.html'),
      'chunks': ['renderer']
    }),
    new HtmlWebpackPlugin({
      'filename': 'shared.html',
      'chunks': ['shared']
    }),
    new webpack.NoErrorsPlugin()
  ],
  externals: function (context, request, callback) {
    try {
      // Attempt to resolve the module via Node
      require.resolve(request)
      callback(null, request)
    } catch (e) {
      // Node couldn't find it, so it must be user-aliased
      callback()
    }
  },
  node: {
    __dirname: false,
    __filename: false
  },
  replacements: {
    __OAUTH_SECRET__: JSON.stringify(process.env.DESKTOP_OAUTH_CLIENT_SECRET),
    __DARWIN__: process.platform === 'darwin',
    __WIN32__: process.platform === 'win32'
  }
}
