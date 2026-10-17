// -----------------------------------------------------------------------------
// What the integration remembers across restarts, in /data/state.json (the
// only writable path of the container):
//
//   month, sent, texts, received, mirrored   counters of the current month
//                                            (account widget), reset each month
//   cursor, seen                             where the reading of the pushes
//                                            stands: a push fires
//                                            `push_received` once, never again
//                                            after a restart
//   recent                                   the last pushes and notifications
//                                            received (recent widget)
//   gladysDeviceIden                         the "Gladys" device created on the
//                                            account, found again after a restart
//
// The cursor is a `modified` timestamp written by the Pushbullet server
// (seconds, float): the local clock is never compared with it.
// A missing or broken file starts empty. Writes go through a temporary file
// and a rename, one after the other.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/state.json';
const MAX_SEEN = 500;
const MAX_RECENT = 20;
const COUNTERS = ['sent', 'texts', 'received', 'mirrored'];

/**
 * @description The month of an instant, 'YYYY-MM' (UTC).
 * @param {number} instant - The instant, in ms.
 * @returns {string} The month.
 * @example
 * monthOf(Date.UTC(2026, 9, 17)); // -> '2026-10'
 */
const monthOf = (instant) => new Date(instant).toISOString().slice(0, 7);

/**
 * @description A fresh state.
 * @param {number} now - Now, in ms.
 * @returns {object} The state.
 */
function emptyState(now) {
  return {
    version: 1,
    month: monthOf(now),
    sent: 0,
    texts: 0,
    received: 0,
    mirrored: 0,
    cursor: null,
    seen: [],
    recent: [],
    gladysDeviceIden: null,
  };
}

/**
 * @description Keep the known fields of a state read from disk.
 * @param {object} data - The parsed file.
 * @param {number} now - Now, in ms.
 * @returns {object} The state.
 */
function sanitize(data, now) {
  const state = emptyState(now);
  if (typeof data?.month === 'string') {
    state.month = data.month;
  }
  COUNTERS.forEach((key) => {
    if (Number.isFinite(data?.[key]) && data[key] >= 0) {
      state[key] = data[key];
    }
  });
  if (Number.isFinite(data?.cursor)) {
    state.cursor = data.cursor;
  }
  if (Array.isArray(data?.seen)) {
    state.seen = data.seen.filter((iden) => typeof iden === 'string').slice(-MAX_SEEN);
  }
  if (Array.isArray(data?.recent)) {
    state.recent = data.recent
      .filter((entry) => entry && typeof entry.kind === 'string' && typeof entry.at === 'string')
      .slice(0, MAX_RECENT);
  }
  if (typeof data?.gladysDeviceIden === 'string') {
    state.gladysDeviceIden = data.gladysDeviceIden;
  }
  return state;
}

/**
 * @description Create the store.
 * @param {object} options - Options.
 * @param {string} [options.path] - The JSON file.
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {object} options.logger - Logger.
 * @returns {object} The store.
 * @example
 * const store = createStore({ logger });
 * await store.load();
 */
function createStore({ path = DEFAULT_PATH, now = () => Date.now(), logger }) {
  let state = emptyState(now());
  let saving = Promise.resolve();

  /** @description A new month starts the counters again. */
  function rollMonth() {
    const month = monthOf(now());
    if (state.month !== month) {
      state.month = month;
      COUNTERS.forEach((key) => {
        state[key] = 0;
      });
    }
  }

  /**
   * @description Write the state (queued, never throws).
   * @returns {Promise<void>} Resolves once written (or failed).
   */
  function save() {
    const content = JSON.stringify(state);
    saving = saving.then(async () => {
      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(`${path}.tmp`, content);
        await rename(`${path}.tmp`, path);
      } catch (err) {
        logger.warn(`Unable to write ${path}: ${err.message}`);
      }
    });
    return saving;
  }

  /**
   * @description Keep an entry for the recent widget.
   * @param {object} entry - kind, title, body, from, url, at.
   */
  function remember(entry) {
    state.recent = [entry, ...state.recent].slice(0, MAX_RECENT);
  }

  return {
    /**
     * @description Read the file; a missing or broken file starts empty.
     * @returns {Promise<void>}
     */
    async load() {
      try {
        state = sanitize(JSON.parse(await readFile(path, 'utf8')), now());
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`Unable to read ${path}: ${err.message}`);
        }
        state = emptyState(now());
      }
      rollMonth();
    },

    /** @returns {{ month: string, sent: number, texts: number, received: number, mirrored: number }} The counters. */
    counters() {
      rollMonth();
      return Object.fromEntries([
        ['month', state.month],
        ...COUNTERS.map((key) => [key, state[key]]),
      ]);
    },

    /**
     * @description Count something the integration sent.
     * @param {'sent'|'texts'} counter - Pushes or texts.
     * @returns {Promise<void>}
     */
    count(counter) {
      rollMonth();
      state[counter] += 1;
      return save();
    },

    /** @returns {number|null} The `modified` the reading of the pushes stands at. */
    cursor: () => state.cursor,

    /**
     * @description Start reading the pushes from a cursor (the history before
     * it never fires).
     * @param {number} cursor - The newest `modified` of the account.
     * @returns {Promise<void>}
     */
    startAt(cursor) {
      state.cursor = cursor;
      state.seen = [];
      return save();
    },

    /**
     * @description Move the cursor forward.
     * @param {number} cursor - A newer `modified`.
     * @returns {Promise<void>}
     */
    advance(cursor) {
      if (Number.isFinite(cursor) && (state.cursor === null || cursor > state.cursor)) {
        state.cursor = cursor;
        return save();
      }
      return Promise.resolve();
    },

    /** @description Forget the reading of the pushes (reception off, new account). */
    stop() {
      if (state.cursor === null && state.seen.length === 0) {
        return Promise.resolve();
      }
      state.cursor = null;
      state.seen = [];
      return save();
    },

    /**
     * @param {string} iden - A push iden.
     * @returns {boolean} Whether it was already handled.
     */
    seen: (iden) => state.seen.includes(iden),

    /**
     * @description Remember a push handled, fired or not.
     * @param {string} iden - Its iden.
     * @param {object} [entry] - For the recent widget (pushes that fired).
     * @returns {Promise<void>}
     */
    markSeen(iden, entry) {
      state.seen = [...state.seen.filter((known) => known !== iden), iden].slice(-MAX_SEEN);
      if (entry) {
        rollMonth();
        state.received += 1;
        remember(entry);
      }
      return save();
    },

    /**
     * @description Remember a mirrored notification.
     * @param {object} entry - For the recent widget.
     * @returns {Promise<void>}
     */
    recordMirror(entry) {
      rollMonth();
      state.mirrored += 1;
      remember(entry);
      return save();
    },

    /** @returns {object[]} The last pushes and notifications received, newest first. */
    recent: () => [...state.recent],

    /** @returns {string|null} The iden of the "Gladys" device. */
    gladysDeviceIden: () => state.gladysDeviceIden,

    /**
     * @param {string|null} iden - The iden of the "Gladys" device.
     * @returns {Promise<void>}
     */
    setGladysDeviceIden(iden) {
      if (state.gladysDeviceIden === iden) {
        return Promise.resolve();
      }
      state.gladysDeviceIden = iden;
      return save();
    },

    /** @returns {Promise<void>} Resolves when every write is done (tests, shutdown). */
    flush: () => saving,
  };
}

export { createStore, monthOf, DEFAULT_PATH, MAX_RECENT };
