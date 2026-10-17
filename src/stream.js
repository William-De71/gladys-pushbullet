// -----------------------------------------------------------------------------
// The realtime event stream of a Pushbullet account:
// wss://stream.pushbullet.com/websocket/<access token>.
//
// The server sends `nop` every 30 seconds, `tickle` (subtype push or device)
// when something changed on the account, and `push` messages for the
// ephemerals (mirrored notifications, dismissals…). Normal pushes only send a
// tickle: the caller then reads the pushes changed since its cursor.
//
// The stream reconnects by itself: after a close or an error, then when no
// message (not even a nop) came for 95 seconds — a half-open connection
// otherwise stays silent forever. The pause grows from 5 seconds to
// 5 minutes and goes back to 5 seconds once a message arrives.
// -----------------------------------------------------------------------------

const STREAM_URL = 'wss://stream.pushbullet.com/websocket/';
const WATCHDOG_MS = 95_000;
const MIN_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000;

/**
 * @description Create the stream client.
 * @param {object} options - Options.
 * @param {Function} options.getToken - `() => string`.
 * @param {Function} options.onTickle - `(subtype) => void`.
 * @param {Function} options.onEphemeral - `(push) => void`, the `push` object of a push message.
 * @param {Function} [options.onState] - `(connected: boolean) => void`, on each change.
 * @param {Function} [options.WebSocketImpl] - The WebSocket class (global by default).
 * @param {object} [options.timers] - `{ setTimeout, clearTimeout }` (tests).
 * @param {object} options.logger - Logger.
 * @returns {{ start: Function, stop: Function, connected: Function }} The stream.
 * @example
 * const stream = createStream({ getToken, onTickle, onEphemeral, logger });
 * stream.start();
 */
function createStream({
  getToken,
  onTickle,
  onEphemeral,
  onState = () => {},
  WebSocketImpl = globalThis.WebSocket,
  timers = {
    // Unref'd: the stream alone never keeps the process alive (the SDK
    // connection does).
    setTimeout: (callback, ms) => setTimeout(callback, ms).unref(),
    clearTimeout,
  },
  logger,
}) {
  let socket = null;
  let running = false;
  let connected = false;
  let watchdog = null;
  let reconnectTimer = null;
  let backoff = MIN_BACKOFF_MS;

  /**
   * @param {boolean} value - Connected or not.
   */
  function setConnected(value) {
    if (connected !== value) {
      connected = value;
      onState(value);
    }
  }

  /** @description Arm the watchdog again. */
  function feed() {
    timers.clearTimeout(watchdog);
    watchdog = timers.setTimeout(() => {
      logger.warn('No message on the Pushbullet stream for 95 s: reconnecting');
      drop();
      scheduleReconnect();
    }, WATCHDOG_MS);
  }

  /** @description Close the current socket without reconnecting from its events. */
  function drop() {
    timers.clearTimeout(watchdog);
    watchdog = null;
    const current = socket;
    socket = null;
    if (current) {
      current.onopen = null;
      current.onmessage = null;
      current.onerror = null;
      current.onclose = null;
      try {
        current.close();
      } catch {
        // already closed
      }
    }
    setConnected(false);
  }

  /** @description Try again after the current pause, then double it. */
  function scheduleReconnect() {
    if (!running || reconnectTimer) {
      return;
    }
    const delay = backoff;
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    reconnectTimer = timers.setTimeout(() => {
      reconnectTimer = null;
      open();
    }, delay);
  }

  /**
   * @param {string} raw - A message of the stream.
   */
  function handle(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      logger.debug?.('Ignored a stream message that is not JSON');
      return;
    }
    if (message?.type === 'tickle') {
      onTickle(message.subtype);
    } else if (message?.type === 'push' && message.push && typeof message.push === 'object') {
      onEphemeral(message.push);
    }
  }

  /** @description Open a socket. */
  function open() {
    const token = getToken();
    if (!running || !token) {
      return;
    }
    if (typeof WebSocketImpl !== 'function') {
      logger.error('No WebSocket client in this Node.js: the stream is off');
      return;
    }
    let current;
    try {
      current = new WebSocketImpl(`${STREAM_URL}${encodeURIComponent(token)}`);
    } catch (err) {
      logger.warn(`Unable to open the Pushbullet stream: ${err.message}`);
      scheduleReconnect();
      return;
    }
    socket = current;
    feed();
    current.onopen = () => {
      logger.info('Pushbullet stream connected');
      setConnected(true);
      feed();
    };
    current.onmessage = (event) => {
      backoff = MIN_BACKOFF_MS;
      setConnected(true);
      feed();
      handle(typeof event.data === 'string' ? event.data : String(event.data));
    };
    current.onerror = () => {
      // A close event does not always follow an error: start again from
      // here. Never log the URL (it holds the token).
      logger.warn('Pushbullet stream error: reconnecting');
      drop();
      scheduleReconnect();
    };
    current.onclose = (event) => {
      logger.warn(`Pushbullet stream closed (${event?.code ?? '?'}): reconnecting`);
      drop();
      scheduleReconnect();
    };
  }

  return {
    /** @description Connect (again, with the current token). */
    start() {
      running = true;
      backoff = MIN_BACKOFF_MS;
      timers.clearTimeout(reconnectTimer);
      reconnectTimer = null;
      drop();
      open();
    },
    /** @description Disconnect for good. */
    stop() {
      running = false;
      timers.clearTimeout(reconnectTimer);
      reconnectTimer = null;
      drop();
    },
    /** @returns {boolean} Whether the stream is up. */
    connected: () => connected,
  };
}

export { createStream, STREAM_URL, WATCHDOG_MS, MIN_BACKOFF_MS, MAX_BACKOFF_MS };
