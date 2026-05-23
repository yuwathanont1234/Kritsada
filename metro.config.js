const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add 'bin' to the list of asset extensions to support linear probe weights bundling
config.resolver.assetExts.push('bin');

module.exports = config;
