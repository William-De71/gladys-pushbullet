// -----------------------------------------------------------------------------
// Entry point of the Pushbullet external integration.
//
// Sends the notifications of Gladys as Pushbullet pushes (cloud, access
// token of the account):
//   - communication channel (send-only): each user enters the e-mail of their
//     Pushbullet account in the "My account" block, Gladys hands it with every
//     message;
//   - scene triggers: push received, phone notification mirrored, push not
//     sent;
//   - scene actions: send a push (note or link, any target), send a text
//     through an Android phone;
//   - dashboard widgets: account, last pushes received.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Pushbullet integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
