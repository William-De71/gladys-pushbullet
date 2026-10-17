// -----------------------------------------------------------------------------
// A fake Pushbullet for the tests: the REST API as docs.pushbullet.com
// describes it (users/me, devices, pushes, upload-request, texts) behind the
// transport of src/pushbullet-api.js, and a fake WebSocket for the stream.
// Nothing touches the network.
// -----------------------------------------------------------------------------

const TOKEN = 'o.test-token';
const USER = {
  iden: 'ujUser01',
  email: 'Jane@Example.com',
  email_normalized: 'jane@example.com',
  name: 'Jane Doe',
  created: 1600000000,
  modified: 1600000000,
};

/**
 * @description Create the fake API.
 * @param {object} [options] - Options.
 * @param {object[]} [options.devices] - The devices of the account.
 * @param {number} [options.clock] - The server time, in seconds.
 * @returns {object} The fake: `transport`, `calls`, `pushes`, `texts`, helpers.
 */
function createFakePushbullet({ devices, clock = 1_800_000_000 } = {}) {
  const state = {
    clock,
    devices: devices ?? [
      {
        iden: 'devPhone',
        nickname: 'Pixel 8',
        manufacturer: 'Google',
        model: 'Pixel 8',
        has_sms: true,
        active: true,
      },
      { iden: 'devChrome', nickname: 'Chrome', active: true },
    ],
    pushes: [],
    texts: [],
    uploads: [],
    failures: [],
    next: 1,
  };
  const calls = [];

  /**
   * @param {number} status - HTTP status.
   * @param {object} body - JSON body.
   * @returns {object} The answer.
   */
  const answer = (status, body) => ({
    status,
    headers: {
      'x-ratelimit-limit': '32768',
      'x-ratelimit-remaining': '32000',
      'x-ratelimit-reset': '1800003600',
    },
    text: JSON.stringify(body),
  });

  /** @returns {number} The next server instant (strictly increasing). */
  function tick() {
    state.clock += 1.5;
    return state.clock;
  }

  /**
   * @description Add a push on the account, as another device or person would.
   * @param {object} push - Fields of the push.
   * @returns {object} The push.
   */
  function addPush(push) {
    const at = tick();
    const created = {
      iden: `push${state.next++}`,
      active: true,
      type: 'note',
      direction: 'self',
      created: at,
      modified: at,
      sender_iden: USER.iden,
      sender_email: USER.email,
      sender_email_normalized: USER.email_normalized,
      sender_name: USER.name,
      receiver_iden: USER.iden,
      ...push,
    };
    state.pushes.unshift(created);
    return created;
  }

  async function transport(url, init = {}) {
    const parsed = new URL(url);
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    calls.push({
      method,
      path: parsed.pathname,
      query: Object.fromEntries(parsed.searchParams),
      body,
      headers: init.headers,
    });

    const failure = state.failures.find(
      (entry) => entry.method === method && entry.path === parsed.pathname && entry.times > 0,
    );
    if (failure) {
      failure.times -= 1;
      if (failure.throws) {
        throw failure.throws;
      }
      return answer(failure.status, failure.body ?? {});
    }

    if (parsed.hostname === 'upload.pushbullet.com') {
      state.uploads.push({ url, body });
      return { status: 204, headers: {}, text: '' };
    }
    if (init.headers?.['Access-Token'] !== TOKEN) {
      return answer(401, {
        error: {
          type: 'invalid_request',
          message: 'Access token is missing or invalid.',
          cat: '~(=^‥^)',
        },
      });
    }

    const route = `${method} ${parsed.pathname}`;
    if (route === 'GET /v2/users/me') {
      return answer(200, USER);
    }
    if (route === 'GET /v2/devices') {
      return answer(200, { devices: state.devices.filter((device) => device.active !== false) });
    }
    if (route === 'POST /v2/devices') {
      const device = { iden: `devNew${state.next++}`, active: true, created: tick(), ...body };
      state.devices.unshift(device);
      return answer(200, device);
    }
    if (route === 'POST /v2/pushes') {
      if (body.email === 'nobody@invalid') {
        return answer(400, {
          error: { type: 'invalid_request', message: 'Invalid email.', param: 'email' },
        });
      }
      const existing = state.pushes.find((push) => body.guid && push.guid === body.guid);
      if (existing) {
        return answer(200, existing);
      }
      const { device_iden: deviceIden, ...rest } = body;
      return answer(
        200,
        addPush({ ...rest, ...(deviceIden ? { target_device_iden: deviceIden } : {}) }),
      );
    }
    if (route === 'GET /v2/pushes') {
      const after = Number(parsed.searchParams.get('modified_after') ?? 0);
      const limit = Number(parsed.searchParams.get('limit') ?? 500);
      const pushes = state.pushes
        .filter((push) => push.modified > after)
        .sort((a, b) => b.modified - a.modified)
        .slice(0, limit);
      return answer(200, { pushes });
    }
    if (route === 'POST /v2/upload-request') {
      const id = state.next++;
      return answer(200, {
        file_name: body.file_name,
        file_type: body.file_type,
        file_url: `https://dl.pushbulletusercontent.com/f${id}/${body.file_name}`,
        upload_url: `https://upload.pushbullet.com/upload-legacy/u${id}`,
      });
    }
    if (route === 'POST /v2/texts') {
      const text = { iden: `text${state.next++}`, active: true, data: body.data };
      state.texts.push(text);
      return answer(200, text);
    }
    return answer(404, {
      error: { type: 'invalid_request', message: 'The resource could not be found.' },
    });
  }

  return {
    transport,
    calls,
    state,
    addPush,
    /** @returns {object[]} The pushes created through POST /v2/pushes, oldest first. */
    sent: () =>
      calls
        .filter((call) => call.method === 'POST' && call.path === '/v2/pushes')
        .map((call) => call.body),
    /**
     * @description Make the next calls of a route fail.
     * @param {string} method - The method.
     * @param {string} path - The path.
     * @param {object} failure - `{ status, body }` or `{ throws }`, and `times` (1).
     */
    fail(method, path, failure) {
      state.failures.push({ method, path, times: 1, ...failure });
    },
  };
}

/**
 * @description A fake WebSocket class: every instance is kept, the test opens,
 * feeds and closes them.
 * @returns {{ WebSocketImpl: Function, sockets: object[] }} The class and its instances.
 */
function createFakeWebSocket() {
  const sockets = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.closed = false;
      sockets.push(this);
    }

    close() {
      this.closed = true;
    }

    /** @description The server accepted the connection. */
    open() {
      this.onopen?.();
    }

    /** @param {object} message - A message of the stream. */
    receive(message) {
      this.onmessage?.({ data: JSON.stringify(message) });
    }

    /** @param {number} code - The close code. */
    drop(code = 1006) {
      this.onclose?.({ code });
    }
  }
  return { WebSocketImpl: FakeWebSocket, sockets };
}

export { createFakePushbullet, createFakeWebSocket, TOKEN, USER };
