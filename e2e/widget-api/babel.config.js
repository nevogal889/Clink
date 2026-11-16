// The e2e run executes the app's own data layer in Node, so plain TypeScript is enough here.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }], '@babel/preset-typescript'],
};
