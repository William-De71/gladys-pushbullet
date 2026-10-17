# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** that sends the notifications of
Gladys through Pushbullet: a Node.js service (Node 22+, ESM, no build step)
that runs in its own sandboxed Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. A send-only communication integration
(`type: "communication"`, `messaging: { receive: false }`): the access token
of the Pushbullet account in the `config_schema` (administrator), the e-mail
(and optional device) of each user in the `contact_schema`. On top: scene
triggers fed by the realtime stream of the account, scene actions and
dashboard widgets. Transport: cloud only (`api.pushbullet.com` and
`stream.pushbullet.com`).

## Commands

```bash
npm install
npm test                                  # node --test, never touches the network
node --test test/app.test.js              # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(); timer
src/pushbullet-api.js   REST client (Access-Token header, error reasons, upload)
src/stream.js           realtime stream (WebSocket): reconnection, watchdog
src/account.js          the account: user, devices, "Gladys" device, pushes,
                        notifications of users, texts (SMS)
src/receiver.js         tickles -> pushes since the cursor -> push_received;
                        mirror ephemerals -> notification_mirrored
src/crypto.js           end-to-end decryption (PBKDF2 + AES-256-GCM)
src/store.js            /data/state.json: month counters, cursor and seen pushes,
                        recent entries, iden of the "Gladys" device
src/events.js           scene trigger payloads, push_not_sent (transitions)
src/widgets.js          account and recent dashboard widgets
src/config.js           configuration and per-user contact values
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **Keys are forever**: every key users store — `config_schema` and
  `contact_schema` keys and types (`email`, `device`!), the language values,
  the Configuration screen buttons, widget keys, scene triggers (fields,
  options, variables), scene actions (fields, outputs) and the failure reasons
  (`FAILURE_REASONS` in `src/pushbullet-api.js`, stored by scenes filtering
  on them). `test/structure.test.js` compares them to
  `test/fixtures/manifest.baseline.json` (0.1.0): never update the baseline to
  make a test pass without a documented migration.
- **Every push carries a `guid` starting with `gladys-`**: a retried push is
  not created twice, and `push_received` never fires for a push of Gladys.
  Retries: once, on a 5xx, a timeout or a network error only.
- **The cursor is a server timestamp** (`modified` of the newest push read),
  never the local clock. The first reading of an account only sets it; a push
  fires when it was created after the previous cursor, never seen, and at most
  15 minutes older than the newest push read.
- **Secrets**: the access token and the encryption password never appear in a
  log line, an error message, a scene event or a widget. The stream URL holds
  the token: never log it. E-mail addresses are masked in the logs and in
  `push_not_sent` (`maskEmail`). The upload URL is called without the token.
- **Scene events**: `push_not_sent` fires once per scope (the account, or a
  refused target) until a push goes through; `push_received` once per push;
  `notification_mirrored` once per mirror ephemeral. A scene ACTION never
  fires a trigger. Flat scalar data, declared keys only (every trigger field
  is also a variable).
- **What arrives never reaches the brain** (`publishMessage` is refused to a
  send-only channel): scene triggers and the recent widget only. Docs warn to
  filter on the sender before opening a door or disarming an alarm.
- **Widgets never call Pushbullet**: they read what the integration knows.
  The test button carries the language of the dashboard in its params.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. A field older cores do not know needs a higher `gladys_version`
  minimum (see `src/constants.js` of the integration-store): a widget button
  with a form would need 5.2.0. Transport: `["cloud"]`.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (the fake Pushbullet and fake
  WebSocket of `test/helpers/fake-pushbullet.js`).
