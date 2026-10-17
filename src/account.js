// -----------------------------------------------------------------------------
// The Pushbullet account of the integration: who it is, its devices, the
// "Gladys" device, and every way the integration sends something.
//
//   - A push goes to every device of the account (no target), to one device
//     (by nickname or iden), to another person (by e-mail: a Pushbullet user
//     gets a push, anyone else an e-mail) or to a channel the account owns.
//   - A notification of Gladys (onSendMessage) goes to the e-mail of the
//     user's "My account" block. When that e-mail is the one of the account
//     itself, the push goes to its devices (all, or the one the user chose)
//     instead of to "itself by e-mail".
//   - Every push carries a `guid` starting with `gladys-`: a retried push is
//     not created twice, and the stream recognizes the pushes Gladys sent (they
//     never fire `push_received`).
//   - An image attached by Gladys (a camera snapshot) is uploaded and sent as
//     a file push.
//   - A text (SMS) is queued on an Android phone of the account.
//
// The user and the devices are read once and kept: the device list is read
// again on a `device` tickle, on a configuration change, or when a device
// name is not found.
// -----------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { PushbulletError, FAILURE_REASONS } from './pushbullet-api.js';

const GUID_PREFIX = 'gladys-';
const DEVICE_MODEL = 'Gladys Assistant';
const DEVICE_MANUFACTURER = 'Gladys Assistant';
const MAX_TITLE = 250;
const MAX_BODY = 4096;
const MAX_ADDRESSES = 10;

/**
 * @description A new guid for a push or a text.
 * @returns {string} The guid.
 */
const newGuid = () => `${GUID_PREFIX}${randomUUID()}`;

/**
 * @description Whether a push was sent by the integration.
 * @param {object} push - A push of the API.
 * @returns {boolean} True for a push of Gladys.
 */
const isOwnPush = (push) => typeof push?.guid === 'string' && push.guid.startsWith(GUID_PREFIX);

/**
 * @description A device name compared without case nor surrounding spaces.
 * @param {string} name - The name.
 * @returns {string} The comparable name.
 */
const comparable = (name) =>
  String(name ?? '')
    .trim()
    .toLowerCase();

/**
 * @description The name of a device as Pushbullet shows it.
 * @param {object} device - A device of the API.
 * @returns {string} Its name.
 */
function deviceName(device) {
  return (
    device?.nickname ||
    [device?.manufacturer, device?.model].filter(Boolean).join(' ') ||
    device?.iden ||
    '?'
  );
}

/**
 * @description Read an image attached by Gladys: "image/jpeg;base64,…",
 * "data:image/png;base64,…" or raw base64.
 * @param {string} file - The attachment.
 * @returns {{ bytes: Buffer, type: string, name: string }|null} The file, null when empty.
 * @example
 * parseAttachment('image/png;base64,iVBORw0KGgo=');
 */
function parseAttachment(file) {
  if (typeof file !== 'string' || file.trim() === '') {
    return null;
  }
  const match = /^(?:data:)?([\w.+-]+\/[\w.+-]+);base64,/.exec(file);
  const payload = match ? file.slice(match[0].length) : file;
  const bytes = Buffer.from(payload, 'base64');
  if (bytes.length === 0) {
    return null;
  }
  let type = match?.[1];
  if (!type) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) {
      type = 'image/png';
    } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      type = 'image/jpeg';
    } else {
      type = 'application/octet-stream';
    }
  }
  // Gladys says "image/jpg" for its camera images.
  if (type === 'image/jpg') {
    type = 'image/jpeg';
  }
  const extension =
    { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type] ?? 'bin';
  return { bytes, type, name: `gladys.${extension}` };
}

/**
 * @description Split a list of phone numbers ("+33612345678, +33698765432").
 * @param {string} value - The numbers.
 * @returns {string[]} The numbers, spaces and dots removed.
 * @example
 * parseAddresses('+33 6 12 34 56 78, 0698765432'); // -> ['+33612345678', '0698765432']
 */
function parseAddresses(value) {
  return String(value ?? '')
    .split(/[,;\n]/)
    .map((entry) => entry.replace(/[\s.()-]/g, ''))
    .filter((entry) => /^\+?\d{3,20}$/.test(entry))
    .slice(0, MAX_ADDRESSES);
}

/**
 * @description Create the account.
 * @param {object} options - Options.
 * @param {object} options.api - createPushbulletClient.
 * @param {Function} options.getConfig - `() => config`.
 * @returns {object} The account.
 * @example
 * const account = createAccount({ api, getConfig: () => config });
 * await account.user();
 */
function createAccount({ api, getConfig }) {
  let user = null;
  let devices = null;
  let gladysDevice = null;

  /** @returns {Promise<object>} The user of the token. */
  async function readUser() {
    if (!user) {
      user = await api.me();
    }
    return user;
  }

  /**
   * @param {boolean} [fresh] - Read again from Pushbullet.
   * @returns {Promise<object[]>} The active devices.
   */
  async function readDevices(fresh = false) {
    if (!devices || fresh) {
      devices = await api.devices();
    }
    return devices;
  }

  /**
   * @description Find a device by iden or name; reads the list again once
   * when the name is unknown (a device renamed or added since).
   * @param {string} wanted - Its name (any case) or iden.
   * @param {object} [options] - Options.
   * @param {boolean} [options.sms] - Only devices able to send texts.
   * @returns {Promise<object>} The device.
   */
  async function findDevice(wanted, { sms = false } = {}) {
    const name = comparable(wanted);
    const pick = (list) =>
      list.find(
        (device) =>
          (!sms || device.has_sms === true || device.has_sms === 'true') &&
          (device.iden === String(wanted).trim() || comparable(device.nickname) === name),
      ) ??
      list.find((device) => (!sms || device.has_sms) && comparable(deviceName(device)) === name);
    let found = pick(await readDevices());
    if (!found) {
      found = pick(await readDevices(true));
    }
    if (!found) {
      throw new PushbulletError(`No Pushbullet device named "${String(wanted).slice(0, 60)}"`, {
        reason: FAILURE_REASONS.INVALID_TARGET,
      });
    }
    return found;
  }

  /**
   * @description Send a push to a target.
   * @param {object} content - title, body, url, attachment.
   * @param {object} target - `{}` (all devices), `{ device_iden }`, `{ email }` or `{ channel_tag }`.
   * @returns {Promise<object>} The push created.
   */
  async function push({ title, body, url, attachment }, target = {}) {
    const config = getConfig();
    const base = {
      guid: newGuid(),
      title: String(title ?? config.title).slice(0, MAX_TITLE),
      body: String(body ?? '').slice(0, MAX_BODY),
      ...target,
      ...(gladysDevice ? { source_device_iden: gladysDevice.iden } : {}),
    };
    if (attachment) {
      const file = await api.upload(attachment);
      return api.createPush({ ...base, type: 'file', ...file });
    }
    if (url) {
      return api.createPush({ ...base, type: 'link', url: String(url) });
    }
    return api.createPush({ ...base, type: 'note' });
  }

  return {
    /** @returns {Promise<object>} The user of the token. */
    user: readUser,

    /** @returns {object|null} The user, when already read. */
    knownUser: () => user,

    /**
     * @param {boolean} [fresh] - Read again.
     * @returns {Promise<object[]>} The devices of the account.
     */
    devices: readDevices,

    /** @returns {object[]|null} The devices, when already read. */
    knownDevices: () => devices,

    /** @returns {object|null} The "Gladys" device, once ensured. */
    gladysDevice: () => gladysDevice,

    /** @description Forget what was read (new token). */
    reset() {
      user = null;
      devices = null;
      gladysDevice = null;
    },

    /** @description Forget the devices (a `device` tickle). */
    forgetDevices() {
      devices = null;
    },

    /**
     * @description Find or create the "Gladys" device of the account, so that
     * the pushes of Gladys show where they come from and the user can send a
     * push to Gladys from their phone. The device of a previous run is found
     * by its iden, then by its model and name.
     * @param {string} [knownIden] - The iden remembered in /data.
     * @returns {Promise<object>} The device.
     */
    async ensureGladysDevice(knownIden) {
      const config = getConfig();
      const list = await readDevices(true);
      let device =
        list.find((entry) => knownIden && entry.iden === knownIden) ??
        list.find(
          (entry) =>
            entry.model === DEVICE_MODEL &&
            comparable(entry.nickname) === comparable(config.deviceName),
        );
      if (!device) {
        device = await api.createDevice({
          nickname: config.deviceName,
          model: DEVICE_MODEL,
          manufacturer: DEVICE_MANUFACTURER,
          icon: 'system',
        });
        devices = [device, ...list];
      }
      gladysDevice = device;
      return device;
    },

    /** @description Stop using the "Gladys" device (turned off in the configuration). */
    forgetGladysDevice() {
      gladysDevice = null;
    },

    findDevice,
    push,

    /**
     * @description Deliver a notification of Gladys to a user.
     * @param {{ email: string, device: string }} target - contactTarget.
     * @param {object} message - `{ text, file }`.
     * @returns {Promise<object>} The push created.
     */
    async notify(target, message) {
      if (!target.email) {
        throw new PushbulletError('The e-mail of the user is not a valid e-mail address', {
          reason: FAILURE_REASONS.INVALID_TARGET,
        });
      }
      const me = await readUser();
      const own = target.email === String(me.email_normalized ?? me.email ?? '').toLowerCase();
      let destination = { email: target.email };
      if (own) {
        destination = target.device ? { device_iden: (await findDevice(target.device)).iden } : {};
      }
      return push(
        { body: message?.text ?? '', attachment: parseAttachment(message?.file) },
        destination,
      );
    },

    /**
     * @description Queue a text (SMS) on an Android phone of the account.
     * @param {object} options - Options.
     * @param {string} [options.device] - The phone (name or iden); the first phone able to text when empty.
     * @param {string[]} options.addresses - The numbers.
     * @param {string} options.message - The text.
     * @returns {Promise<{ text: object, device: object }>} The text and the phone.
     */
    async text({ device, addresses, message }) {
      let phone;
      if (device) {
        phone = await findDevice(device, { sms: true });
      } else {
        const list = await readDevices();
        phone = list.find((entry) => entry.has_sms === true || entry.has_sms === 'true');
        if (!phone) {
          throw new PushbulletError('No Android phone able to send texts on the account', {
            reason: FAILURE_REASONS.INVALID_TARGET,
          });
        }
      }
      const created = await api.createText({
        target_device_iden: phone.iden,
        addresses,
        message: String(message ?? '').slice(0, MAX_BODY),
        guid: newGuid(),
      });
      return { text: created, device: phone };
    },
  };
}

export {
  createAccount,
  isOwnPush,
  deviceName,
  parseAttachment,
  parseAddresses,
  newGuid,
  GUID_PREFIX,
  DEVICE_MODEL,
};
