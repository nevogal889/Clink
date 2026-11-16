// Used by Jest only. The app bundles this package through Metro with babel-preset-expo.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }], '@babel/preset-typescript'],
};
