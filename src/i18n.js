// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: the connection status of the Configuration screen, the results of
// its buttons, the widget contents, the toasts, the test push. Vocabulary of
// the Gladys interface (intégration, appareil / Gerät / dispositivo, scène /
// Szene / escena) and of the Pushbullet apps (push, access token).
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // connection status and Configuration screen buttons
  noToken: {
    en: 'Enter the access token of your Pushbullet account in the configuration (Pushbullet → Settings → Account → Create Access Token).',
    fr: 'Saisissez le jeton d’accès de votre compte Pushbullet dans la configuration (Pushbullet → Settings → Account → Create Access Token).',
    de: 'Geben Sie das Zugriffstoken Ihres Pushbullet-Kontos in der Konfiguration ein (Pushbullet → Settings → Account → Create Access Token).',
    es: 'Introduzca el token de acceso de su cuenta de Pushbullet en la configuración (Pushbullet → Settings → Account → Create Access Token).',
  },
  statusConnected: {
    en: 'Connected to the Pushbullet account {email} ({devices} devices).',
    fr: 'Connecté au compte Pushbullet {email} ({devices} appareils).',
    de: 'Mit dem Pushbullet-Konto {email} verbunden ({devices} Geräte).',
    es: 'Conectado a la cuenta de Pushbullet {email} ({devices} dispositivos).',
  },
  status_not_configured: {
    en: 'The Pushbullet access token is missing in the configuration.',
    fr: 'Le jeton d’accès Pushbullet manque dans la configuration.',
    de: 'Das Pushbullet-Zugriffstoken fehlt in der Konfiguration.',
    es: 'Falta el token de acceso de Pushbullet en la configuración.',
  },
  status_invalid_token: {
    en: 'Pushbullet refuses the access token: it was mistyped or revoked. Create a new one in Pushbullet → Settings → Account.',
    fr: 'Pushbullet refuse le jeton d’accès : il est mal saisi ou a été révoqué. Créez-en un nouveau dans Pushbullet → Settings → Account.',
    de: 'Pushbullet lehnt das Zugriffstoken ab: Es wurde falsch eingegeben oder widerrufen. Erstellen Sie ein neues unter Pushbullet → Settings → Account.',
    es: 'Pushbullet rechaza el token de acceso: está mal escrito o se revocó. Cree uno nuevo en Pushbullet → Settings → Account.',
  },
  status_rate_limited: {
    en: 'Pushbullet limits the calls for now: the integration tries again later.',
    fr: 'Pushbullet limite les appels pour le moment : l’intégration réessaie plus tard.',
    de: 'Pushbullet begrenzt die Aufrufe gerade: Die Integration versucht es später erneut.',
    es: 'Pushbullet limita las llamadas por ahora: la integración lo volverá a intentar más tarde.',
  },
  status_unreachable: {
    en: 'Pushbullet does not answer: check the internet connection of Gladys.',
    fr: 'Pushbullet ne répond pas : vérifiez la connexion Internet de Gladys.',
    de: 'Pushbullet antwortet nicht: Prüfen Sie die Internetverbindung von Gladys.',
    es: 'Pushbullet no responde: compruebe la conexión a Internet de Gladys.',
  },
  status_error: {
    en: 'Pushbullet answered something unexpected: see the logs of the integration.',
    fr: 'Pushbullet a répondu quelque chose d’inattendu : voir les journaux de l’intégration.',
    de: 'Pushbullet hat unerwartet geantwortet: siehe Protokolle der Integration.',
    es: 'Pushbullet respondió algo inesperado: consulte los registros de la integración.',
  },
  testOk: {
    en: 'Connected to {email}. Devices: {devices}. Phones able to send texts: {phones}.',
    fr: 'Connecté à {email}. Appareils : {devices}. Téléphones pouvant envoyer des SMS : {phones}.',
    de: 'Verbunden mit {email}. Geräte: {devices}. Telefone, die SMS senden können: {phones}.',
    es: 'Conectado a {email}. Dispositivos: {devices}. Teléfonos que pueden enviar SMS: {phones}.',
  },
  none: { en: 'none', fr: 'aucun', de: 'keine', es: 'ninguno' },
  testSent: {
    en: 'Test push sent to {target}.',
    fr: 'Push de test envoyé à {target}.',
    de: 'Test-Push an {target} gesendet.',
    es: 'Push de prueba enviado a {target}.',
  },
  testNotSent: {
    en: 'Test push not sent: {reason}.',
    fr: 'Push de test non envoyé : {reason}.',
    de: 'Test-Push nicht gesendet: {reason}.',
    es: 'Push de prueba no enviado: {reason}.',
  },
  allDevices: {
    en: 'every device of the account',
    fr: 'tous les appareils du compte',
    de: 'alle Geräte des Kontos',
    es: 'todos los dispositivos de la cuenta',
  },

  // the test push itself (in the language of the configuration)
  testTitle: {
    en: 'Gladys test',
    fr: 'Test de Gladys',
    de: 'Gladys-Test',
    es: 'Prueba de Gladys',
  },
  testBody: {
    en: 'Pushbullet works with Gladys Assistant.',
    fr: 'Pushbullet fonctionne avec Gladys Assistant.',
    de: 'Pushbullet funktioniert mit Gladys Assistant.',
    es: 'Pushbullet funciona con Gladys Assistant.',
  },

  // failure reasons (status rows, toasts)
  reason_not_configured: {
    en: 'access token missing',
    fr: 'jeton d’accès manquant',
    de: 'Zugriffstoken fehlt',
    es: 'falta el token de acceso',
  },
  reason_invalid_token: {
    en: 'access token refused',
    fr: 'jeton d’accès refusé',
    de: 'Zugriffstoken abgelehnt',
    es: 'token de acceso rechazado',
  },
  reason_quota_exceeded: {
    en: 'monthly push limit reached',
    fr: 'limite mensuelle de pushes atteinte',
    de: 'monatliches Push-Limit erreicht',
    es: 'límite mensual de pushes alcanzado',
  },
  reason_invalid_target: {
    en: 'unknown device, e-mail or channel',
    fr: 'appareil, e-mail ou canal inconnu',
    de: 'unbekanntes Gerät, E-Mail oder Kanal',
    es: 'dispositivo, correo o canal desconocido',
  },
  reason_not_found: {
    en: 'not found on Pushbullet',
    fr: 'introuvable sur Pushbullet',
    de: 'bei Pushbullet nicht gefunden',
    es: 'no encontrado en Pushbullet',
  },
  reason_rejected: {
    en: 'refused by Pushbullet',
    fr: 'refusé par Pushbullet',
    de: 'von Pushbullet abgelehnt',
    es: 'rechazado por Pushbullet',
  },
  reason_rate_limited: {
    en: 'too many calls',
    fr: 'trop d’appels',
    de: 'zu viele Aufrufe',
    es: 'demasiadas llamadas',
  },
  reason_server_error: {
    en: 'Pushbullet server error',
    fr: 'erreur du serveur Pushbullet',
    de: 'Serverfehler bei Pushbullet',
    es: 'error del servidor de Pushbullet',
  },
  reason_timeout: {
    en: 'no answer in time',
    fr: 'pas de réponse à temps',
    de: 'keine Antwort rechtzeitig',
    es: 'sin respuesta a tiempo',
  },
  reason_unreachable: {
    en: 'Pushbullet unreachable',
    fr: 'Pushbullet injoignable',
    de: 'Pushbullet nicht erreichbar',
    es: 'Pushbullet inaccesible',
  },
  reason_unexpected: {
    en: 'unexpected answer',
    fr: 'réponse inattendue',
    de: 'unerwartete Antwort',
    es: 'respuesta inesperada',
  },

  // account widget
  notReadYet: {
    en: 'The Pushbullet account has not been read yet: check the access token in the configuration.',
    fr: 'Le compte Pushbullet n’a pas encore été lu : vérifiez le jeton d’accès dans la configuration.',
    de: 'Das Pushbullet-Konto wurde noch nicht gelesen: Prüfen Sie das Zugriffstoken in der Konfiguration.',
    es: 'La cuenta de Pushbullet aún no se ha leído: compruebe el token de acceso en la configuración.',
  },
  tileSent: { en: 'Sent', fr: 'Envoyés', de: 'Gesendet', es: 'Enviados' },
  tileReceived: { en: 'Received', fr: 'Reçus', de: 'Empfangen', es: 'Recibidos' },
  tileDevices: { en: 'Devices', fr: 'Appareils', de: 'Geräte', es: 'Equipos' },
  rowConnection: { en: 'Account', fr: 'Compte', de: 'Konto', es: 'Cuenta' },
  connectionOk: { en: 'connected', fr: 'connecté', de: 'verbunden', es: 'conectado' },
  rowStream: { en: 'Realtime', fr: 'Temps réel', de: 'Echtzeit', es: 'Tiempo real' },
  streamOn: { en: 'listening', fr: 'à l’écoute', de: 'empfangsbereit', es: 'escuchando' },
  streamDown: { en: 'reconnecting', fr: 'reconnexion', de: 'Neuverbindung', es: 'reconectando' },
  streamOff: { en: 'off', fr: 'désactivé', de: 'aus', es: 'desactivado' },
  rowGladysDevice: {
    en: 'Gladys device',
    fr: 'Appareil Gladys',
    de: 'Gladys-Gerät',
    es: 'Dispositivo Gladys',
  },
  rowTexts: {
    en: 'Texts this month',
    fr: 'SMS ce mois-ci',
    de: 'SMS diesen Monat',
    es: 'SMS este mes',
  },
  rowLimit: {
    en: 'Free plan limit',
    fr: 'Limite du compte gratuit',
    de: 'Limit des Gratiskontos',
    es: 'Límite de la cuenta gratuita',
  },
  limitValue: {
    en: '500 pushes / month',
    fr: '500 pushes / mois',
    de: '500 Pushes / Monat',
    es: '500 pushes / mes',
  },
  rowLastFailure: {
    en: 'Failure {ago}',
    fr: 'Échec {ago}',
    de: 'Fehler {ago}',
    es: 'Fallo {ago}',
  },
  rowEncryption: {
    en: 'Encryption',
    fr: 'Chiffrement',
    de: 'Verschlüsselung',
    es: 'Cifrado',
  },
  encryptionWrong: {
    en: 'wrong password',
    fr: 'mot de passe erroné',
    de: 'falsches Passwort',
    es: 'contraseña incorrecta',
  },
  buttonTest: { en: 'Send a test', fr: 'Envoyer un test', de: 'Test senden', es: 'Enviar prueba' },

  // recent widget
  recentDisabled: {
    en: 'The reception is off: turn on "Pushes received" or "Mirrored notifications" in the configuration.',
    fr: 'La réception est désactivée : activez « Pushes reçus » ou « Notifications recopiées » dans la configuration.',
    de: 'Der Empfang ist aus: Schalten Sie „Empfangene Pushes“ oder „Gespiegelte Benachrichtigungen“ in der Konfiguration ein.',
    es: 'La recepción está desactivada: active «Pushes recibidos» o «Notificaciones reflejadas» en la configuración.',
  },
  recentEmpty: {
    en: 'Nothing received since the reception started. Send a push to the "Gladys" device from your phone to try.',
    fr: 'Rien de reçu depuis le début de la réception. Envoyez un push à l’appareil « Gladys » depuis votre téléphone pour essayer.',
    de: 'Seit Beginn des Empfangs nichts erhalten. Senden Sie zum Ausprobieren einen Push vom Telefon an das Gerät „Gladys“.',
    es: 'No se ha recibido nada desde que empezó la recepción. Envíe un push al dispositivo «Gladys» desde su teléfono para probar.',
  },
  recentCaption: {
    en: '{pushes} pushes and {mirrors} notifications this month',
    fr: '{pushes} pushes et {mirrors} notifications ce mois-ci',
    de: '{pushes} Pushes und {mirrors} Benachrichtigungen diesen Monat',
    es: '{pushes} pushes y {mirrors} notificaciones este mes',
  },
  badgePush: { en: 'Push', fr: 'Push', de: 'Push', es: 'Push' },
  badgeMirror: { en: 'Phone', fr: 'Téléphone', de: 'Telefon', es: 'Teléfono' },
  untitled: { en: '(no title)', fr: '(sans titre)', de: '(ohne Titel)', es: '(sin título)' },

  // widget toasts
  toastSent: {
    en: 'Test push sent to every device of the account.',
    fr: 'Push de test envoyé à tous les appareils du compte.',
    de: 'Test-Push an alle Geräte des Kontos gesendet.',
    es: 'Push de prueba enviado a todos los dispositivos de la cuenta.',
  },

  // relative times
  ago_now: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  ago_minutes: { en: '{n} min ago', fr: 'il y a {n} min', de: 'vor {n} Min.', es: 'hace {n} min' },
  ago_hours: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  ago_days: { en: '{n} d ago', fr: 'il y a {n} j', de: 'vor {n} T.', es: 'hace {n} d' },
};

/**
 * @description Whether a language is one of the four.
 * @param {string} language - The language.
 * @returns {boolean} True when supported.
 */
const isLanguage = (language) => LANGUAGES.includes(language);

/**
 * @description A text in a language, with its {placeholders} replaced.
 * @param {string} key - The TEXTS key.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The substitutions.
 * @returns {string} The text.
 * @example
 * t('testSent', 'fr', { target: 'Pixel 8' });
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description The text in every language, for a multi-language message.
 * Substitutions may be functions of the language.
 * @param {string} key - The TEXTS key.
 * @param {object} [values] - The substitutions.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 * @example
 * all('testSent', { target: (language) => t('allDevices', language) });
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      t(
        key,
        language,
        Object.fromEntries(
          Object.entries(values).map(([name, value]) => [
            name,
            typeof value === 'function' ? value(language) : value,
          ]),
        ),
      ),
    ]),
  );
}

/**
 * @description "12 min ago" for an instant.
 * @param {number} instant - The instant, in ms.
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The relative time.
 * @example
 * ago(Date.now() - 600000, Date.now(), 'en'); // -> '10 min ago'
 */
function ago(instant, now, language) {
  const minutes = Math.max(0, Math.floor((now - instant) / 60000));
  if (minutes < 1) {
    return t('ago_now', language);
  }
  if (minutes < 60) {
    return t('ago_minutes', language, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return t('ago_hours', language, { n: hours });
  }
  return t('ago_days', language, { n: Math.floor(hours / 24) });
}

export { LANGUAGES, TEXTS, isLanguage, t, all, ago };
