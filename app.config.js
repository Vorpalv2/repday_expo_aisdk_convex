const staticConfig = require('./app.json').expo;

module.exports = {
  ...staticConfig,
  extra: {
    ...staticConfig.extra,
    // Public reCAPTCHA site key needed by Firebase App Check in exported web builds.
    firebaseAppCheckSiteKey: process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY || null,
  },
};
