# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.1] - 2026-10-24

### Security

- **security:** build the image on Node.js 24.22.1 or later ([03a4f28](https://github.com/William-De71/gladys-pushbullet/commit/03a4f28837dd3bc3cf5e16547fb346d5687f72b6))

## [0.1.0] - 2026-10-17

### Added

- Gladys notifications as Pushbullet pushes: each user enters the e-mail of their Pushbullet account (and optionally one of its devices) in the "My account" block, the administrator the access token once. An image attached by Gladys (a camera snapshot) is sent as a file.
- A "Gladys" device added to the Pushbullet account: push to Gladys from the share menu of a phone, and see where the pushes of Gladys come from.
- Scene triggers: push received (filters on the target, the origin, the first word, the sender and the kind), phone notification mirrored by Android (filters on the application, the phone and the first word, end-to-end encryption supported), push not sent (once per failure, never looping).
- Scene actions: send a note or a link to all the devices, one device, another person or a channel; send an SMS through an Android phone of the account.
- Dashboard widgets: the account (pushes of the month, devices, realtime link, last failure, test button) and the last pushes and notifications received.
- Configuration screen buttons: test the connection, send a test push.
- Cloud transport only: the Pushbullet API and its realtime stream; English, French, German and Spanish everywhere.

[0.1.1]: https://github.com/William-De71/gladys-pushbullet/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/William-De71/gladys-pushbullet/releases/tag/v0.1.0
