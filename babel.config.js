module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    env: {
      production: {
        // Strip console.log/info/debug from release bundles (72+ call sites
        // across src/ would otherwise ship verbose AI payload logging).
        // warn/error are kept — Sentry uses them as breadcrumbs.
        plugins: [['transform-remove-console', { exclude: ['error', 'warn'] }]],
      },
    },
  };
};
