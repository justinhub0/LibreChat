const path = require('path');
const { logger } = require('@librechat/data-schemas');
const { loadServiceKey, isUserProvided } = require('@librechat/api');
const { config } = require('./EndpointService');

async function loadAsyncEndpoints() {
  let serviceKey, googleUserProvides;
  const { googleKey } = config;

  // Debug logging for Google endpoint initialization
  logger.info('[loadAsyncEndpoints] GOOGLE_KEY present:', !!googleKey);
  logger.info('[loadAsyncEndpoints] GOOGLE_KEY value (masked):', googleKey ? `${googleKey.substring(0, 8)}...` : 'not set');

  /** Check if GOOGLE_KEY is provided at all(including 'user_provided') */
  const isGoogleKeyProvided = googleKey && googleKey.trim() !== '';

  if (isGoogleKeyProvided) {
    /** If GOOGLE_KEY is provided, check if it's user_provided */
    googleUserProvides = isUserProvided(googleKey);
  } else {
    /** Only attempt to load service key if GOOGLE_KEY is not provided */
    const serviceKeyPath =
      process.env.GOOGLE_SERVICE_KEY_FILE || path.join(__dirname, '../../..', 'data', 'auth.json');

    try {
      serviceKey = await loadServiceKey(serviceKeyPath);
    } catch (error) {
      logger.error('Error loading service key', error);
      serviceKey = null;
    }
  }

  const google = serviceKey || isGoogleKeyProvided ? { userProvide: googleUserProvides } : false;

  logger.info('[loadAsyncEndpoints] Google endpoint enabled:', !!google);
  logger.info('[loadAsyncEndpoints] isGoogleKeyProvided:', isGoogleKeyProvided);
  logger.info('[loadAsyncEndpoints] serviceKey loaded:', !!serviceKey);

  return { google };
}

module.exports = loadAsyncEndpoints;
