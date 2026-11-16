// Expo's default Metro config detects the npm workspace root and watches packages/*.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
