// Invented requests and credentials. No captured traffic or external services are used.
const origin = Date.UTC(2026, 0, 1, 10, 0, 0);
const requests = [
  ['GET', '/shop', 200, 180, 0, 'text/html'],
  ['GET', '/assets/store.css', 200, 45, 32, 'text/css'],
  ['GET', '/assets/store.js', 200, 115, 40, 'application/javascript'],
  ['GET', '/api/products?category=stationery', 200, 320, 200, 'application/json'],
  ['GET', '/api/account?email=avery@example.invalid', 200, 168, 235, 'application/json'],
  ['POST', '/api/cart/items', 201, 246, 630, 'application/json'],
  ['POST', '/api/checkout', 503, 1840, 1120, 'application/json'],
  ['POST', '/api/checkout', 503, 1620, 3210, 'application/json'],
  ['GET', '/api/orders/latest?session=synthetic-session', 401, 210, 4980, 'application/json'],
  ['GET', '/api/health', 200, 86, 5330, 'application/json'],
] as const;
export const SAMPLE = JSON.stringify({
  log: {
    version: '1.2',
    creator: { name: 'Synthetic fixture', version: '1' },
    entries: requests.map(([method, path, status, time, offset, mime]) => ({
      startedDateTime: new Date(origin + offset).toISOString(),
      time,
      request: {
        method,
        url: `https://shop.example.invalid${path}`,
        httpVersion: 'HTTP/2.0',
        headers: [
          { name: 'Accept', value: 'application/json' },
          { name: 'Authorization', value: 'Bearer synthetic-key-not-a-real-token' },
          { name: 'Cookie', value: 'session=synthetic-session' },
        ],
        cookies: [{ name: 'session', value: 'synthetic-session' }],
        queryString: [],
        headersSize: -1,
        bodySize: -1,
        ...(method === 'POST'
          ? {
              postData: {
                mimeType: 'application/json',
                text: JSON.stringify({
                  sku: 'notebook-01',
                  quantity: 2,
                  email: 'avery@example.invalid',
                  shipping_address: 'Synthetic address',
                  token: 'synthetic-checkout-token',
                }),
              },
            }
          : {}),
      },
      response: {
        status,
        statusText: status >= 400 ? 'Unavailable' : 'OK',
        httpVersion: 'HTTP/2.0',
        headers: [
          { name: 'Content-Type', value: mime },
          { name: 'X-Request-ID', value: `synthetic-request-${offset}` },
        ],
        cookies: [],
        content: {
          size: status >= 400 ? 428 : 1024,
          mimeType: mime,
          text:
            mime === 'application/json'
              ? JSON.stringify(
                  status === 503
                    ? {
                        error: 'PAYMENT_GATEWAY_TIMEOUT',
                        message: 'Payment provider did not respond',
                        retryable: true,
                        email: 'avery@example.invalid',
                        trace: `checkout-${offset}`,
                      }
                    : status === 401
                      ? { error: 'SESSION_EXPIRED', retryable: false }
                      : { result: 'ok' },
                  null,
                  2,
                )
              : '<!-- Synthetic content -->',
        },
        redirectURL: '',
        headersSize: -1,
        bodySize: -1,
      },
      cache: {},
      timings: { blocked: 0, dns: 8, connect: 20, ssl: 12, send: 2, wait: time - 40, receive: 10 },
      serverIPAddress: '192.0.2.10',
      _private: 'synthetic browser extension metadata',
    })),
  },
});
