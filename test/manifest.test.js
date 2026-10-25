import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

import { SCENE_TRIGGERS } from '../src/events.js';
import { SCENE_ACTIONS, ACTIONS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import { FAILURE_REASONS } from '../src/pushbullet-api.js';
import { ORIGINS, TARGETS } from '../src/events.js';
import { DEFAULT_TITLE, DEFAULT_DEVICE_NAME, DEFAULT_LANGUAGE } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a send-only communication channel, in lockstep with package.json, at 0.x', () => {
  assert.equal(manifest.type, 'communication');
  assert.deepEqual(manifest.messaging, { receive: false });
  assert.equal(manifest.name, 'Pushbullet');
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/william-de71/gladys-pushbullet:${pkg.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/William-De71/gladys-pushbullet/main/cover.jpg',
  );
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.name, 'gladys-pushbullet');
  // A send-only channel never talks to the brain.
  assert.doesNotMatch(source('../src/app.js'), /publishMessage|linkContact/);
});

test('declares the cloud transport only: the Pushbullet API and stream', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.doesNotMatch(source('../src/app.js'), /publishTransports|GLADYS_PREFER_LOCAL/);
});

test('requires Gladys 5.3.0 (catalog keywords); no extra permission', () => {
  assert.equal(manifest.gladys_version, '>=5.3.0');
  assert.deepEqual(manifest.categories, ['notifications']);
  for (const key of ['location', 'network_wake', 'containers', 'network_discovery', 'webhooks']) {
    assert.equal(manifest[key], undefined, key);
  }
  // No widget button with a form: those need Gladys 5.2.0.
  assert.doesNotMatch(source('../src/widgets.js'), /fields:/);
});

test('declares exactly the scene triggers, actions, widgets and buttons the code handles', () => {
  assert.deepEqual(
    manifest.scene_triggers.map((trigger) => trigger.key).sort(),
    Object.values(SCENE_TRIGGERS).sort(),
  );
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key).sort(),
    Object.values(WIDGETS).sort(),
  );
  const app = source('../src/app.js');
  for (const key of Object.keys(WIDGETS)) {
    assert.match(app, new RegExp(`onWidgetGet\\(WIDGETS\\.${key}`), key);
  }
  for (const key of Object.keys(SCENE_ACTIONS)) {
    assert.match(app, new RegExp(`onSceneAction\\(SCENE_ACTIONS\\.${key}`), key);
  }
  assert.deepEqual(
    manifest.actions.map((action) => action.key),
    Object.values(ACTIONS),
  );
  for (const key of Object.keys(ACTIONS)) {
    assert.match(app, new RegExp(`onAction\\(ACTIONS\\.${key}`), key);
  }
});

test('mirrors the values of the code', () => {
  const config = byKey(manifest.config_schema);
  assert.equal(config.get('access_token').type, 'secret');
  assert.equal(config.get('access_token').required, true);
  assert.equal(config.get('encryption_password').type, 'secret');
  assert.equal(config.get('title').default, DEFAULT_TITLE);
  assert.equal(config.get('device_name').default, DEFAULT_DEVICE_NAME);
  assert.equal(config.get('language').default, DEFAULT_LANGUAGE);
  assert.deepEqual(values(config.get('language')), LANGUAGES);
  assert.equal(config.get('create_device').default, true);
  assert.equal(config.get('receive_pushes').default, true);
  assert.equal(config.get('receive_mirrors').default, false);
  const triggers = byKey(manifest.scene_triggers);
  const notSent = byKey(triggers.get('push_not_sent').fields);
  assert.deepEqual(values(notSent.get('reason')).sort(), Object.values(FAILURE_REASONS).sort());
  const received = byKey(triggers.get('push_received').fields);
  assert.deepEqual(values(received.get('origin')).sort(), Object.values(ORIGINS).sort());
  assert.deepEqual(values(received.get('target')).sort(), Object.values(TARGETS).sort());
  assert.deepEqual(values(received.get('type')).sort(), ['file', 'link', 'note']);
});

test('the per-user block holds the e-mail and an optional device, never a secret', () => {
  const contact = manifest.contact_schema.filter((field) => field.type !== 'section');
  assert.deepEqual(
    contact.map((field) => [field.key, field.type, field.required ?? false]),
    [
      ['email', 'string', true],
      ['device', 'string', false],
    ],
  );
});

test('every trigger field is a key of the event data (the core filters on it)', () => {
  for (const trigger of manifest.scene_triggers) {
    const variables = trigger.variables.map((variable) => variable.key);
    for (const field of trigger.fields ?? []) {
      assert.ok(variables.includes(field.key), `${trigger.key}.${field.key}`);
    }
  }
});

test('limits of the store: counts, timeouts, sizes', () => {
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  assert.ok(manifest.scene_triggers.length <= 20);
  assert.ok(manifest.scene_actions.length <= 20);
  assert.ok(manifest.actions.length <= 10);
  for (const trigger of manifest.scene_triggers) {
    assert.ok((trigger.fields ?? []).length <= 10 && trigger.variables.length <= 20, trigger.key);
    assert.ok(trigger.key.length <= 40);
    for (const field of trigger.fields ?? []) {
      assert.ok(['string', 'number', 'select', 'multi_select'].includes(field.type), field.key);
    }
  }
  for (const action of [...manifest.scene_actions, ...manifest.actions]) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120, action.key);
    assert.ok(
      (action.fields ?? []).length <= 10 && (action.outputs ?? []).length <= 20,
      action.key,
    );
  }
  // The store refuses a manifest of 100 KB or more.
  const size = statSync(new URL('../gladys-assistant-integration.json', import.meta.url)).size;
  assert.ok(size < 100 * 1024, `${size} bytes`);
  // The cover: 800 x 534 JPEG under 150 KB (dimensions checked in i18n.test.js).
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  assert.ok(cover.length < 150 * 1024, `cover.jpg: ${cover.length} bytes`);
  assert.equal(cover.readUInt16BE(0), 0xffd8, 'cover.jpg is a JPEG');
});

test('catalog search terms of Gladys 5.3.0: keywords within bounds, countries', () => {
  assert.ok(Array.isArray(manifest.keywords));
  assert.ok(manifest.keywords.length >= 1 && manifest.keywords.length <= 10);
  const normalized = manifest.keywords.map((keyword) => keyword.trim().toLowerCase());
  for (const keyword of normalized) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, keyword);
  }
  assert.equal(new Set(normalized).size, normalized.length, 'keywords must be unique');
  assert.ok(!normalized.includes(manifest.name.toLowerCase()), 'the name is already searched');
  // Usable worldwide: no `countries` restriction.
  assert.equal(manifest.countries, undefined);
});
