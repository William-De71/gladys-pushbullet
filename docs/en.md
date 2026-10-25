# Pushbullet

## Overview

This integration sends the notifications of Gladys as
[Pushbullet](https://www.pushbullet.com) pushes, to the phones, computers and
browsers where Pushbullet is installed. Each user of Gladys enters the e-mail of
their Pushbullet account; the administrator enters the access token of one
Pushbullet account once for the house. A camera picture attached by Gladys
arrives as an image.

It also brings:

- three **scene triggers**: push received, phone notification (an Android
  notification mirrored by Pushbullet), push not sent;
- two **scene actions**: send a Pushbullet push (note or link, to any target),
  send an SMS through an Android phone;
- two **dashboard widgets**: the account and the pushes received.

![The two widgets of the integration: the Pushbullet account with its pushes of the month, and the last pushes and notifications received (generated illustration, not a screenshot)](https://raw.githubusercontent.com/William-De71/gladys-pushbullet/main/docs/assets/widgets.en.png)

Transport: **cloud**. The texts of the notifications, the pushes received and,
when turned on, the mirrored notifications go through the Pushbullet servers
(`api.pushbullet.com`, `stream.pushbullet.com`).

## Prerequisites

- Gladys Assistant **5.3.0** or later.
- A Pushbullet account and the Pushbullet app on the devices that should get
  the notifications (Android, iPhone, Windows, browser extensions).
- A free account sends **500 pushes per month**, every app and service
  together; Pushbullet Pro removes the limit. Free accounts also have a
  monthly limit of SMS.
- Optional: an **Android** phone with the Pushbullet app, to send SMS and to
  mirror its notifications.

## Configuration

1. On [pushbullet.com](https://www.pushbullet.com/#settings/account), open
   **Settings → Account** and click **Create Access Token**. The token starts
   with `o.`.
2. In Gladys, open **Integrations → Pushbullet → Configuration**, paste the
   token, and save.
3. Click **Test the connection**: it shows the account, its devices and the
   phones able to send SMS. **Send a test push** checks the whole chain.
4. Each user opens the **My account** block of the same screen and enters the
   **e-mail of their Pushbullet account** (and optionally one of its devices).

| Field                          | Use                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| Access token                   | From Pushbullet → Settings → Account, stored encrypted                                   |
| Title of the notifications     | Shown above each message of Gladys (`Gladys` by default)                                 |
| Language of the test push      | The language of the test push (English by default)                                       |
| Add a "Gladys" device          | Adds a device named "Gladys" to the account (on by default)                              |
| Name of the device             | Used when the device is created (`Gladys` by default)                                    |
| Pushes received                | Fires "Push received" for each new push (on by default)                                  |
| Mirrored notifications         | Fires "Phone notification" for each mirrored Android notification (off by default)       |
| End-to-end encryption password | Only if encryption is on in the Pushbullet apps: the same password                       |
| My account → e-mail            | Per user: the Pushbullet account of their notifications                                  |
| My account → device            | Per user, optional: one device, only when the e-mail is the one of the account of Gladys |

The token gives full access to the Pushbullet account. The integration only
sends pushes and SMS, reads the pushes received and adds the "Gladys" device.

## Usage

### Notifications

Every Gladys notification addressed to a user who entered an e-mail leaves as
a push: alarms, "Send a message" scene actions, the answers of Gladys.

- When the e-mail is the one of the account of the token, the push goes to
  all its devices, or to the device of the "My account" block.
- Another e-mail: the push goes to that Pushbullet user; if the address has
  no Pushbullet account, Pushbullet sends an e-mail instead.
- A picture attached to the message (the "Send a camera image" scene action)
  is uploaded and arrives as an image.

### The "Gladys" device

The integration adds a device named **Gladys** to the account. Send a push to
it (from the share menu of your phone, or from the Pushbullet app) to talk to
your scenes without disturbing your other devices. The pushes of Gladys show
it as their origin. Turning the option off does not delete it: remove it in
Pushbullet. To rename it, rename it in Pushbullet.

### Scene triggers

| Trigger            | When it fires                                                                                           | Variables                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Push received      | Each new push on the account, except those of Gladys; filters: target, origin, first word, sender, kind | title, text, link, file name, first word, kind, origin, target, sender, device, date |
| Phone notification | Each notification an Android phone mirrors; filters: application, phone, first word                     | application, package, title, text, first word, phone, date                           |
| Push not sent      | The first failure of a notification, then again only after a push went through (it never loops)         | reason, HTTP status, error, masked e-mail                                            |

The first word is in capitals without accents: a push titled "Garage open"
gives `GARAGE`. A push older than 15 minutes found after an interruption never
fires, and the pushes already on the account when the reception starts are
ignored.

**Another Pushbullet user can push to your e-mail**: before opening a door or
disarming an alarm, filter on the origin "One of my devices" or on your own
sender e-mail.

### Scene actions

- **Send a Pushbullet push**: a title, a text and, optionally, a link; to all
  the devices of the account, one device (by name), another person (by
  e-mail) or a channel you own. Returns the push identifier and the target.
- **Send an SMS through Pushbullet**: one or more numbers and a text. Your
  Android phone sends it with its own plan as soon as it syncs; Pushbullet
  cancels it after one hour. Returns the SMS identifier and the phone.

### Scene examples

- _When a push starting with GARAGE arrives on the "Gladys" device from one of
  my devices_ → close the garage door.
- _When the phone shows a notification of the delivery app_ → turn on the
  porch light.
- _When the alarm goes off_ → send a push with a link to the camera
  dashboard, and an SMS to the neighbor.

### Dashboard widgets

- **Pushbullet**: the pushes sent by Gladys this month (orange from 400, red
  from 500, the free limit), the pushes and notifications received, the
  devices, the state of the account and of the realtime link, the "Gladys"
  device, the SMS of the month, the last failure, and a **Send a test**
  button.
- **Pushes received**: the last pushes and phone notifications; tap one to
  read it whole.

## Troubleshooting

- **"Pushbullet refuses the access token"**: the token was mistyped or
  revoked (Pushbullet → Settings → Account). Create a new one and paste it.
- **"Monthly push limit reached"**: the free account sent 500 pushes this
  month (all apps together). Wait for the next month or take Pushbullet Pro.
- **"Unknown device, e-mail or channel"**: check the name of the device in
  Pushbullet ("Test the connection" lists them). A device can only be chosen
  when the e-mail is the one of the account of the token.
- **Nothing received**: check that "Pushes received" is on and that the
  "Realtime" row of the widget says "listening". Pushes sent by Gladys never
  fire a trigger.
- **No phone notification**: turn on notification mirroring in the Pushbullet
  app of the phone, and "Mirrored notifications" in the configuration. With
  end-to-end encryption, enter the same password.
- **SMS not sent**: the phone must be on, online, and allow Pushbullet to run
  in the background.
- **Logs**: Integrations → Pushbullet → Supervision tab. E-mail addresses are
  masked; the token never appears.
