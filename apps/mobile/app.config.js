module.exports = ({ config }) => {
  const isProductionBuild = process.env.EAS_BUILD_PROFILE === 'production';
  return {
    ...config,
    plugins: [
      'expo-router',
      [
        'expo-build-properties',
        {
          android: {
            kotlinVersion: '1.9.25',
            usesCleartextTraffic: !isProductionBuild,
          },
        },
      ],
    ],
  };
};
