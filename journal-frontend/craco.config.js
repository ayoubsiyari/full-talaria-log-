module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        stream: false,
        buffer: false,
        crypto: false,
        path: false,
        os: false,
        fs: false,
        http: false,
        https: false,
        zlib: false,
      };
      return webpackConfig;
    },
  },
};
