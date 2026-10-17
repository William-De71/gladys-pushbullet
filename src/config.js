// -----------------------------------------------------------------------------
// Configuration of the Pushbullet integration.
//
// Two levels, as the manifest declares them:
//   - `config_schema` (the administrator, once for the house): the access
//     token of the Pushbullet account of the integration, the title of the
//     notifications, the language of the texts the integration writes, the
//     "Gladys" device and what the stream turns into scene triggers;
//   - `contact_schema` (each user, in the "My account" block): the e-mail of
//     the Pushbullet account their notifications go to, and optionally one
//     device of it. Gladys hands them with every message.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './i18n.js';

const DEFAULT_TITLE = 'Gladys';
const DEFAULT_DEVICE_NAME = 'Gladys';
const DEFAULT_LANGUAGE = 'en';
const MAX_TITLE = 100;

/**
 * @description A trimmed string, '' for anything else.
 * @param {any} value - The raw value.
 * @returns {string} The string.
 */
const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * @description A boolean of the configuration (Gladys may store "true").
 * @param {any} value - The raw value.
 * @param {boolean} fallback - The default when unset.
 * @returns {boolean} The value.
 */
function flag(value, fallback) {
  if (value === true || value === 'true') {
    return true;
  }
  if (value === false || value === 'false') {
    return false;
  }
  return fallback;
}

/**
 * @description Normalize the integration configuration.
 * @param {object} [raw] - The raw values (gladys.config).
 * @returns {object} The configuration used by the integration.
 * @example
 * normalizeConfig({ access_token: 'o.abc' });
 */
function normalizeConfig(raw = {}) {
  const language = text(raw.language);
  return {
    accessToken: text(raw.access_token),
    title: (text(raw.title) || DEFAULT_TITLE).slice(0, MAX_TITLE),
    language: LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE,
    createDevice: flag(raw.create_device, true),
    deviceName: (text(raw.device_name) || DEFAULT_DEVICE_NAME).slice(0, 50),
    receivePushes: flag(raw.receive_pushes, true),
    receiveMirrors: flag(raw.receive_mirrors, false),
    encryptionPassword: typeof raw.encryption_password === 'string' ? raw.encryption_password : '',
  };
}

/**
 * @description Whether the access token is set.
 * @param {object} config - normalizeConfig.
 * @returns {boolean} True when the integration can call Pushbullet.
 */
const hasToken = (config) => Boolean(config.accessToken);

/**
 * @description Whether the realtime stream is needed.
 * @param {object} config - normalizeConfig.
 * @returns {boolean} True when a trigger reads it.
 */
const needsStream = (config) => hasToken(config) && (config.receivePushes || config.receiveMirrors);

/**
 * @description An e-mail address, lower case, or '' when it is not one.
 * @param {any} value - The raw value.
 * @returns {string} The address.
 * @example
 * normalizeEmail(' Jane@Example.com '); // -> 'jane@example.com'
 */
function normalizeEmail(value) {
  const email = text(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

/**
 * @description The values of the "My account" block of a user.
 * @param {object} [contact] - The contact_schema values.
 * @returns {{ email: string, device: string }} The target of their notifications.
 * @example
 * contactTarget({ email: 'jane@example.com', device: 'Pixel 8' });
 */
function contactTarget(contact = {}) {
  return { email: normalizeEmail(contact?.email), device: text(contact?.device).slice(0, 100) };
}

export {
  normalizeConfig,
  hasToken,
  needsStream,
  normalizeEmail,
  contactTarget,
  DEFAULT_TITLE,
  DEFAULT_DEVICE_NAME,
  DEFAULT_LANGUAGE,
};
