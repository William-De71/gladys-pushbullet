// -----------------------------------------------------------------------------
// What arrives on the Pushbullet account, turned into scene events.
//
// Pushes: on each `push` tickle of the stream (and once when the stream
// connects, to catch up), the pushes modified since the cursor are read. A
// push fires `push_received` when it is:
//   - new: created after the previous cursor (a push only modified since,
//     dismissed for example, is old news) and never seen before;
//   - not sent by Gladys (guid `gladys-…`), nor from the "Gladys" device;
//   - recent: at most 15 minutes older than the newest push of the reading
//     (server clock). After an interruption, a "open the garage" pushed hours
//     ago must not run now.
// The first reading of an account only sets the cursor: its history never
// fires.
//
// Mirrored notifications: each `mirror` ephemeral fires
// `notification_mirrored`, decrypted first when end-to-end encryption is on.
// Dismissals, clipboard and other ephemerals are ignored.
//
// The readings run one after the other: tickles arriving meanwhile are folded
// into one more reading.
// -----------------------------------------------------------------------------

import { isOwnPush, deviceName } from './account.js';
import { deriveKey, decrypt } from './crypto.js';
import { SCENE_TRIGGERS, pushPayload, mirrorPayload, maskEmail } from './events.js';

const MAX_AGE_SECONDS = 15 * 60;
const RECENT_TEXT = 500;

/**
 * @description Create the receiver.
 * @param {object} options - Options.
 * @param {object} options.gladys - The GladysIntegration client.
 * @param {object} options.api - createPushbulletClient.
 * @param {object} options.account - createAccount.
 * @param {object} options.store - createStore.
 * @param {Function} options.getConfig - `() => config`.
 * @param {Function} [options.onReceived] - Called after something was recorded (widgets).
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {object} options.logger - Logger.
 * @returns {object} The receiver.
 * @example
 * const receiver = createReceiver({ gladys, api, account, store, getConfig, logger });
 * await receiver.sync();
 */
function createReceiver({
  gladys,
  api,
  account,
  store,
  getConfig,
  onReceived = () => {},
  now = () => Date.now(),
  logger,
}) {
  let running = null;
  let again = false;
  let key = null;
  let keyFor = null;
  let warnedEncrypted = false;
  let decryptFailure = false;

  /**
   * @param {string} iden - A device iden.
   * @returns {string} Its name, '' when unknown.
   */
  function deviceNameOf(iden) {
    const device = (account.knownDevices() ?? []).find((entry) => entry.iden === iden);
    return device ? deviceName(device) : '';
  }

  /**
   * @description Fire an event, never throws.
   * @param {string} trigger - The trigger key.
   * @param {object} data - The payload.
   */
  async function fire(trigger, data) {
    try {
      await gladys.publishSceneEvent(trigger, data);
    } catch (err) {
      logger.warn(`Could not fire ${trigger}: ${err.message}`);
    }
  }

  /** @returns {Promise<number>} The number of pushes that fired. */
  async function readPushes() {
    const config = getConfig();
    if (!config.receivePushes || !config.accessToken) {
      return 0;
    }
    const cursor = store.cursor();
    if (cursor === null) {
      // First reading: what is already there is history, nothing fires.
      const [newest] = await api.pushes({ limit: 1 });
      await store.startAt(newest?.modified ?? 0);
      logger.info('Reception of pushes started');
      return 0;
    }
    const pushes = await api.pushes({ modifiedAfter: cursor });
    if (pushes.length === 0) {
      return 0;
    }
    const newest = Math.max(...pushes.map((push) => push.modified ?? 0));
    const gladysIden = account.gladysDevice()?.iden ?? null;
    if (pushes.some((push) => push.source_device_iden && !deviceNameOf(push.source_device_iden))) {
      // A device added since: read the names again for the events.
      await account.devices(true).catch(() => {});
    }
    let fired = 0;
    // Oldest first: the scenes run in the order the pushes were sent.
    for (const push of [...pushes].sort((a, b) => (a.created ?? 0) - (b.created ?? 0))) {
      if (!push.iden || push.active === false || store.seen(push.iden)) {
        continue;
      }
      if ((push.created ?? 0) <= cursor) {
        // Modified (dismissed…) but not new.
        continue;
      }
      if (isOwnPush(push) || (gladysIden && push.source_device_iden === gladysIden)) {
        await store.markSeen(push.iden);
        continue;
      }
      if (newest - (push.created ?? 0) > MAX_AGE_SECONDS) {
        logger.info(`Push ${push.iden} is more than 15 minutes old: not fired`);
        await store.markSeen(push.iden);
        continue;
      }
      const data = pushPayload(push, { gladysIden, deviceNameOf });
      logger.info(
        `Push received (${data.type}, ${data.origin}${
          data.sender_email ? ` from ${maskEmail(data.sender_email)}` : ''
        })`,
      );
      await store.markSeen(push.iden, {
        kind: 'push',
        type: data.type,
        title: data.title.slice(0, 200),
        body: data.body.slice(0, RECENT_TEXT),
        from: data.sender_name || data.source_device || data.sender_email,
        url: data.url.slice(0, 500),
        at: data.received_at,
      });
      await fire(SCENE_TRIGGERS.PUSH_RECEIVED, data);
      fired += 1;
    }
    await store.advance(newest);
    if (fired > 0) {
      onReceived();
    }
    return fired;
  }

  /**
   * @description Read the pushes; concurrent calls fold into one more reading.
   * @returns {Promise<void>}
   */
  function sync() {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        try {
          await readPushes();
        } catch (err) {
          logger.warn(`Unable to read the pushes (${err.reason ?? 'error'}): ${err.message}`);
        }
      } while (again);
    })().finally(() => {
      running = null;
    });
    return running;
  }

  /**
   * @description The decrypted content of an ephemeral, null when it cannot be read.
   * @param {object} push - The `push` object of the stream.
   * @returns {object|null} The ephemeral.
   */
  function open(push) {
    if (!push.encrypted) {
      return push;
    }
    const config = getConfig();
    const user = account.knownUser();
    if (!config.encryptionPassword || !user?.iden) {
      if (!warnedEncrypted) {
        warnedEncrypted = true;
        logger.warn(
          'An end-to-end encrypted notification arrived: enter the encryption password in the configuration',
        );
      }
      return null;
    }
    const keyId = `${user.iden}:${config.encryptionPassword}`;
    if (keyFor !== keyId) {
      key = deriveKey(config.encryptionPassword, user.iden);
      keyFor = keyId;
      decryptFailure = false;
    }
    try {
      const value = decrypt(key, push.ciphertext);
      decryptFailure = false;
      return value;
    } catch {
      if (!decryptFailure) {
        decryptFailure = true;
        logger.warn('Unable to decrypt a notification: check the encryption password');
      }
      return null;
    }
  }

  /**
   * @description An ephemeral of the stream.
   * @param {object} raw - The `push` object of the stream.
   * @returns {Promise<boolean>} True when a trigger fired.
   */
  async function ephemeral(raw) {
    const config = getConfig();
    if (!config.receiveMirrors) {
      return false;
    }
    const push = open(raw);
    if (push?.type !== 'mirror') {
      return false;
    }
    const at = now();
    const data = mirrorPayload(push, { deviceNameOf, now: at });
    logger.info(`Notification mirrored from ${data.application_name || data.package_name || '?'}`);
    await store.recordMirror({
      kind: 'mirror',
      title: data.title.slice(0, 200),
      body: data.body.slice(0, RECENT_TEXT),
      from: data.application_name || data.package_name,
      at: data.received_at,
    });
    await fire(SCENE_TRIGGERS.NOTIFICATION_MIRRORED, data);
    onReceived();
    return true;
  }

  return {
    sync,
    ephemeral,
    readPushes,
    /** @returns {boolean} Whether an encrypted notification could not be read. */
    decryptFailing: () => decryptFailure,
  };
}

export { createReceiver, MAX_AGE_SECONDS };
