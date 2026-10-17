// -----------------------------------------------------------------------------
// Dashboard widgets of the Pushbullet integration.
//
//   - `account`  the account at a glance: pushes sent by Gladys this month
//                (colored against the 500 pushes of a free account), pushes
//                and notifications received, devices, the state of the
//                account and of the realtime stream, the "Gladys" device, the
//                texts sent, the last failure, and a test button;
//   - `recent`   the last pushes and mirrored notifications received, newest
//                first; a tap opens the whole text.
//
// The contents come from what the integration already knows (the account and
// devices read at startup, /data/state.json): a widget never calls Pushbullet.
// Every text exists in the four languages (contents are cached per language).
// Budget of a card: 8 components, 1 main one (card-list), 6 tiles, 2 texts of
// which one body, 1 status, 4 buttons.
// -----------------------------------------------------------------------------

import { t, ago } from './i18n.js';

const WIDGETS = Object.freeze({ ACCOUNT: 'account', RECENT: 'recent' });
const WIDGET_ACTIONS = Object.freeze({ TEST_PUSH: 'test_push' });
const FREE_PUSH_LIMIT = 500;
const MAX_RECENT_ITEMS = 8;
const TTL = { account: 300, recent: 60, message: 30 };

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 * @example
 * clip('A very long title', 10); // -> 'A very lo…'
 */
function clip(value, max) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 */
function messageContent(message, ttl = TTL.message) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: clip(message, 300) }],
  };
}

/**
 * @description The color of the "sent" tile, against the free plan limit.
 * @param {number} sent - Pushes sent by Gladys this month.
 * @returns {string} The color.
 */
function sentColor(sent) {
  if (sent >= FREE_PUSH_LIMIT) {
    return 'danger';
  }
  return sent >= FREE_PUSH_LIMIT * 0.8 ? 'warning' : 'primary';
}

/**
 * @description The `account` widget.
 * @param {object} options - Options.
 * @param {object} options.snapshot - What the integration knows (app.js).
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now, in ms.
 * @returns {object} The content.
 * @example
 * buildAccountWidget({ snapshot, language: 'fr', now: Date.now() });
 */
function buildAccountWidget({ snapshot, language, now }) {
  const {
    user,
    devices,
    readFailure,
    counters,
    stream,
    gladysDevice,
    lastFailure,
    receiving,
    decryptFailing,
  } = snapshot;
  if (!user && !readFailure) {
    return messageContent(t('notReadYet', language));
  }

  const components = [];
  if (user) {
    components.push({
      type: 'text',
      variant: 'caption',
      text: clip(user.name ? `${user.name} · ${user.email}` : user.email, 80),
    });
  }
  components.push({
    type: 'value',
    value: counters.sent,
    label: t('tileSent', language),
    icon: 'send',
    color: sentColor(counters.sent),
  });
  if (receiving) {
    components.push({
      type: 'value',
      value: counters.received + counters.mirrored,
      label: t('tileReceived', language),
      icon: 'inbox',
      color: 'info',
    });
  }
  if (devices) {
    components.push({
      type: 'value',
      value: devices.length,
      label: t('tileDevices', language),
      icon: 'smartphone',
      color: 'neutral',
    });
  }

  const rows = [
    {
      label: t('rowConnection', language),
      value: clip(
        readFailure ? t(`reason_${readFailure}`, language) : t('connectionOk', language),
        40,
      ),
      color: readFailure ? 'danger' : 'success',
    },
  ];
  if (stream === 'off') {
    rows.push({
      label: t('rowStream', language),
      value: t('streamOff', language),
      color: 'neutral',
    });
  } else {
    rows.push({
      label: t('rowStream', language),
      value: t(stream === 'up' ? 'streamOn' : 'streamDown', language),
      color: stream === 'up' ? 'success' : 'warning',
    });
  }
  rows.push({
    label: t('rowGladysDevice', language),
    value: gladysDevice ? clip(gladysDevice, 40) : t('streamOff', language),
    color: gladysDevice ? 'primary' : 'neutral',
  });
  if (counters.texts > 0) {
    rows.push({ label: t('rowTexts', language), value: counters.texts, color: 'neutral' });
  }
  rows.push({
    label: t('rowLimit', language),
    value: t('limitValue', language),
    color: sentColor(counters.sent) === 'primary' ? 'neutral' : sentColor(counters.sent),
  });
  if (decryptFailing) {
    rows.push({
      label: t('rowEncryption', language),
      value: t('encryptionWrong', language),
      color: 'danger',
    });
  }
  if (lastFailure) {
    rows.push({
      label: clip(t('rowLastFailure', language, { ago: ago(lastFailure.at, now, language) }), 40),
      value: clip(t(`reason_${lastFailure.reason}`, language), 40),
      color: 'warning',
    });
  }
  components.push({ type: 'status', items: rows });

  if (user) {
    components.push({
      type: 'button',
      label: t('buttonTest', language),
      icon: 'send',
      style: 'secondary',
      // The language travels in the params: a widget action does not get it.
      action: { key: WIDGET_ACTIONS.TEST_PUSH, params: { language } },
    });
  }

  return { ttl_seconds: TTL.account, components };
}

/**
 * @description The `recent` widget.
 * @param {object} options - Options.
 * @param {object[]} options.entries - The last pushes and notifications, newest first.
 * @param {object} options.counters - The counters of the month.
 * @param {boolean} options.receiving - Whether a reception is on.
 * @param {string} options.language - The user language.
 * @returns {object} The content.
 * @example
 * buildRecentWidget({ entries, counters, receiving: true, language: 'en' });
 */
function buildRecentWidget({ entries, counters, receiving, language }) {
  if (!receiving) {
    return messageContent(t('recentDisabled', language), TTL.recent);
  }
  if (entries.length === 0) {
    return messageContent(t('recentEmpty', language), TTL.recent);
  }
  return {
    ttl_seconds: TTL.recent,
    components: [
      {
        type: 'text',
        variant: 'caption',
        text: clip(
          t('recentCaption', language, { pushes: counters.received, mirrors: counters.mirrored }),
          80,
        ),
      },
      {
        type: 'card-list',
        display: 'list',
        // In a list, the date takes the place of the subtitle: the sender
        // or the application goes in the badge.
        items: entries.slice(0, MAX_RECENT_ITEMS).map((entry) => {
          const title = entry.title || entry.body || t('untitled', language);
          return {
            title: clip(title, 60),
            date: entry.at,
            badge: {
              text: clip(
                entry.from || t(entry.kind === 'mirror' ? 'badgeMirror' : 'badgePush', language),
                16,
              ),
              color: entry.kind === 'mirror' ? 'info' : 'primary',
            },
            description: [entry.title, entry.body, entry.url]
              .filter(Boolean)
              .join('\n\n')
              .slice(0, 2000),
          };
        }),
      },
    ],
  };
}

export {
  buildAccountWidget,
  buildRecentWidget,
  WIDGETS,
  WIDGET_ACTIONS,
  FREE_PUSH_LIMIT,
  sentColor,
  clip,
};
