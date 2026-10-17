// -----------------------------------------------------------------------------
// The building blocks: the Pushbullet client (error reasons, retries, upload),
// the end-to-end decryption (vectors of docs.pushbullet.com), the stream
// (reconnection, watchdog), the attachments and phone numbers, the events.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createPushbulletClient,
  reasonOf,
  toPushbulletError,
  FAILURE_REASONS,
} from '../src/pushbullet-api.js';
import { deriveKey, decryptText } from '../src/crypto.js';
import { createStream, WATCHDOG_MS, MIN_BACKOFF_MS, MAX_BACKOFF_MS } from '../src/stream.js';
import { parseAttachment, parseAddresses, isOwnPush, deviceName } from '../src/account.js';
import { keywordOf, maskEmail, originOf, targetOf } from '../src/events.js';
import { normalizeConfig, contactTarget, needsStream } from '../src/config.js';
import { createFakeWebSocket } from './helpers/fake-pushbullet.js';

const silent = { info() {}, warn() {}, error() {}, debug() {} };

test('the error reasons of the Pushbullet answers', () => {
  assert.equal(reasonOf(401, {}, '/v2/pushes'), 'invalid_token');
  assert.equal(reasonOf(403, {}, '/v2/users/me'), 'invalid_token');
  assert.equal(reasonOf(403, {}, '/v2/pushes'), 'rejected');
  assert.equal(
    reasonOf(403, { message: 'Account has reached the monthly push limit.' }, '/v2/pushes'),
    'quota_exceeded',
  );
  assert.equal(
    reasonOf(429, { message: 'Too many requests, rate limited' }, '/v2/pushes'),
    'rate_limited',
  );
  assert.equal(
    reasonOf(429, { message: 'Pushbullet Pro required' }, '/v2/texts'),
    'quota_exceeded',
  );
  assert.equal(
    reasonOf(400, { param: 'email', message: 'Invalid email.' }, '/v2/pushes'),
    'invalid_target',
  );
  assert.equal(reasonOf(400, { message: 'Missing body.' }, '/v2/pushes'), 'rejected');
  assert.equal(reasonOf(404, {}, '/v2/devices/x'), 'not_found');
  // The real answer of a wrong token (checked against api.pushbullet.com).
  assert.equal(
    reasonOf(
      401,
      {
        code: 'invalid_access_token',
        type: 'invalid_request',
        message: 'Access token is missing or invalid.',
      },
      '/v2/users/me',
    ),
    'invalid_token',
  );
  assert.equal(reasonOf(503, {}, '/v2/pushes'), 'server_error');
  assert.equal(
    toPushbulletError(Object.assign(new Error('t'), { name: 'TimeoutError' })).reason,
    'timeout',
  );
  assert.equal(
    toPushbulletError(new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } })).reason,
    'unreachable',
  );
  assert.deepEqual(Object.values(FAILURE_REASONS).sort(), [
    'invalid_target',
    'invalid_token',
    'not_configured',
    'not_found',
    'quota_exceeded',
    'rate_limited',
    'rejected',
    'server_error',
    'timeout',
    'unexpected',
    'unreachable',
  ]);
});

test('the client: token header, JSON body, query, ratelimit, non-JSON answer', async () => {
  const calls = [];
  const api = createPushbulletClient({
    getToken: () => 'o.secret',
    transport: async (url, init) => {
      calls.push({ url, init });
      if (url.includes('/v2/pushes?')) {
        return {
          status: 200,
          headers: { 'x-ratelimit-remaining': '100', 'x-ratelimit-limit': '32768' },
          text: '{"pushes":[{"iden":"a"}]}',
        };
      }
      return { status: 200, headers: {}, text: '<html>' };
    },
  });
  const pushes = await api.pushes({ modifiedAfter: 1700000000.5 });
  assert.deepEqual(pushes, [{ iden: 'a' }]);
  const url = new URL(calls[0].url);
  assert.equal(url.origin, 'https://api.pushbullet.com');
  assert.equal(url.searchParams.get('modified_after'), '1700000000.5');
  assert.equal(url.searchParams.get('active'), 'true');
  assert.equal(calls[0].init.headers['Access-Token'], 'o.secret');
  assert.equal(api.ratelimit().remaining, 100);
  await assert.rejects(
    api.me(),
    (err) => err.reason === 'unexpected' && !err.message.includes('o.secret'),
  );
});

test('the client without a token never calls', async () => {
  let called = false;
  const api = createPushbulletClient({
    getToken: () => '',
    transport: async () => {
      called = true;
    },
  });
  await assert.rejects(api.me(), (err) => err.reason === 'not_configured');
  assert.equal(called, false);
});

test('a push is retried once on a network failure, never on a refusal', async () => {
  let attempts = 0;
  const api = createPushbulletClient({
    getToken: () => 'o.t',
    wait: async () => {},
    transport: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
      }
      return { status: 200, headers: {}, text: '{"iden":"p"}' };
    },
  });
  assert.equal((await api.createPush({ type: 'note', guid: 'gladys-1' })).iden, 'p');
  assert.equal(attempts, 2);

  attempts = 0;
  const refusing = createPushbulletClient({
    getToken: () => 'o.t',
    wait: async () => {},
    transport: async () => {
      attempts += 1;
      return {
        status: 400,
        headers: {},
        text: '{"error":{"message":"Invalid email.","param":"email"}}',
      };
    },
  });
  await assert.rejects(
    refusing.createPush({}),
    (err) => err.reason === 'invalid_target' && err.status === 400,
  );
  assert.equal(attempts, 1);
});

test('the upload: request, multipart POST without the token, then the file fields', async () => {
  const calls = [];
  const api = createPushbulletClient({
    getToken: () => 'o.t',
    transport: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/v2/upload-request')) {
        return {
          status: 200,
          headers: {},
          text: JSON.stringify({
            file_name: 'gladys.jpg',
            file_type: 'image/jpeg',
            file_url: 'https://dl/f.jpg',
            upload_url: 'https://upload.pushbullet.com/u1',
          }),
        };
      }
      return { status: 204, headers: {}, text: '' };
    },
  });
  const file = await api.upload({
    name: 'gladys.jpg',
    type: 'image/jpeg',
    bytes: Buffer.from([0xff, 0xd8]),
  });
  assert.deepEqual(file, {
    file_name: 'gladys.jpg',
    file_type: 'image/jpeg',
    file_url: 'https://dl/f.jpg',
  });
  assert.equal(calls[1].url, 'https://upload.pushbullet.com/u1');
  assert.ok(calls[1].init.body instanceof FormData);
  assert.equal(calls[1].init.headers, undefined, 'the token never goes to the upload server');
});

test('end-to-end decryption: the key and the message of docs.pushbullet.com', () => {
  const key = deriveKey('hunter2', 'up0snaKOsn');
  assert.equal(key.toString('base64'), '1sW28zp7CWv5TtGjlQpDHHG4Cbr9v36fG5o4f74LsKg=');
  assert.equal(decryptText(key, 'MSfJxxY5YdjttlfUkCaKA57qU9SuCN8+ZhYg/xieI+lDnQ=='), 'meow!');
  // A wrong key fails the tag check; another version is refused.
  assert.throws(() =>
    decryptText(
      deriveKey('nope', 'up0snaKOsn'),
      'MSfJxxY5YdjttlfUkCaKA57qU9SuCN8+ZhYg/xieI+lDnQ==',
    ),
  );
  assert.throws(() =>
    decryptText(key, Buffer.from('2abcdefghijklmnopqrstuvwxyz0123').toString('base64')),
  );
});

/**
 * @description Manual timers: the test fires them.
 * @returns {object} `{ timers, pending, fire }`.
 */
function manualTimers() {
  const pending = new Map();
  let next = 1;
  return {
    timers: {
      setTimeout: (callback, ms) => {
        const id = next++;
        pending.set(id, { callback, ms });
        return id;
      },
      clearTimeout: (id) => pending.delete(id),
    },
    pending,
    /** @param {number} ms - Fire the timer of this delay. */
    fire(ms) {
      const [id, timer] = [...pending.entries()].find(([, entry]) => entry.ms === ms) ?? [];
      assert.ok(timer, `no timer of ${ms} ms`);
      pending.delete(id);
      timer.callback();
    },
  };
}

test('the stream: tickles and ephemerals, reconnection with a growing pause, watchdog', () => {
  const ws = createFakeWebSocket();
  const clock = manualTimers();
  const tickles = [];
  const ephemerals = [];
  const states = [];
  const stream = createStream({
    getToken: () => 'o.t',
    onTickle: (subtype) => tickles.push(subtype),
    onEphemeral: (push) => ephemerals.push(push),
    onState: (up) => states.push(up),
    WebSocketImpl: ws.WebSocketImpl,
    timers: clock.timers,
    logger: silent,
  });
  stream.start();
  const [first] = ws.sockets;
  first.open();
  first.receive({ type: 'nop' });
  first.receive({ type: 'tickle', subtype: 'push' });
  first.receive({ type: 'push', push: { type: 'mirror', title: 'x' } });
  first.onmessage({ data: 'not json' });
  assert.deepEqual(tickles, ['push']);
  assert.deepEqual(ephemerals, [{ type: 'mirror', title: 'x' }]);
  assert.equal(stream.connected(), true);

  first.drop();
  assert.equal(stream.connected(), false);
  assert.ok(first.closed);
  clock.fire(MIN_BACKOFF_MS);
  assert.equal(ws.sockets.length, 2);
  ws.sockets[1].drop();
  clock.fire(MIN_BACKOFF_MS * 2);
  assert.equal(ws.sockets.length, 3);

  // An error without a close event reconnects too.
  ws.sockets[2].onerror();
  assert.ok(ws.sockets[2].closed);
  clock.fire(MIN_BACKOFF_MS * 4);
  assert.equal(ws.sockets.length, 4);

  // A silent connection is dropped by the watchdog.
  ws.sockets[3].open();
  ws.sockets[3].receive({ type: 'nop' });
  clock.fire(WATCHDOG_MS);
  assert.ok(ws.sockets[3].closed);
  clock.fire(MIN_BACKOFF_MS);
  assert.equal(ws.sockets.length, 5);
  assert.deepEqual(states, [true, false, true, false]);

  stream.stop();
  assert.ok(ws.sockets[4].closed);
  assert.equal(clock.pending.size, 0);
  assert.ok(MAX_BACKOFF_MS <= 5 * 60_000);
});

test('attachments of Gladys: prefixes, magic bytes, image/jpg', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');
  const jpg = Buffer.from([0xff, 0xd8, 0xff]).toString('base64');
  assert.equal(parseAttachment(`image/png;base64,${png}`).type, 'image/png');
  assert.equal(parseAttachment(`data:image/jpg;base64,${jpg}`).type, 'image/jpeg');
  assert.equal(parseAttachment(jpg).name, 'gladys.jpg');
  assert.equal(parseAttachment(png).type, 'image/png');
  assert.equal(parseAttachment(null), null);
  assert.equal(parseAttachment(''), null);
});

test('phone numbers, own pushes, device names', () => {
  assert.deepEqual(parseAddresses('+33 6 12 34 56 78; 06.98.76.54.32\nabc'), [
    '+33612345678',
    '0698765432',
  ]);
  assert.equal(isOwnPush({ guid: 'gladys-1' }), true);
  assert.equal(isOwnPush({ guid: 'other' }), false);
  assert.equal(deviceName({ manufacturer: 'Google', model: 'Pixel 8' }), 'Google Pixel 8');
  assert.equal(deviceName({ nickname: 'Chrome' }), 'Chrome');
});

test('event helpers: keyword, masked e-mail, origin and target', () => {
  assert.equal(keywordOf(' Éteins la lumière'), 'ETEINS');
  assert.equal(keywordOf(''), '');
  assert.equal(maskEmail('jane@example.com'), 'j***@example.com');
  assert.equal(maskEmail('nope'), 'n***');
  assert.equal(originOf({ channel_iden: 'c' }), 'channel');
  assert.equal(originOf({ direction: 'incoming' }), 'person');
  assert.equal(originOf({ direction: 'self' }), 'self');
  assert.equal(targetOf({}, 'g'), 'all');
  assert.equal(targetOf({ target_device_iden: 'g' }, 'g'), 'gladys');
  assert.equal(targetOf({ target_device_iden: 'x' }, 'g'), 'other_device');
});

test('configuration and contact values', () => {
  const config = normalizeConfig({
    access_token: ' o.t ',
    receive_pushes: 'false',
    language: 'xx',
  });
  assert.equal(config.accessToken, 'o.t');
  assert.equal(config.title, 'Gladys');
  assert.equal(config.language, 'en');
  assert.equal(config.createDevice, true);
  assert.equal(config.receivePushes, false);
  assert.equal(config.receiveMirrors, false);
  assert.equal(needsStream(config), false);
  assert.equal(needsStream(normalizeConfig({ access_token: 'o.t' })), true);
  assert.deepEqual(contactTarget({ email: ' Jane@Example.COM ', device: ' Pixel ' }), {
    email: 'jane@example.com',
    device: 'Pixel',
  });
  assert.deepEqual(contactTarget({ email: 'not an email' }), { email: '', device: '' });
});
