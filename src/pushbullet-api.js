// -----------------------------------------------------------------------------
// Client of the Pushbullet REST API (https://docs.pushbullet.com).
//
// Every call carries the access token of the account in the `Access-Token`
// header; POST bodies are JSON. Errors become a PushbulletError with a
// `reason` the rest of the integration (status, scene trigger, widget)
// understands:
//
//   not_configured   no access token in the configuration
//   invalid_token    401, or 403 on /users/me: the token was revoked or mistyped
//   quota_exceeded   the monthly push limit of a free account is reached
//   invalid_target   400 on the target: unknown e-mail, device or channel
//   not_found        404: the device, the push or the text no longer exists
//   rejected         another 400/403: Pushbullet refused the request
//   rate_limited     429 (API ratelimit)
//   server_error     5xx
//   timeout          no answer in time
//   unreachable      network error (DNS, connection refused…)
//   unexpected       an answer that is not the JSON the API documents
//
// The transport is injectable: the tests never touch the network.
// -----------------------------------------------------------------------------

const API_URL = 'https://api.pushbullet.com';
const REQUEST_TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 60_000;

const FAILURE_REASONS = Object.freeze({
  NOT_CONFIGURED: 'not_configured',
  INVALID_TOKEN: 'invalid_token',
  QUOTA_EXCEEDED: 'quota_exceeded',
  INVALID_TARGET: 'invalid_target',
  NOT_FOUND: 'not_found',
  REJECTED: 'rejected',
  RATE_LIMITED: 'rate_limited',
  SERVER_ERROR: 'server_error',
  TIMEOUT: 'timeout',
  UNREACHABLE: 'unreachable',
  UNEXPECTED: 'unexpected',
});

// Failures worth one more try: the push carries a guid, so a retried push
// that had in fact been created is not created twice.
const RETRYABLE = new Set([
  FAILURE_REASONS.SERVER_ERROR,
  FAILURE_REASONS.TIMEOUT,
  FAILURE_REASONS.UNREACHABLE,
]);

class PushbulletError extends Error {
  /**
   * @param {string} message - The error, in English (logs).
   * @param {object} [options] - Options.
   * @param {string} [options.reason] - One of FAILURE_REASONS.
   * @param {number} [options.status] - The HTTP status.
   * @param {string} [options.param] - The parameter Pushbullet blames.
   */
  constructor(message, { reason = FAILURE_REASONS.UNEXPECTED, status, param } = {}) {
    super(message);
    this.name = 'PushbulletError';
    this.reason = reason;
    if (typeof status === 'number') {
      this.status = status;
    }
    if (param) {
      this.param = param;
    }
  }
}

/**
 * @description Turn anything thrown into a PushbulletError.
 * @param {any} err - The error.
 * @returns {PushbulletError} The error.
 * @example
 * toPushbulletError(new Error('boom')).reason; // -> 'unexpected'
 */
function toPushbulletError(err) {
  if (err instanceof PushbulletError) {
    return err;
  }
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return new PushbulletError('Pushbullet did not answer in time', {
      reason: FAILURE_REASONS.TIMEOUT,
    });
  }
  if (err instanceof TypeError || err?.cause?.code) {
    return new PushbulletError(
      `Pushbullet is unreachable: ${err.cause?.code ?? err.cause?.message ?? err.message}`,
      { reason: FAILURE_REASONS.UNREACHABLE },
    );
  }
  return new PushbulletError(String(err?.message ?? err), { reason: FAILURE_REASONS.UNEXPECTED });
}

/**
 * @description The reason of an error answer.
 * @param {number} status - The HTTP status.
 * @param {object} error - The `error` object of the body (may be empty).
 * @param {string} path - The path called.
 * @returns {string} One of FAILURE_REASONS.
 * @example
 * reasonOf(401, {}, '/v2/pushes'); // -> 'invalid_token'
 */
function reasonOf(status, error, path) {
  // The answers carry a machine code next to the message
  // (`invalid_access_token`…): both are read.
  const message = `${error?.code ?? ''} ${error?.message ?? ''}`;
  // The documented push limit of free accounts. The exact answer is not
  // documented: any refusal that speaks of a limit, a quota or Pro is taken
  // for it (assumption, see README).
  const quota = /limit|quota|pro\b|upgrade/i.test(message) && !/rate ?limit/i.test(message);
  if (status === 401 || error?.code === 'invalid_access_token') {
    return FAILURE_REASONS.INVALID_TOKEN;
  }
  if (status === 429) {
    return quota ? FAILURE_REASONS.QUOTA_EXCEEDED : FAILURE_REASONS.RATE_LIMITED;
  }
  if (status === 403) {
    if (quota) {
      return FAILURE_REASONS.QUOTA_EXCEEDED;
    }
    return path === '/v2/users/me' ? FAILURE_REASONS.INVALID_TOKEN : FAILURE_REASONS.REJECTED;
  }
  if (status === 404) {
    return FAILURE_REASONS.NOT_FOUND;
  }
  if (status === 400) {
    if (quota) {
      return FAILURE_REASONS.QUOTA_EXCEEDED;
    }
    const param = String(error?.param ?? '');
    return ['email', 'device_iden', 'channel_tag', 'target_device_iden', 'addresses'].includes(
      param,
    ) || /target|device|email|channel/i.test(message)
      ? FAILURE_REASONS.INVALID_TARGET
      : FAILURE_REASONS.REJECTED;
  }
  if (status >= 500) {
    return FAILURE_REASONS.SERVER_ERROR;
  }
  return FAILURE_REASONS.UNEXPECTED;
}

/**
 * @description The default transport: fetch with a timeout.
 * @param {string} url - The URL.
 * @param {object} init - The fetch options (method, headers, body, timeoutMs).
 * @returns {Promise<{ status: number, headers: object, text: string }>} The answer.
 */
async function fetchTransport(url, { timeoutMs = REQUEST_TIMEOUT_MS, ...init }) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    text: await response.text(),
  };
}

/**
 * @description Create the Pushbullet client.
 * @param {object} options - Options.
 * @param {Function} options.getToken - `() => string`, the access token.
 * @param {Function} [options.transport] - `(url, init) => Promise<{ status, headers, text }>`.
 * @param {Function} [options.wait] - `(ms) => Promise`, the pause before a retry.
 * @param {number} [options.retryDelayMs] - The pause before the one retry.
 * @returns {object} The client.
 * @example
 * const api = createPushbulletClient({ getToken: () => config.accessToken });
 * await api.me();
 */
function createPushbulletClient({
  getToken,
  transport = fetchTransport,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  retryDelayMs = 2000,
}) {
  let ratelimit = null;

  /**
   * @description One call of the API.
   * @param {string} method - GET, POST, DELETE.
   * @param {string} path - The path, /v2/….
   * @param {object} [options] - Options.
   * @param {object} [options.query] - Query parameters (undefined ones skipped).
   * @param {object} [options.body] - The JSON body.
   * @param {boolean} [options.retry] - Retry once on a server or network failure.
   * @returns {Promise<object>} The parsed answer.
   */
  async function call(method, path, { query, body, retry = false } = {}) {
    const token = getToken();
    if (!token) {
      throw new PushbulletError('No Pushbullet access token in the configuration', {
        reason: FAILURE_REASONS.NOT_CONFIGURED,
      });
    }
    const url = new URL(path, API_URL);
    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
    const init = {
      method,
      headers: {
        'Access-Token': token,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    };

    let answer;
    try {
      answer = await transport(url.toString(), init);
    } catch (err) {
      const failure = toPushbulletError(err);
      if (retry && RETRYABLE.has(failure.reason)) {
        await wait(retryDelayMs);
        return call(method, path, { query, body, retry: false });
      }
      throw failure;
    }

    const remaining = Number(answer.headers?.['x-ratelimit-remaining']);
    if (Number.isFinite(remaining)) {
      ratelimit = {
        limit: Number(answer.headers['x-ratelimit-limit']) || null,
        remaining,
        reset: Number(answer.headers['x-ratelimit-reset']) || null,
      };
    }

    let json;
    try {
      json = answer.text ? JSON.parse(answer.text) : {};
    } catch {
      json = null;
    }
    if (answer.status >= 200 && answer.status < 300) {
      if (json === null || typeof json !== 'object') {
        throw new PushbulletError(`Pushbullet answered ${path} with something that is not JSON`, {
          reason: FAILURE_REASONS.UNEXPECTED,
          status: answer.status,
        });
      }
      return json;
    }
    const error = json?.error ?? {};
    const reason = reasonOf(answer.status, error, url.pathname);
    const failure = new PushbulletError(
      `Pushbullet answered ${answer.status} on ${method} ${url.pathname}: ${
        error.message ?? 'no message'
      }`,
      { reason, status: answer.status, param: error.param },
    );
    if (retry && RETRYABLE.has(reason)) {
      await wait(retryDelayMs);
      return call(method, path, { query, body, retry: false });
    }
    throw failure;
  }

  return {
    /** @returns {Promise<object>} The user of the token (iden, email, name…). */
    me: () => call('GET', '/v2/users/me'),

    /** @returns {Promise<object[]>} The active devices of the account. */
    async devices() {
      const all = [];
      let cursor;
      do {
        const page = await call('GET', '/v2/devices', { query: { active: 'true', cursor } });
        all.push(...(page.devices ?? []).filter((device) => device.active !== false));
        cursor = page.cursor;
      } while (cursor && all.length < 1000);
      return all;
    },

    /**
     * @description Create a device (the "Gladys" device of the account).
     * @param {object} device - nickname, model, manufacturer, icon.
     * @returns {Promise<object>} The device.
     */
    createDevice: (device) => call('POST', '/v2/devices', { body: device }),

    /**
     * @description Send a push. The caller sets a unique `guid`.
     * @param {object} push - type, title, body, url, file_*, target, guid.
     * @returns {Promise<object>} The push created.
     */
    createPush: (push) => call('POST', '/v2/pushes', { body: push, retry: true }),

    /**
     * @description The pushes modified after a timestamp, newest first.
     * @param {object} options - Options.
     * @param {number} [options.modifiedAfter] - Seconds since the epoch, as the server wrote it.
     * @param {number} [options.limit] - Page size.
     * @returns {Promise<object[]>} The pushes (one page: enough between two tickles).
     */
    async pushes({ modifiedAfter, limit = 50 } = {}) {
      const page = await call('GET', '/v2/pushes', {
        query: { modified_after: modifiedAfter, limit, active: 'true' },
      });
      return page.pushes ?? [];
    },

    /**
     * @description Upload a file, then return what a file push needs.
     * @param {object} file - Options.
     * @param {string} file.name - File name.
     * @param {string} file.type - MIME type.
     * @param {Buffer} file.bytes - The content.
     * @returns {Promise<{ file_name: string, file_type: string, file_url: string }>} For the push.
     */
    async upload({ name, type, bytes }) {
      const request = await call('POST', '/v2/upload-request', {
        body: { file_name: name, file_type: type },
      });
      if (!request.upload_url || !request.file_url) {
        throw new PushbulletError('Pushbullet gave no upload URL', {
          reason: FAILURE_REASONS.UNEXPECTED,
        });
      }
      const form = new FormData();
      form.append('file', new Blob([bytes], { type }), request.file_name ?? name);
      let answer;
      try {
        // The upload URL needs no token: it is single use.
        answer = await transport(request.upload_url, {
          method: 'POST',
          body: form,
          timeoutMs: UPLOAD_TIMEOUT_MS,
        });
      } catch (err) {
        throw toPushbulletError(err);
      }
      if (answer.status < 200 || answer.status >= 300) {
        throw new PushbulletError(`The upload of the file failed (${answer.status})`, {
          reason: answer.status >= 500 ? FAILURE_REASONS.SERVER_ERROR : FAILURE_REASONS.REJECTED,
          status: answer.status,
        });
      }
      return {
        file_name: request.file_name ?? name,
        file_type: request.file_type ?? type,
        file_url: request.file_url,
      };
    },

    /**
     * @description Queue a text message (SMS) sent by an Android phone.
     * @param {object} data - target_device_iden, addresses, message, guid.
     * @returns {Promise<object>} The text created.
     */
    createText: (data) => call('POST', '/v2/texts', { body: { data }, retry: true }),

    /** @returns {object|null} The last ratelimit headers seen. */
    ratelimit: () => ratelimit,
  };
}

export {
  createPushbulletClient,
  PushbulletError,
  toPushbulletError,
  reasonOf,
  FAILURE_REASONS,
  API_URL,
};
