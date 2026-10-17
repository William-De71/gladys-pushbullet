// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The two widgets on a made-up Pushbullet account (fixed date): the pushes of
// the month, the realtime link up, a failure yesterday, and the last pushes
// and phone notifications received. Every name and text is made up; the
// contents around them come from src/widgets.js.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildAccountWidget, buildRecentWidget } = await load('src/widgets.js');
const { LANGUAGES } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// Saturday 17 October 2026, 20:00 in Paris.
const NOW = Date.parse('2026-10-17T18:00:00Z');
const MINUTE = 60000;

const snapshot = {
  user: { email: 'marie@example.com', name: 'Marie' },
  devices: [{}, {}, {}, {}],
  readFailure: null,
  counters: { month: '2026-10', sent: 132, texts: 4, received: 9, mirrored: 23 },
  stream: 'up',
  gladysDevice: 'Gladys',
  lastFailure: { reason: 'unreachable', at: NOW - 26 * 60 * MINUTE },
  receiving: true,
  decryptFailing: false,
};

// What arrived, per language (people write in their own language).
const ENTRIES = {
  en: [
    ['mirror', 'Delivery today', 'Your parcel arrives between 6 and 8 pm', 'Amazon'],
    ['push', 'Garage', 'Close it if it is open', 'Pixel 8'],
    ['mirror', 'Mum', 'Are you coming for dinner on Sunday?', 'WhatsApp'],
    ['push', 'Shopping', 'Milk, bread, coffee', 'Chrome'],
  ],
  fr: [
    ['mirror', 'Livraison aujourd’hui', 'Votre colis arrive entre 18 h et 20 h', 'Amazon'],
    ['push', 'Garage', 'Ferme-le s’il est ouvert', 'Pixel 8'],
    ['mirror', 'Maman', 'Tu viens dîner dimanche ?', 'WhatsApp'],
    ['push', 'Courses', 'Lait, pain, café', 'Chrome'],
  ],
  de: [
    ['mirror', 'Zustellung heute', 'Ihr Paket kommt zwischen 18 und 20 Uhr', 'Amazon'],
    ['push', 'Garage', 'Schließ es, falls es offen ist', 'Pixel 8'],
    ['mirror', 'Mama', 'Kommst du am Sonntag zum Essen?', 'WhatsApp'],
    ['push', 'Einkauf', 'Milch, Brot, Kaffee', 'Chrome'],
  ],
  es: [
    ['mirror', 'Entrega hoy', 'Su paquete llega entre las 18 y las 20 h', 'Amazon'],
    ['push', 'Garaje', 'Ciérralo si está abierto', 'Pixel 8'],
    ['mirror', 'Mamá', '¿Vienes a cenar el domingo?', 'WhatsApp'],
    ['push', 'Compras', 'Leche, pan, café', 'Chrome'],
  ],
};
const entries = (language) =>
  ENTRIES[language].map(([kind, title, body, from], index) => ({
    kind,
    title,
    body,
    from,
    at: new Date(NOW - [7, 48, 190, 1460][index] * MINUTE).toISOString(),
  }));

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    account: buildAccountWidget({ snapshot, language, now: NOW }),
    recent: buildRecentWidget({
      entries: entries(language),
      counters: snapshot.counters,
      receiving: true,
      language,
    }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
