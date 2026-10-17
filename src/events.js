// -----------------------------------------------------------------------------
// Scene triggers of the Pushbullet integration.
//
//   push_received          a push (note, link or file) arrived on the account
//                          from one of its devices, another person or a
//                          channel. Once per push; never the pushes Gladys
//                          sent, never the history present when the reception
//                          starts, never a push older than 15 minutes found
//                          after an interruption (receiver.js).
//   notification_mirrored  a notification of an Android phone of the account,
//                          mirrored by the Pushbullet app (the phone must have
//                          notification mirroring on).
//   push_not_sent          Gladys could not deliver a notification. One event
//                          per TRANSITION: the first failure fires, the
//                          following ones of the same scope stay silent until
//                          a push goes through again. The scope is the account
//                          (token, quota, Pushbullet down…), or the target for
//                          a target Pushbullet refuses. This keeps a scene that
//                          answers the failure through this same channel from
//                          looping.
//
// A scene ACTION never fires a trigger: its result goes to the scene.
// Event data is flat (scalars only) and holds the declared variables only.
// -----------------------------------------------------------------------------

import { FAILURE_REASONS } from './pushbullet-api.js';

const SCENE_TRIGGERS = Object.freeze({
  PUSH_RECEIVED: 'push_received',
  NOTIFICATION_MIRRORED: 'notification_mirrored',
  PUSH_NOT_SENT: 'push_not_sent',
});

// Who a push comes from (the `origin` filter of push_received).
const ORIGINS = Object.freeze({ SELF: 'self', PERSON: 'person', CHANNEL: 'channel' });
// Where it was sent (the `target` filter).
const TARGETS = Object.freeze({ GLADYS: 'gladys', ALL: 'all', OTHER_DEVICE: 'other_device' });

const ACCOUNT_SCOPE = 'account';
const MAX_DATA_TEXT = 1000;

/**
 * @description A text bounded for an event.
 * @param {any} value - The value.
 * @returns {string} The text ('' when absent).
 */
const bounded = (value) => String(value ?? '').slice(0, MAX_DATA_TEXT);

/**
 * @description The first word of a text, in capitals and without accents nor
 * punctuation: what a scene filters on ("GARAGE", "STATUS").
 * @param {string} message - The text.
 * @returns {string} The keyword, '' when there is none.
 * @example
 * keywordOf(' Garage ouvert ? '); // -> 'GARAGE'
 */
function keywordOf(message) {
  const first = String(message ?? '')
    .trim()
    .split(/\s+/)[0];
  return (first ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .toUpperCase()
    .slice(0, 40);
}

/**
 * @description Mask an e-mail address for the logs and the events of failure.
 * @param {string} email - The address.
 * @returns {string} "j***@example.com".
 * @example
 * maskEmail('jane@example.com'); // -> 'j***@example.com'
 */
function maskEmail(email) {
  const [local, domain] = String(email ?? '').split('@');
  if (!domain) {
    return local ? `${local.slice(0, 1)}***` : '';
  }
  return `${local.slice(0, 1)}***@${domain}`;
}

/**
 * @description Where a push comes from.
 * @param {object} push - A push of the API.
 * @returns {string} One of ORIGINS.
 */
function originOf(push) {
  if (push.channel_iden) {
    return ORIGINS.CHANNEL;
  }
  return push.direction === 'incoming' ? ORIGINS.PERSON : ORIGINS.SELF;
}

/**
 * @description Where a push was sent.
 * @param {object} push - A push of the API.
 * @param {string|null} gladysIden - The iden of the "Gladys" device.
 * @returns {string} One of TARGETS.
 */
function targetOf(push, gladysIden) {
  if (!push.target_device_iden) {
    return TARGETS.ALL;
  }
  return push.target_device_iden === gladysIden ? TARGETS.GLADYS : TARGETS.OTHER_DEVICE;
}

/**
 * @description The payload of `push_received`.
 * @param {object} push - The push.
 * @param {object} context - Context.
 * @param {string|null} context.gladysIden - The iden of the "Gladys" device.
 * @param {Function} context.deviceNameOf - `(iden) => string`, '' when unknown.
 * @returns {object} The event data.
 */
function pushPayload(push, { gladysIden, deviceNameOf }) {
  const title = push.title ?? push.file_name ?? '';
  return {
    type: bounded(push.type),
    title: bounded(title),
    body: bounded(push.body),
    url: bounded(push.url ?? push.file_url),
    file_name: bounded(push.file_name),
    keyword: keywordOf(push.title || push.body),
    origin: originOf(push),
    sender_name: bounded(push.sender_name),
    sender_email: bounded(push.sender_email_normalized ?? push.sender_email).toLowerCase(),
    source_device: bounded(push.source_device_iden ? deviceNameOf(push.source_device_iden) : ''),
    target: targetOf(push, gladysIden),
    received_at: new Date((push.created ?? 0) * 1000).toISOString(),
  };
}

/**
 * @description The payload of `notification_mirrored`.
 * @param {object} mirror - The mirror ephemeral.
 * @param {object} context - Context.
 * @param {Function} context.deviceNameOf - `(iden) => string`.
 * @param {number} context.now - Now, in ms.
 * @returns {object} The event data.
 */
function mirrorPayload(mirror, { deviceNameOf, now }) {
  return {
    application_name: bounded(mirror.application_name),
    package_name: bounded(mirror.package_name),
    title: bounded(mirror.title),
    body: bounded(mirror.body),
    keyword: keywordOf(mirror.title || mirror.body),
    source_device: bounded(
      mirror.source_device_iden ? deviceNameOf(mirror.source_device_iden) : '',
    ),
    received_at: new Date(now).toISOString(),
  };
}

/**
 * @description Track the failures and fire `push_not_sent` on the first one of
 * each scope.
 * @param {object} gladys - The GladysIntegration client.
 * @param {object} logger - Logger.
 * @returns {{ failed: Function, sent: Function }} The tracker.
 * @example
 * const failures = createFailureEvents(gladys, logger);
 * await failures.failed('j***@example.com', err);
 * failures.sent('j***@example.com');
 */
function createFailureEvents(gladys, logger) {
  const failing = new Set();

  return {
    /**
     * @description A notification was not sent: fire the trigger if its scope
     * was not already failing. Never throws.
     * @param {string} target - The masked target.
     * @param {object} err - A PushbulletError.
     * @returns {Promise<void>}
     */
    async failed(target, err) {
      const reason = err.reason ?? FAILURE_REASONS.UNEXPECTED;
      const scope = reason === FAILURE_REASONS.INVALID_TARGET ? `target:${target}` : ACCOUNT_SCOPE;
      if (failing.has(scope)) {
        return;
      }
      failing.add(scope);
      try {
        await gladys.publishSceneEvent(SCENE_TRIGGERS.PUSH_NOT_SENT, {
          reason,
          status: typeof err.status === 'number' ? err.status : null,
          error: bounded(err.message),
          target: bounded(target),
        });
      } catch (eventErr) {
        logger.warn(`Could not fire ${SCENE_TRIGGERS.PUSH_NOT_SENT}: ${eventErr.message}`);
      }
    },

    /**
     * @description A push went through: the account works again, and so does
     * this target.
     * @param {string} target - The masked target.
     */
    sent(target) {
      failing.delete(ACCOUNT_SCOPE);
      failing.delete(`target:${target}`);
    },
  };
}

export {
  SCENE_TRIGGERS,
  ORIGINS,
  TARGETS,
  keywordOf,
  maskEmail,
  originOf,
  targetOf,
  pushPayload,
  mirrorPayload,
  createFailureEvents,
  MAX_DATA_TEXT,
};
