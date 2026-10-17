// -----------------------------------------------------------------------------
// Every handler of the Pushbullet integration, registered on the Gladys client
// it receives: index.js passes the real one, the tests the fake Gladys of the
// SDK (`@gladysassistant/integration-sdk/testing`).
//
// A COMMUNICATION integration of the SEND-ONLY family (`messaging: { receive:
// false }`): Gladys notifications go out as pushes.
//   - The access token of the Pushbullet account is set once by the
//     administrator (`config_schema`); each user enters the e-mail of the
//     Pushbullet account their notifications go to, and optionally one of its
//     devices (`contact_schema`, "My account" block).
//   - What arrives on the account never reaches the brain (a send-only channel
//     cannot carry a user's authority): pushes and mirrored notifications fire
//     scene triggers and fill the recent widget.
//   - Scene triggers push_received / notification_mirrored / push_not_sent,
//     scene actions send_push / send_sms, widgets account / recent,
//     Configuration screen buttons test_connection / send_test_push.
// -----------------------------------------------------------------------------

import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, hasToken, needsStream, contactTarget, normalizeEmail } from './config.js';
import {
  createPushbulletClient,
  PushbulletError,
  FAILURE_REASONS,
  toPushbulletError,
} from './pushbullet-api.js';
import { createAccount, deviceName, parseAddresses } from './account.js';
import { createStore, DEFAULT_PATH } from './store.js';
import { createStream } from './stream.js';
import { createReceiver } from './receiver.js';
import { createFailureEvents, maskEmail } from './events.js';
import { buildAccountWidget, buildRecentWidget, WIDGETS, WIDGET_ACTIONS } from './widgets.js';
import { t, all, isLanguage } from './i18n.js';

const ACTIONS = Object.freeze({ TEST_CONNECTION: 'test_connection', SEND_TEST: 'send_test_push' });
const SCENE_ACTIONS = Object.freeze({ SEND_PUSH: 'send_push', SEND_SMS: 'send_sms' });

// The account and its devices are read again every 30 minutes: a revoked
// token shows in the status, a renamed device in the events.
const ACCOUNT_INTERVAL_MS = 30 * 60 * 1000;

// Status message of each failure reason (the others: status_error).
const STATUS_OF_REASON = {
  [FAILURE_REASONS.NOT_CONFIGURED]: 'status_not_configured',
  [FAILURE_REASONS.INVALID_TOKEN]: 'status_invalid_token',
  [FAILURE_REASONS.RATE_LIMITED]: 'status_rate_limited',
  [FAILURE_REASONS.UNREACHABLE]: 'status_unreachable',
  [FAILURE_REASONS.TIMEOUT]: 'status_unreachable',
};

/**
 * @description Register the handlers of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options (tests).
 * @param {Function} [options.transport] - HTTP transport of the Pushbullet client.
 * @param {Function} [options.WebSocketImpl] - WebSocket class of the stream.
 * @param {string} [options.statePath] - The state file.
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {Function} [options.wait] - `(ms) => Promise`, pause before a retry.
 * @param {boolean} [options.timers] - Start the periodic reading (false in tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 * @example
 * createApp(new GladysIntegration());
 */
function createApp(
  gladys,
  {
    transport,
    WebSocketImpl,
    statePath = DEFAULT_PATH,
    now = () => Date.now(),
    wait,
    timers = true,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  let readFailure = null;
  let lastFailure = null;
  let lastStatus = null;
  let accountTimer = null;

  const api = createPushbulletClient({
    getToken: () => config.accessToken,
    ...(transport ? { transport } : {}),
    ...(wait ? { wait } : {}),
  });
  const account = createAccount({ api, getConfig: () => config });
  const store = createStore({ path: statePath, now, logger });
  const failures = createFailureEvents(gladys, logger);

  /**
   * @description Ask the dashboards to fetch the widgets again (fire and forget).
   * @param {string[]} [keys] - The widgets.
   */
  function refreshWidgets(keys = Object.values(WIDGETS)) {
    keys.forEach((key) => {
      Promise.resolve()
        .then(() => gladys.requestWidgetRefresh(key))
        .catch((err) => logger.debug?.(`Widget refresh of ${key} failed: ${err.message}`));
    });
  }

  const receiver = createReceiver({
    gladys,
    api,
    account,
    store,
    getConfig: () => config,
    onReceived: () => refreshWidgets(),
    now,
    logger,
  });

  const stream = createStream({
    getToken: () => config.accessToken,
    onTickle: (subtype) => {
      if (subtype === 'push') {
        receiver.sync();
      } else if (subtype === 'device') {
        account.forgetDevices();
        refreshWidgets([WIDGETS.ACCOUNT]);
      }
    },
    onEphemeral: (push) => {
      receiver.ephemeral(push).catch((err) => logger.warn(`Ephemeral not handled: ${err.message}`));
    },
    onState: (up) => {
      // Connected (again): catch up the pushes sent meanwhile.
      if (up) {
        receiver.sync();
      }
      refreshWidgets([WIDGETS.ACCOUNT]);
    },
    ...(WebSocketImpl ? { WebSocketImpl } : {}),
    logger,
  });

  /** @returns {boolean} Whether a reception is on. */
  const receiving = () => config.receivePushes || config.receiveMirrors;

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description Read the account and its devices, find or create the
   * "Gladys" device, report the status.
   * @returns {Promise<boolean>} True when the account was read.
   */
  async function refreshAccount() {
    if (!hasToken(config)) {
      readFailure = FAILURE_REASONS.NOT_CONFIGURED;
      await reportStatus(false, all('noToken'));
      refreshWidgets([WIDGETS.ACCOUNT]);
      return false;
    }
    try {
      const user = await account.user();
      await account.devices(true);
      if (config.createDevice) {
        const device = await account.ensureGladysDevice(store.gladysDeviceIden());
        await store.setGladysDeviceIden(device.iden);
      } else {
        account.forgetGladysDevice();
      }
      readFailure = null;
      await reportStatus(
        true,
        all('statusConnected', {
          email: user.email,
          devices: (account.knownDevices() ?? []).length,
        }),
      );
      return true;
    } catch (err) {
      const failure = toPushbulletError(err);
      readFailure = failure.reason;
      logger.warn(`Unable to read the Pushbullet account (${failure.reason}): ${failure.message}`);
      await reportStatus(false, all(STATUS_OF_REASON[failure.reason] ?? 'status_error'));
      return false;
    } finally {
      refreshWidgets([WIDGETS.ACCOUNT]);
    }
  }

  /** @description Start or stop the stream as the configuration asks. */
  function applyStream() {
    // A refused token: the account reading (every 30 minutes, or a new
    // configuration) tells when it works again; no reconnection loop meanwhile.
    if (needsStream(config) && readFailure !== FAILURE_REASONS.INVALID_TOKEN) {
      stream.start();
    } else {
      stream.stop();
    }
  }

  /** @description (Re)start the periodic reading of the account. */
  function schedule() {
    clearInterval(accountTimer);
    accountTimer = null;
    if (!timers) {
      return;
    }
    accountTimer = setInterval(() => {
      const before = readFailure;
      refreshAccount()
        .then(() => {
          if (before === FAILURE_REASONS.INVALID_TOKEN && readFailure !== before) {
            applyStream();
          }
        })
        .catch((err) => logger.error('Account reading failed', err));
    }, ACCOUNT_INTERVAL_MS);
  }

  /**
   * @description The push target of a scene action: one target at most.
   * @param {object} fields - The action fields.
   * @returns {Promise<{ target: object, label: string }>} The target and its description.
   */
  async function actionTarget(fields) {
    const device = String(fields.device ?? '').trim();
    const emailTyped = String(fields.email ?? '').trim();
    const channel = String(fields.channel_tag ?? '').trim();
    const given = [device, emailTyped, channel].filter(Boolean).length;
    if (given > 1) {
      throw new PushbulletError('Choose one target at most: a device, an e-mail or a channel', {
        reason: FAILURE_REASONS.INVALID_TARGET,
      });
    }
    if (device) {
      const found = await account.findDevice(device);
      return { target: { device_iden: found.iden }, label: deviceName(found) };
    }
    if (emailTyped) {
      const email = normalizeEmail(emailTyped);
      if (!email) {
        throw new PushbulletError(`"${emailTyped.slice(0, 60)}" is not an e-mail address`, {
          reason: FAILURE_REASONS.INVALID_TARGET,
        });
      }
      return { target: { email }, label: email };
    }
    if (channel) {
      return { target: { channel_tag: channel }, label: `#${channel}` };
    }
    return { target: {}, label: 'all' };
  }

  /**
   * @description Send the test push to every device (or one) of the account.
   * @param {string} language - The language of the push.
   * @param {string} [device] - One device, by name.
   * @returns {Promise<string>} The name of the target.
   */
  async function sendTest(language, device) {
    const found = device ? await account.findDevice(device) : null;
    await account.push(
      { title: t('testTitle', language), body: t('testBody', language) },
      found ? { device_iden: found.iden } : {},
    );
    await store.count('sent');
    refreshWidgets([WIDGETS.ACCOUNT]);
    return found ? deviceName(found) : null;
  }

  // --- Outgoing message: Gladys asks us to deliver a notification --------------------
  // A scene "send a message", an alert or a notification routed to a user ends
  // up here, for the users who entered their Pushbullet e-mail. `message` is
  // `{ text, file }`: an attached image (a camera snapshot) is sent as a file.
  gladys.onSendMessage(async (contact, message) => {
    const target = contactTarget(contact);
    const label = target.email ? maskEmail(target.email) : '?';
    try {
      if (!hasToken(config)) {
        throw new PushbulletError('The Pushbullet access token is missing in the configuration', {
          reason: FAILURE_REASONS.NOT_CONFIGURED,
        });
      }
      logger.info(`onSendMessage -> push to ${label}${message?.file ? ' with an image' : ''}`);
      await account.notify(target, message);
      failures.sent(label);
      await store.count('sent');
      refreshWidgets([WIDGETS.ACCOUNT]);
    } catch (err) {
      const failure = toPushbulletError(err);
      logger.warn(`Push to ${label} not sent (${failure.reason}): ${failure.message}`);
      lastFailure = { reason: failure.reason, at: now() };
      await failures.failed(label, failure);
      refreshWidgets([WIDGETS.ACCOUNT]);
      throw failure;
    }
  });

  // --- Scene actions -------------------------------------------------------------------
  // Their result goes to the scene; they never fire a scene trigger (the
  // pushes they create carry the guid of Gladys: push_received ignores them).
  gladys.onSceneAction(SCENE_ACTIONS.SEND_PUSH, async (fields = {}) => {
    const { target, label } = await actionTarget(fields);
    const created = await account.push(
      {
        title: String(fields.title ?? '').trim() || config.title,
        body: String(fields.message ?? ''),
        url: String(fields.url ?? '').trim() || undefined,
      },
      target,
    );
    await store.count('sent');
    refreshWidgets([WIDGETS.ACCOUNT]);
    return { push_iden: String(created.iden ?? ''), target: label };
  });

  gladys.onSceneAction(SCENE_ACTIONS.SEND_SMS, async (fields = {}) => {
    const addresses = parseAddresses(fields.phone_numbers);
    if (addresses.length === 0) {
      throw new Error('No valid phone number in the action (use +33612345678, one per comma)');
    }
    const { text, device } = await account.text({
      device: String(fields.device ?? '').trim(),
      addresses,
      message: String(fields.message ?? ''),
    });
    await store.count('texts');
    refreshWidgets([WIDGETS.ACCOUNT]);
    return { text_iden: String(text.iden ?? ''), device: deviceName(device) };
  });

  // --- Configuration screen buttons ----------------------------------------------------
  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    if (!hasToken(config)) {
      return all('noToken');
    }
    account.reset();
    const ok = await refreshAccount();
    if (!ok) {
      return all(STATUS_OF_REASON[readFailure] ?? 'status_error');
    }
    applyStream();
    const user = account.knownUser();
    const devices = account.knownDevices() ?? [];
    const phones = devices.filter((device) => device.has_sms === true || device.has_sms === 'true');
    return all('testOk', {
      email: user.email,
      devices: (language) =>
        devices.length > 0 ? devices.map(deviceName).join(', ') : t('none', language),
      phones: (language) =>
        phones.length > 0 ? phones.map(deviceName).join(', ') : t('none', language),
    });
  });

  gladys.onAction(ACTIONS.SEND_TEST, async (fields = {}) => {
    if (!hasToken(config)) {
      return all('noToken');
    }
    try {
      const name = await sendTest(config.language, String(fields.device ?? '').trim());
      return all('testSent', { target: (language) => name ?? t('allDevices', language) });
    } catch (err) {
      const failure = toPushbulletError(err);
      return all('testNotSent', { reason: (language) => t(`reason_${failure.reason}`, language) });
    }
  });

  // --- Dashboard widgets -----------------------------------------------------------------
  gladys.onWidgetGet(WIDGETS.ACCOUNT, async ({ language } = {}) => {
    let streamState = 'off';
    if (needsStream(config)) {
      streamState = stream.connected() ? 'up' : 'down';
    }
    const gladysDevice = account.gladysDevice();
    return buildAccountWidget({
      snapshot: {
        user: account.knownUser(),
        devices: account.knownDevices(),
        readFailure,
        counters: store.counters(),
        stream: streamState,
        gladysDevice: gladysDevice ? deviceName(gladysDevice) : null,
        lastFailure,
        receiving: receiving(),
        decryptFailing: receiver.decryptFailing(),
      },
      language,
      now: now(),
    });
  });

  gladys.onWidgetGet(WIDGETS.RECENT, async ({ language } = {}) =>
    buildRecentWidget({
      entries: store.recent(),
      counters: store.counters(),
      receiving: receiving(),
      language,
    }),
  );

  gladys.onWidgetAction(WIDGETS.ACCOUNT, async (actionKey, params = {}) => {
    if (actionKey !== WIDGET_ACTIONS.TEST_PUSH) {
      return undefined;
    }
    const language = isLanguage(params.language) ? params.language : config.language;
    try {
      await sendTest(language);
      return all('toastSent');
    } catch (err) {
      const failure = toPushbulletError(err);
      return all('testNotSent', { reason: (lang) => t(`reason_${failure.reason}`, lang) });
    }
  });

  // --- Configuration ---------------------------------------------------------------------

  /**
   * @description Read the configuration again.
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      config = normalizeConfig(await gladys.getConfig());
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    const previousToken = config.accessToken;
    await loadConfig(rawConfig);
    lastStatus = null;
    if (config.accessToken !== previousToken) {
      // Maybe another account: its history must not fire, its devices differ.
      account.reset();
      await store.stop();
      await store.setGladysDeviceIden(null);
    } else if (!config.receivePushes) {
      await store.stop();
    }
    logger.info(
      `Configuration updated (pushes ${config.receivePushes ? 'on' : 'off'}, notifications ${
        config.receiveMirrors ? 'on' : 'off'
      })`,
    );
    await refreshAccount();
    applyStream();
    schedule();
    refreshWidgets();
  });

  // --- Connection lifecycle --------------------------------------------------------------
  gladys.on('connected', async () => {
    await loadConfig();
    await store.load();
    lastStatus = null;
    await refreshAccount();
    applyStream();
    schedule();
  });

  // --- Graceful shutdown -----------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    clearInterval(accountTimer);
    stream.stop();
    await store.flush();
  });

  return {
    getConfig: () => config,
    store,
    account,
    receiver,
    stream,
    refreshAccount,
    schedule,
  };
}

export { createApp, ACTIONS, SCENE_ACTIONS };
