module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      './plugins/rewrite-rn-text.js',
      [
        'module-resolver',
        {
          root: ['.'],
          alias: { '@app/text': './src/ui/AppText' },
          extensions: ['.tsx', '.ts', '.js', '.json'],
        },
      ],
    ],
  };
};
