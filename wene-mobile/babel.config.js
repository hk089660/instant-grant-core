module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin',
      '@babel/plugin-proposal-export-namespace-from'
    ],
    // expo-router/babel は babel-preset-expo に含まれるため不要（SDK 50 以降非推奨）
  };
};
