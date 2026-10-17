// -----------------------------------------------------------------------------
// The handlers of src/app.js, driven by the fake Gladys of the SDK (the real
// GladysIntegration with an in-memory Gladys, so payloads are checked the way
// the core checks them) against a fake Pushbullet and a fake stream. Nothing
// touches the network; the state file lives in a temporary directory.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCipheriv, randomBytes } from 'node:crypto';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp } from '../src/app.js';
import { deriveKey } from '../src/crypto.js';
import {
  createFakePushbullet,
  createFakeWebSocket,
  TOKEN,
  USER,
} from './helpers/fake-pushbullet.js';

const manifest = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const CONTACT = { email: 'Jane@Example.com' };
const MESSAGE = { text: 'The front door is open', file: null };
const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A connected fake Gladys running the integration against a fake Pushbullet.
 * @param {object} [options] - Options.
 * @param {object} [options.config] - Configuration values on top of the token.
 * @param {object} [options.pushbullet] - Options of createFakePushbullet.
 * @param {string} [options.statePath] - The state file (a new temporary one by default).
 * @returns {Promise<object>} `{ gladys, pb, ws, app, statePath }`.
 */
async function start({ config = {}, pushbullet = {}, statePath } = {}) {
  const path = statePath ?? join(await mkdtemp(join(tmpdir(), 'pushbullet-')), 'state.json');
  const pb = createFakePushbullet(pushbullet);
  const ws = createFakeWebSocket();
  const gladys = createFakeGladys({ config: { access_token: TOKEN, ...config } });
  const app = createApp(gladys, {
    transport: pb.transport,
    WebSocketImpl: ws.WebSocketImpl,
    statePath: path,
    wait: async () => {},
    timers: false,
    logger: silent,
  });
  await gladys.connect();
  return { gladys, pb, ws, app, statePath: path };
}

/**
 * @description Check a scene event against its manifest declaration.
 * @param {object} event - `{ key, data }`.
 */
function assertDeclared(event) {
  const trigger = byKey(manifest.scene_triggers).get(event.key);
  assert.ok(trigger, event.key);
  const variables = trigger.variables.map((variable) => variable.key);
  const fields = (trigger.fields ?? []).map((field) => field.key);
  assert.deepEqual(
    Object.keys(event.data).sort(),
    [...new Set([...variables, ...fields])].sort(),
    event.key,
  );
  assert.ok(Object.keys(event.data).length <= 30);
  for (const value of Object.values(event.data)) {
    assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value));
    if (typeof value === 'string') {
      assert.ok(value.length <= 1000);
    }
  }
}

/**
 * @description Let the stream handlers (not awaited) run.
 * @returns {Promise<void>}
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test('connects: reads the account, creates the "Gladys" device once, opens the stream', async () => {
  const { gladys, pb, ws, app, statePath } = await start();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(
    gladys.fake.connectionStatus.message.fr,
    'Connecté au compte Pushbullet Jane@Example.com (3 appareils).',
  );
  const created = pb.calls.filter((call) => call.method === 'POST' && call.path === '/v2/devices');
  assert.equal(created.length, 1);
  assert.deepEqual(created[0].body, {
    nickname: 'Gladys',
    model: 'Gladys Assistant',
    manufacturer: 'Gladys Assistant',
    icon: 'system',
  });
  assert.equal(ws.sockets.length, 1);
  assert.equal(ws.sockets[0].url, `wss://stream.pushbullet.com/websocket/${TOKEN}`);
  await app.store.flush();

  // A restart finds the device again, by its iden.
  const again = await start({ statePath, pushbullet: { devices: pb.state.devices } });
  assert.equal(
    again.pb.calls.filter((call) => call.path === '/v2/devices' && call.method === 'POST').length,
    0,
  );
  assert.equal(again.app.account.gladysDevice().iden, app.account.gladysDevice().iden);
  app.stream.stop();
  again.app.stream.stop();
});

test('without a token: disconnected with a message in four languages, no Pushbullet call', async () => {
  const pb = createFakePushbullet();
  const ws = createFakeWebSocket();
  const gladys = createFakeGladys({ config: {} });
  createApp(gladys, {
    transport: pb.transport,
    WebSocketImpl: ws.WebSocketImpl,
    statePath: '/nonexistent/state.json',
    timers: false,
    logger: silent,
  });
  await gladys.connect();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.deepEqual(Object.keys(gladys.fake.connectionStatus.message).sort(), [
    'de',
    'en',
    'es',
    'fr',
  ]);
  assert.equal(pb.calls.length, 0);
  assert.equal(ws.sockets.length, 0);
});

test('refused token: disconnected with the reason, no stream reconnecting forever', async () => {
  const { gladys, ws } = await start({ config: { access_token: 'o.revoked' } });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refuses the access token/);
  assert.equal(ws.sockets.length, 0);
});

test('a message to the user of the account goes to all its devices, with the configured title', async () => {
  const { gladys, pb, app } = await start({ config: { title: 'Maison' } });
  const ack = await gladys.fake.sendMessage(CONTACT, MESSAGE);
  assert.equal(ack.success, true);
  const [push] = pb.sent();
  assert.equal(push.type, 'note');
  assert.equal(push.title, 'Maison');
  assert.equal(push.body, 'The front door is open');
  assert.equal(push.email, undefined);
  assert.equal(push.device_iden, undefined);
  assert.match(push.guid, /^gladys-/);
  assert.equal(push.source_device_iden, app.account.gladysDevice().iden);
  assert.equal(app.store.counters().sent, 1);
  assert.deepEqual(gladys.fake.sceneEvents, []);
  app.stream.stop();
});

test('a message to one device of the account, or to another Pushbullet user by e-mail', async () => {
  const { gladys, pb, app } = await start();
  await gladys.fake.sendMessage({ email: 'jane@example.com', device: 'pixel 8' }, MESSAGE);
  await gladys.fake.sendMessage({ email: 'Paul@Example.com', device: 'Pixel 8' }, MESSAGE);
  const [toDevice, toPaul] = pb.sent();
  assert.equal(toDevice.device_iden, 'devPhone');
  assert.equal(toPaul.email, 'paul@example.com');
  assert.equal(toPaul.device_iden, undefined, 'the devices of another account are not ours');
  app.stream.stop();
});

test('an image attached by Gladys is uploaded and sent as a file push', async () => {
  const { gladys, pb, app } = await start();
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
  const ack = await gladys.fake.sendMessage(CONTACT, {
    text: 'Motion in the garden',
    file: `image/png;base64,${png}`,
  });
  assert.equal(ack.success, true);
  const request = pb.calls.find((call) => call.path === '/v2/upload-request');
  assert.deepEqual(request.body, { file_name: 'gladys.png', file_type: 'image/png' });
  assert.equal(pb.state.uploads.length, 1);
  const [push] = pb.sent();
  assert.equal(push.type, 'file');
  assert.equal(push.file_type, 'image/png');
  assert.match(push.file_url, /^https:\/\/dl\.pushbulletusercontent\.com\//);
  assert.equal(push.body, 'Motion in the garden');
  app.stream.stop();
});

test('a refused push fails the message and fires push_not_sent once, until a push goes through', async () => {
  const { gladys, pb, app } = await start();
  const quota = {
    status: 403,
    body: {
      error: { type: 'invalid_request', message: 'Account has reached the monthly push limit.' },
    },
  };
  for (let i = 0; i < 3; i += 1) {
    pb.fail('POST', '/v2/pushes', quota);
    const ack = await gladys.fake.sendMessage(CONTACT, MESSAGE);
    assert.equal(ack.success, false);
  }
  assert.equal(gladys.fake.sceneEvents.length, 1);
  const [event] = gladys.fake.sceneEvents;
  assertDeclared(event);
  assert.equal(event.data.reason, 'quota_exceeded');
  assert.equal(event.data.status, 403);
  assert.equal(event.data.target, 'j***@example.com');
  assert.ok(!JSON.stringify(event).includes(TOKEN));
  // A push goes through: the next failure fires again.
  assert.equal((await gladys.fake.sendMessage(CONTACT, MESSAGE)).success, true);
  pb.fail('POST', '/v2/pushes', quota);
  await gladys.fake.sendMessage(CONTACT, MESSAGE);
  assert.equal(gladys.fake.sceneEvents.length, 2);
  app.stream.stop();
});

test('a server error is retried once with the same guid: the push is not created twice', async () => {
  const { gladys, pb, app } = await start();
  pb.fail('POST', '/v2/pushes', { status: 502, body: {} });
  const ack = await gladys.fake.sendMessage(CONTACT, MESSAGE);
  assert.equal(ack.success, true);
  const [first, second] = pb.sent();
  assert.equal(first.guid, second.guid);
  assert.equal(pb.state.pushes.length, 1);
  app.stream.stop();
});

test('an unknown device of a user fires for that user only', async () => {
  const { gladys, app } = await start();
  await gladys.fake.sendMessage({ email: 'jane@example.com', device: 'Old phone' }, MESSAGE);
  await gladys.fake.sendMessage({ email: 'jane@example.com', device: 'Old phone' }, MESSAGE);
  assert.equal(gladys.fake.sceneEvents.length, 1);
  assert.equal(gladys.fake.sceneEvents[0].data.reason, 'invalid_target');
  app.stream.stop();
});

test('push_received: history skipped, new pushes fire once, never those of Gladys nor old ones', async () => {
  const { gladys, pb, ws, app, statePath } = await start();
  pb.addPush({ title: 'Old', body: 'history' });
  const socket = ws.sockets[0];
  socket.open();
  await settle();
  assert.equal(gladys.fake.sceneEvents.length, 0, 'the history never fires');

  // Gladys sends a push: its tickle never fires.
  await gladys.fake.sendMessage(CONTACT, MESSAGE);
  socket.receive({ type: 'tickle', subtype: 'push' });
  await settle();
  assert.equal(gladys.fake.sceneEvents.length, 0);

  // The user shares a link to the "Gladys" device from the phone.
  const gladysIden = app.account.gladysDevice().iden;
  pb.addPush({
    type: 'link',
    title: 'Garage ouvert ?',
    body: 'Ferme-le',
    url: 'https://example.com',
    source_device_iden: 'devPhone',
    target_device_iden: gladysIden,
  });
  socket.receive({ type: 'tickle', subtype: 'push' });
  socket.receive({ type: 'tickle', subtype: 'push' });
  await settle();
  assert.equal(gladys.fake.sceneEvents.length, 1);
  const [event] = gladys.fake.sceneEvents;
  assertDeclared(event);
  assert.equal(event.key, 'push_received');
  assert.equal(event.data.type, 'link');
  assert.equal(event.data.keyword, 'GARAGE');
  assert.equal(event.data.origin, 'self');
  assert.equal(event.data.target, 'gladys');
  assert.equal(event.data.source_device, 'Pixel 8');
  assert.equal(event.data.sender_email, 'jane@example.com');
  assert.equal(event.data.url, 'https://example.com');

  // Another person, then a push found more than 15 minutes late.
  pb.addPush({ title: 'Hi', direction: 'incoming', sender_email_normalized: 'paul@example.com' });
  const late = pb.addPush({ title: 'Late' });
  pb.state.clock += 20 * 60;
  pb.addPush({ title: 'Now' });
  socket.receive({ type: 'tickle', subtype: 'push' });
  await settle();
  const titles = gladys.fake.sceneEvents.map((e) => e.data.title);
  assert.deepEqual(titles, ['Garage ouvert ?', 'Now']);
  assert.ok(app.store.seen(late.iden));
  await app.store.flush();
  const saved = JSON.parse(await readFile(statePath, 'utf8'));
  assert.equal(saved.received, 2);
  assert.equal(saved.recent[0].title, 'Now');
  assert.ok(!JSON.stringify(saved).includes(TOKEN));
  app.stream.stop();
});

test('a dismissed old push (modified, not new) never fires; a restart fires nothing again', async () => {
  const first = await start();
  first.ws.sockets[0].open();
  await settle();
  const push = first.pb.addPush({ title: 'One' });
  first.ws.sockets[0].receive({ type: 'tickle', subtype: 'push' });
  await settle();
  assert.equal(first.gladys.fake.sceneEvents.length, 1);
  push.dismissed = true;
  push.modified = first.pb.state.clock += 5;
  first.ws.sockets[0].receive({ type: 'tickle', subtype: 'push' });
  await settle();
  assert.equal(first.gladys.fake.sceneEvents.length, 1);
  await first.app.store.flush();
  first.app.stream.stop();

  const second = await start({
    statePath: first.statePath,
    pushbullet: { devices: first.pb.state.devices },
  });
  second.pb.state.pushes = first.pb.state.pushes;
  second.pb.state.clock = first.pb.state.clock;
  second.ws.sockets[0].open();
  await settle();
  assert.equal(second.gladys.fake.sceneEvents.length, 0);
  second.app.stream.stop();
});

test('notification_mirrored: plain and end-to-end encrypted, off by default', async () => {
  const off = await start();
  off.ws.sockets[0].open();
  off.ws.sockets[0].receive({
    type: 'push',
    push: { type: 'mirror', title: 'x', application_name: 'App' },
  });
  await settle();
  assert.equal(off.gladys.fake.sceneEvents.length, 0);
  off.app.stream.stop();

  const { gladys, ws, app } = await start({
    config: { receive_mirrors: true, receive_pushes: false, encryption_password: 'hunter2' },
  });
  const socket = ws.sockets[0];
  socket.open();
  const mirror = {
    type: 'mirror',
    application_name: 'WhatsApp',
    package_name: 'com.whatsapp',
    title: 'Maman',
    body: 'Tu rentres quand ?',
    source_device_iden: 'devPhone',
    notification_id: '-8',
  };
  socket.receive({ type: 'push', push: mirror });
  // The same notification, encrypted with the key of the account.
  const key = deriveKey('hunter2', USER.iden);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify({ ...mirror, title: 'Papa' })),
    cipher.final(),
  ]);
  const ciphertext = Buffer.concat([Buffer.from('1'), cipher.getAuthTag(), iv, data]).toString(
    'base64',
  );
  socket.receive({ type: 'push', push: { encrypted: true, ciphertext } });
  // Dismissals and clipboard are ignored.
  socket.receive({ type: 'push', push: { type: 'dismissal', notification_id: '-8' } });
  socket.receive({ type: 'push', push: { type: 'clip', body: 'copied' } });
  await settle();
  assert.equal(gladys.fake.sceneEvents.length, 2);
  for (const event of gladys.fake.sceneEvents) {
    assertDeclared(event);
    assert.equal(event.key, 'notification_mirrored');
    assert.equal(event.data.application_name, 'WhatsApp');
    assert.equal(event.data.source_device, 'Pixel 8');
  }
  assert.deepEqual(
    gladys.fake.sceneEvents.map((event) => event.data.title),
    ['Maman', 'Papa'],
  );
  assert.equal(app.store.counters().mirrored, 2);
  app.stream.stop();
});

test('a wrong encryption password: nothing fires, the account widget says so', async () => {
  const { gladys, ws, app } = await start({
    config: { receive_mirrors: true, encryption_password: 'wrong' },
  });
  ws.sockets[0].open();
  const key = deriveKey('right', USER.iden);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update('{"type":"mirror"}'), cipher.final()]);
  const ciphertext = Buffer.concat([Buffer.from('1'), cipher.getAuthTag(), iv, data]).toString(
    'base64',
  );
  ws.sockets[0].receive({ type: 'push', push: { encrypted: true, ciphertext } });
  await settle();
  assert.equal(gladys.fake.sceneEvents.length, 0);
  const content = (await gladys.fake.widgetGet('account', { language: 'en' })).data.content;
  const rows = content.components.find((component) => component.type === 'status').items;
  assert.ok(rows.some((row) => row.value === 'wrong password'));
  app.stream.stop();
});

test('the send_push scene action: targets, link, one target at most, declared outputs only', async () => {
  const { gladys, pb, ws, app } = await start();
  const declared = byKey(manifest.scene_actions)
    .get('send_push')
    .outputs.map((output) => output.key)
    .sort();

  const all = await gladys.fake.sceneAction('send_push', { message: 'Hello' });
  assert.equal(all.success, true);
  assert.deepEqual(Object.keys(all.data.outputs).sort(), declared);
  assert.equal(all.data.outputs.target, 'all');

  const link = await gladys.fake.sceneAction('send_push', {
    title: 'Camera',
    message: 'Open the stream',
    url: 'https://gladys.local/dashboard',
    device: 'Chrome',
  });
  assert.equal(link.data.outputs.target, 'Chrome');
  const channel = await gladys.fake.sceneAction('send_push', {
    message: 'News',
    channel_tag: 'home',
  });
  assert.equal(channel.data.outputs.target, '#home');

  const sent = pb.sent();
  assert.deepEqual(
    sent.map((push) => [push.type, push.device_iden, push.channel_tag]),
    [
      ['note', undefined, undefined],
      ['link', 'devChrome', undefined],
      ['note', undefined, 'home'],
    ],
  );
  assert.equal(sent[1].url, 'https://gladys.local/dashboard');

  const two = await gladys.fake.sceneAction('send_push', {
    message: 'x',
    device: 'Chrome',
    email: 'a@b.co',
  });
  assert.equal(two.success, false);
  const badEmail = await gladys.fake.sceneAction('send_push', {
    message: 'x',
    email: 'nobody@invalid',
  });
  assert.equal(badEmail.success, false);

  // A scene action never fires a trigger, even through the stream.
  ws.sockets[0].open();
  ws.sockets[0].receive({ type: 'tickle', subtype: 'push' });
  await settle();
  assert.deepEqual(gladys.fake.sceneEvents, []);
  app.stream.stop();
});

test('the send_sms scene action queues a text on the phone able to send them', async () => {
  const { gladys, pb, app } = await start();
  const ack = await gladys.fake.sceneAction('send_sms', {
    phone_numbers: '+33 6 12 34 56 78, 06.98.76.54.32, nope',
    message: 'Dinner is ready',
  });
  assert.equal(ack.success, true);
  assert.deepEqual(Object.keys(ack.data.outputs).sort(), ['device', 'text_iden']);
  assert.equal(ack.data.outputs.device, 'Pixel 8');
  const [text] = pb.state.texts;
  assert.equal(text.data.target_device_iden, 'devPhone');
  assert.deepEqual(text.data.addresses, ['+33612345678', '0698765432']);
  assert.match(text.data.guid, /^gladys-/);
  assert.equal(app.store.counters().texts, 1);

  const none = await gladys.fake.sceneAction('send_sms', { phone_numbers: 'nope', message: 'x' });
  assert.equal(none.success, false);
  const notAPhone = await gladys.fake.sceneAction('send_sms', {
    phone_numbers: '+33612345678',
    message: 'x',
    device: 'Chrome',
  });
  assert.equal(notAPhone.success, false);
  app.stream.stop();
});

test('Configuration screen: test the connection, send a test push in the configured language', async () => {
  const { gladys, pb, app } = await start({ config: { language: 'fr' } });
  const tested = await gladys.fake.action('test_connection');
  assert.equal(tested.success, true);
  assert.match(
    tested.data.message.fr,
    /^Connecté à Jane@Example\.com\. Appareils : .*Pixel 8.*\. Téléphones pouvant envoyer des SMS : Pixel 8\.$/,
  );
  const sent = await gladys.fake.action('send_test_push', { device: 'Pixel 8' });
  assert.equal(sent.data.message.de, 'Test-Push an Pixel 8 gesendet.');
  const [push] = pb.sent();
  assert.equal(push.title, 'Test de Gladys');
  assert.equal(push.device_iden, 'devPhone');
  const unknown = await gladys.fake.action('send_test_push', { device: 'Nope' });
  assert.equal(unknown.data.message.en, 'Test push not sent: unknown device, e-mail or channel.');
  app.stream.stop();
});

test('both widgets are valid in every language; a widget never calls Pushbullet', async () => {
  const { gladys, pb, ws, app } = await start({ config: { receive_mirrors: true } });
  ws.sockets[0].open();
  await settle();
  pb.addPush({ title: 'Courses', body: 'Lait, pain', source_device_iden: 'devChrome' });
  ws.sockets[0].receive({ type: 'tickle', subtype: 'push' });
  await settle();
  ws.sockets[0].receive({
    type: 'push',
    push: { type: 'mirror', application_name: 'Gmail', title: 'Facture' },
  });
  await settle();
  pb.fail('POST', '/v2/pushes', { status: 401, body: {} });
  await gladys.fake.sendMessage(CONTACT, MESSAGE);
  const before = pb.calls.length;
  for (const language of ['en', 'fr', 'de', 'es']) {
    for (const key of ['account', 'recent']) {
      const ack = await gladys.fake.widgetGet(key, { language });
      assert.equal(ack.success, true, `${key} ${language}`);
      assert.deepEqual(validateWidgetContent(ack.data.content), [], `${key} ${language}`);
    }
  }
  assert.equal(pb.calls.length, before);
  const account = (await gladys.fake.widgetGet('account', { language: 'en' })).data.content;
  const rows = account.components.find((component) => component.type === 'status').items;
  assert.ok(
    rows.some((row) => row.label.startsWith('Failure') && row.value === 'access token refused'),
  );
  assert.ok(rows.some((row) => row.label === 'Realtime' && row.value === 'listening'));
  const recent = (await gladys.fake.widgetGet('recent', { language: 'fr' })).data.content;
  const list = recent.components.find((component) => component.type === 'card-list');
  assert.deepEqual(
    list.items.map((item) => item.title),
    ['Facture', 'Courses'],
  );
  app.stream.stop();
});

test('the test button of the widget sends a push in the language of the dashboard', async () => {
  const { gladys, pb, app } = await start();
  const ack = await gladys.fake.widgetAction('account', 'test_push', { language: 'es' });
  assert.equal(ack.success, true);
  assert.equal(
    ack.data.message.es,
    'Push de prueba enviado a todos los dispositivos de la cuenta.',
  );
  assert.equal(pb.sent()[0].title, 'Prueba de Gladys');
  app.stream.stop();
});

test('reception off: no stream, the recent widget says how to turn it on', async () => {
  const { gladys, ws, app } = await start({ config: { receive_pushes: false } });
  assert.equal(ws.sockets.length, 0);
  const ack = await gladys.fake.widgetGet('recent', { language: 'fr' });
  assert.match(ack.data.content.components[0].text, /réception est désactivée/);
  app.stream.stop();
});

test('a new token forgets the cursor and the device of the previous account', async () => {
  const { gladys, ws, app } = await start();
  ws.sockets[0].open();
  await settle();
  assert.notEqual(app.store.cursor(), null);
  const before = app.store.gladysDeviceIden();
  await gladys.fake.configUpdated({ access_token: 'o.other', receive_pushes: true });
  assert.equal(app.store.cursor(), null);
  assert.equal(app.store.gladysDeviceIden(), null);
  assert.ok(before);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  app.stream.stop();
});

test('device off: no device created, pushes carry no source device', async () => {
  const { gladys, pb, app } = await start({ config: { create_device: false } });
  assert.ok(!pb.calls.some((call) => call.method === 'POST' && call.path === '/v2/devices'));
  await gladys.fake.sendMessage(CONTACT, MESSAGE);
  assert.equal(pb.sent()[0].source_device_iden, undefined);
  app.stream.stop();
});

test('shutdown closes the stream', async () => {
  const { gladys, ws } = await start();
  ws.sockets[0].open();
  await gladys.fake.shutdown();
  assert.equal(ws.sockets[0].closed, true);
});
