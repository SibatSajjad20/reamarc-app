/**
 * Dynamic Expo config. Static defaults live in app.json.
 * ATS: allow cleartext only for local / EAS developmentClient builds.
 * Production and preview talk to HTTPS Render — NSAllowsArbitraryLoads stays off.
 */
module.exports = ({ config }) => {
  const profile = process.env.EAS_BUILD_PROFILE || '';
  const allowArbitraryLoads = profile !== 'production' && profile !== 'preview';

  return {
    ...config,
    ios: {
      ...(config.ios || {}),
      infoPlist: {
        ...((config.ios && config.ios.infoPlist) || {}),
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: allowArbitraryLoads,
          NSAllowsLocalNetworking: true,
        },
      },
    },
  };
};
