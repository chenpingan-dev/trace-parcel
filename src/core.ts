export const VERSION = '0.1.0';
export const MAX_BYTES = 20 * 1024 * 1024;
export const MASK = '[redacted]';
export const OMITTED = '[body omitted]';
export type Language = 'en' | 'zh-CN';
export type Pair = { name: string; value: string };
export type Timing = Record<
  'blocked' | 'dns' | 'connect' | 'ssl' | 'send' | 'wait' | 'receive',
  number
>;
export type Entry = {
  id: number;
  started: number;
  offset: number;
  time: number;
  method: string;
  url: string;
  status: number;
  size: number;
  mime: string;
  timings: Timing;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
};
export type Capture = { entries: Entry[]; duration: number };
export type Options = { hideHosts: boolean; keepJson: boolean; literals: string[] };
export const DEFAULT_OPTIONS: Options = { hideHosts: true, keepJson: false, literals: [] };
export type Reason =
  'header' | 'cookie' | 'query' | 'body' | 'host' | 'identity' | 'pattern' | 'custom';
export type Change = { entry: number; location: string; reason: Reason };
export type HarEntry = {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    cookies: never[];
    headers: Pair[];
    queryString: Pair[];
    headersSize: number;
    bodySize: number;
    postData?: { mimeType: string; text: string };
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    cookies: never[];
    headers: Pair[];
    content: { size: number; mimeType: string; text?: string };
    redirectURL: string;
    headersSize: number;
    bodySize: number;
  };
  cache: Record<string, never>;
  timings: Timing;
};
export type Parcel = {
  title: string;
  note: string;
  language: Language;
  entries: { id: number; offset: number; har: HarEntry }[];
  changes: Change[];
  options: { hideHosts: boolean; keepJson: boolean; literalCount: number };
};

export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const bounded = (value: unknown, fallback = 0, max = 86_400_000): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(value, max)
    : fallback;
export function pairs(value: unknown): Pair[] {
  return Array.isArray(value)
    ? value
        .map(object)
        .filter((v) => typeof v.name === 'string')
        .map((v) => ({ name: text(v.name), value: text(v.value) }))
    : [];
}
export function parseHar(source: string): Capture {
  if (new TextEncoder().encode(source).byteLength > MAX_BYTES) throw new Error('size');
  let parsed: unknown;
  try {
    parsed = JSON.parse(source.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('json');
  }
  const raw = object(object(parsed).log).entries;
  if (!Array.isArray(raw)) throw new Error('format');
  if (raw.length > 5000) throw new Error('entries');
  const entries: Entry[] = raw.map((item, id) => {
    const e = object(item),
      request = object(e.request),
      response = object(e.response);
    const url = text(request.url);
    let address: URL;
    try {
      address = new URL(url);
    } catch {
      throw new Error('url');
    }
    if (!['http:', 'https:'].includes(address.protocol)) throw new Error('url');
    const started = Date.parse(text(e.startedDateTime));
    if (!Number.isFinite(started)) throw new Error('date');
    if (
      typeof response.status !== 'number' ||
      !Number.isInteger(response.status) ||
      response.status < 0 ||
      response.status > 599
    )
      throw new Error('status');
    const rawTimings = object(e.timings);
    const timings = Object.fromEntries(
      ['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive'].map((k) => [
        k,
        bounded(rawTimings[k], ['send', 'wait', 'receive'].includes(k) ? 0 : -1),
      ]),
    ) as Timing;
    return {
      id,
      started,
      offset: 0,
      time: bounded(e.time),
      method: /^[A-Z]{1,20}$/.test(text(request.method)) ? text(request.method) : 'OTHER',
      url: address.href,
      status: response.status,
      size: bounded(object(response.content).size, 0, Number.MAX_SAFE_INTEGER),
      mime: text(object(response.content).mimeType),
      timings,
      request,
      response,
    };
  });
  const start = entries.length ? Math.min(...entries.map((e) => e.started)) : 0;
  for (const e of entries) e.offset = e.started - start;
  return { entries, duration: entries.reduce((max, e) => Math.max(max, e.offset + e.time), 0) };
}

export function parseLiterals(source: string): string[] {
  const lines = [
    ...new Set(
      source
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  if (lines.length > 100 || lines.some((s) => s.length < 3 || s.length > 512))
    throw new Error('rules');
  return lines.sort((a, b) => b.length - a.length);
}
const SENSITIVE_KEY =
  /token|password|passwd|secret|authorization|credential|session|cookie|email|phone|address|cardnumber|creditcard|ssn|apikey|privatekey/i;
const normalizeKey = (key: string) => key.replace(/[^a-z0-9]/gi, '');
const httpVersion = (value: unknown): string =>
  /^(?:HTTP\/[123](?:\.[01])?|h2|h3)$/i.test(text(value)) ? text(value) : '';
const mimeType = (value: unknown): string => {
  const valueText = text(value).split(';')[0].trim().toLowerCase();
  return [
    'application/json',
    'application/problem+json',
    'application/x-www-form-urlencoded',
    'application/octet-stream',
    'text/plain',
    'text/html',
    'text/css',
    'text/javascript',
    'application/javascript',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
    'font/woff2',
    'multipart/form-data',
  ].includes(valueText)
    ? valueText
    : 'application/octet-stream';
};

export function prepare(
  capture: Capture,
  selected: ReadonlySet<number>,
  options: Options = DEFAULT_OPTIONS,
  title = 'Network issue report',
  note = '',
  language: Language = 'en',
): Parcel {
  const literals = parseLiterals(options.literals.join('\n'));
  const changes: Change[] = [];
  const hosts = new Map<string, string>();
  for (const entry of capture.entries) {
    const host = new URL(entry.url).host;
    if (!hosts.has(host)) hosts.set(host, `host-${hosts.size + 1}.invalid`);
  }
  const change = (entry: number, location: string, reason: Reason) =>
    changes.push({ entry, location, reason });
  const scrub = (input: string, entry: number, location: string): string => {
    let output = input;
    for (const literal of literals) {
      const variants = [
        ...new Set([
          literal,
          encodeURIComponent(literal),
          encodeURIComponent(literal).replace(/%20/g, '+'),
        ]),
      ];
      for (const variant of variants) {
        if (output.includes(variant)) {
          output = output.split(variant).join(MASK);
          change(entry, location, 'custom');
        }
      }
    }
    const patterns = [
      /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+/g,
      /\bBearer\s+[^\s"',;<>]+/gi,
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    ];
    for (const pattern of patterns)
      output = output.replace(pattern, () => {
        change(entry, location, 'pattern');
        return MASK;
      });
    return output;
  };
  const sanitizeUrl = (input: string, entry: number, location: string): string => {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      return MASK;
    }
    if (!['http:', 'https:'].includes(url.protocol)) return MASK;
    if (url.username || url.password || url.hash) change(entry, location, 'identity');
    url.username = '';
    url.password = '';
    url.hash = '';
    if (options.hideHosts) {
      const key = url.host;
      if (!hosts.has(key)) hosts.set(key, `host-${hosts.size + 1}.invalid`);
      url.host = hosts.get(key)!;
      url.port = '';
      change(entry, location, 'host');
    }
    // Decode each segment independently so an encoded slash stays in its original segment.
    url.pathname = scrub(url.pathname, entry, location)
      .split('/')
      .map((segment) => {
        try {
          segment = decodeURIComponent(segment);
        } catch {
          /* Keep malformed escapes as text. */
        }
        return encodeURIComponent(scrub(segment, entry, location));
      })
      .join('/');
    const query = [...url.searchParams.keys()];
    url.search = '';
    for (const key of query) {
      url.searchParams.append(scrub(key, entry, location), MASK);
      change(entry, location, 'query');
    }
    if (scrub(url.host, entry, location) !== url.host) {
      url.hostname = 'redacted.invalid';
      url.port = '';
    }
    return url.href;
  };
  const sanitizeHeaders = (value: unknown, entry: number, location: string): Pair[] =>
    pairs(value).map((header) => {
      const name = scrub(header.name, entry, location);
      if (header.name.toLowerCase() === 'content-type')
        return { name, value: mimeType(header.value) };
      change(entry, location, 'header');
      return { name, value: MASK };
    });
  const sanitizeBody = (
    value: unknown,
    mime: unknown,
    encoding: unknown,
    entry: number,
    location: string,
  ): string | undefined => {
    if (value === undefined) return undefined;
    const body = text(value);
    if (
      !options.keepJson ||
      encoding ||
      body.length > 2 * 1024 * 1024 ||
      !/^application\/(?:[\w.+-]+\+)?json(?:;|$)/i.test(text(mime))
    ) {
      change(entry, location, 'body');
      return OMITTED;
    }
    const visit = (value: unknown, depth: number): unknown => {
      if (depth > 60) throw new Error('depth');
      if (Array.isArray(value)) return value.map((v) => visit(v, depth + 1));
      if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
          Object.entries(value).map(([key, val]) => {
            const safeKey = scrub(key, entry, location);
            if (SENSITIVE_KEY.test(normalizeKey(key))) {
              change(entry, location, 'pattern');
              return [safeKey, MASK];
            }
            return [safeKey, visit(val, depth + 1)];
          }),
        );
      }
      if (typeof value === 'string') return scrub(value, entry, location);
      if (typeof value === 'number' && scrub(String(value), entry, location) !== String(value))
        return MASK;
      return value;
    };
    try {
      return JSON.stringify(visit(JSON.parse(body), 0), null, 2);
    } catch {
      change(entry, location, 'body');
      return OMITTED;
    }
  };
  const entries = capture.entries
    .filter((e) => selected.has(e.id))
    .map((e) => {
      const url = sanitizeUrl(e.url, e.id, 'request.url');
      const post = object(e.request.postData),
        content = object(e.response.content);
      let requestBody = sanitizeBody(post.text, post.mimeType, undefined, e.id, 'request.body');
      if (post.params !== undefined) {
        requestBody = OMITTED;
        change(e.id, 'request.body', 'body');
      }
      const responseBody = sanitizeBody(
        content.text,
        content.mimeType,
        content.encoding,
        e.id,
        'response.body',
      );
      for (const [side, obj] of [
        ['request', e.request],
        ['response', e.response],
      ] as const) {
        if (Array.isArray(obj.cookies) && obj.cookies.length)
          change(e.id, `${side}.cookies`, 'cookie');
      }
      const har: HarEntry = {
        // A synthetic epoch keeps timing offsets without exposing the capture date.
        startedDateTime: new Date(
          Date.UTC(2000, 0, 1) + Math.min(e.offset, 3_155_760_000_000),
        ).toISOString(),
        time: e.time,
        request: {
          method: e.method,
          url,
          httpVersion: httpVersion(e.request.httpVersion),
          cookies: [],
          headers: sanitizeHeaders(e.request.headers, e.id, 'request.headers'),
          queryString: (() => {
            try {
              return [...new URL(url).searchParams].map(([name, value]) => ({ name, value }));
            } catch {
              return [];
            }
          })(),
          headersSize: -1,
          bodySize: -1,
          ...(requestBody !== undefined
            ? {
                postData: {
                  mimeType: requestBody === OMITTED ? 'text/plain' : 'application/json',
                  text: requestBody,
                },
              }
            : {}),
        },
        response: {
          status: e.status,
          statusText: '',
          httpVersion: httpVersion(e.response.httpVersion),
          cookies: [],
          headers: sanitizeHeaders(e.response.headers, e.id, 'response.headers'),
          content: {
            size: e.size,
            mimeType: mimeType(content.mimeType),
            ...(responseBody !== undefined ? { text: responseBody } : {}),
          },
          redirectURL: text(e.response.redirectURL)
            ? sanitizeUrl(text(e.response.redirectURL), e.id, 'response.redirect')
            : '',
          headersSize: -1,
          bodySize: -1,
        },
        cache: {},
        timings: { ...e.timings },
      };
      return { id: e.id, offset: e.offset, har };
    });
  return {
    title: scrub(title.slice(0, 160), -1, 'title'),
    note: scrub(note.slice(0, 4000), -1, 'note'),
    language,
    entries,
    changes,
    options: {
      hideHosts: options.hideHosts,
      keepJson: options.keepJson,
      literalCount: literals.length,
    },
  };
}

export function exportHar(parcel: Parcel): string {
  return (
    JSON.stringify(
      {
        log: {
          version: '1.2',
          creator: { name: 'Trace Parcel', version: VERSION },
          entries: parcel.entries.map((e) => e.har),
        },
      },
      null,
      2,
    ) + '\n'
  );
}
export const escapeHtml = (value: unknown): string =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const md = (value: string): string =>
  escapeHtml(value)
    .replace(/[\\`*_{}\[\]()#+.!|>~-]/g, '\\$&')
    .replace(/\r?\n/g, '<br>');
export function exportMarkdown(parcel: Parcel): string {
  const zh = parcel.language === 'zh-CN';
  const rows = parcel.entries.map(
    (e) =>
      `| ${e.id + 1} | ${e.har.request.method} | ${md(e.har.request.url)} | ${e.har.response.status} | ${e.har.time} ms |`,
  );
  return `# ${md(parcel.title)}\n\n${md(parcel.note)}\n\n${zh ? '请求' : 'Requests'}: ${parcel.entries.length} · ${zh ? '已处理字段' : 'Redaction events'}: ${parcel.changes.length}\n\n| # | Method | URL | Status | Time |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}\n\n## ${zh ? '分享范围' : 'Sharing policy'}\n\n${policyText(parcel)}\n\n${zh ? '路径、业务字段和手写说明仍需人工检查；规则无法识别全部敏感信息' : 'Review paths, business fields and written notes before sharing; rules cannot identify every sensitive value.'}\n\nGenerated with Trace Parcel ${VERSION}\n`;
}
function policyText(p: Parcel): string {
  const zh = p.language === 'zh-CN';
  return zh
    ? `认证头与其他请求头值已处理，Content-Type 仅保留已知媒体类型；Cookie、查询参数值、原始时间、IP、注释和扩展元数据不保留。域名${p.options.hideHosts ? '已替换' : '保留'}，正文${p.options.keepJson ? '仅尝试保留经过规则处理的 JSON' : '已移除'}，自定义规则 ${p.options.literalCount} 条`
    : `Header values are removed except recognized Content-Type media types. Cookies, query values, original dates, IPs, comments and extension metadata are omitted. Hosts ${p.options.hideHosts ? 'replaced' : 'retained'}; bodies ${p.options.keepJson ? 'retained only when parseable as JSON, after key and text rules' : 'omitted'}; ${p.options.literalCount} custom rules.`;
}
export function exportHtml(parcel: Parcel): string {
  const zh = parcel.language === 'zh-CN',
    h = escapeHtml;
  const failed = parcel.entries.filter(
    (e) => e.har.response.status >= 400 || e.har.response.status === 0,
  ).length;
  const rows = parcel.entries
    .map(
      (e) =>
        `<tr><td>${e.id + 1}</td><td><b>${h(e.har.request.method)}</b><div class="url">${h(e.har.request.url)}</div></td><td><span class="status ${e.har.response.status >= 400 || !e.har.response.status ? 'bad' : ''}">${e.har.response.status}</span></td><td>${e.har.time.toFixed(0)} ms</td></tr>`,
    )
    .join('');
  const details = parcel.entries
    .map(
      (e) =>
        `<details><summary>#${e.id + 1} ${h(e.har.request.method)} · ${h(e.har.request.url)}</summary><h3>${zh ? '请求头' : 'Request headers'}</h3><pre>${h(JSON.stringify(e.har.request.headers, null, 2))}</pre><h3>${zh ? '请求正文' : 'Request body'}</h3><pre>${h(e.har.request.postData?.text ?? '—')}</pre><h3>${zh ? '响应头' : 'Response headers'}</h3><pre>${h(JSON.stringify(e.har.response.headers, null, 2))}</pre><h3>${zh ? '响应正文' : 'Response body'}</h3><pre>${h(e.har.response.content.text ?? '—')}</pre><h3>${zh ? '耗时' : 'Timings'}</h3><pre>${h(JSON.stringify(e.har.timings, null, 2))}</pre></details>`,
    )
    .join('');
  return `<!doctype html><html lang="${parcel.language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><title>${h(parcel.title)} · Trace Parcel</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f3f8;color:#242332;font:14px/1.7 "Microsoft YaHei","微软雅黑",system-ui,sans-serif}article{max-width:1000px;margin:32px auto;padding:48px;background:white;border:1px solid #e5e2ed;border-radius:16px}header{display:flex;justify-content:space-between;color:#7564be;font-size:12px;letter-spacing:.12em}h1{font-size:30px;line-height:1.35;margin:35px 0 12px;overflow-wrap:anywhere}h2{margin:32px 0 12px;font-size:18px}h3{font-size:13px}.note{white-space:pre-wrap;overflow-wrap:anywhere;color:#565267}.summary{display:flex;gap:24px;border-block:1px solid #eceaf1;padding:16px 0;margin:24px 0}.summary b{font-size:20px;margin-right:8px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{text-align:left;border-bottom:1px solid #eceaf1;padding:13px 8px}th{color:#6c657b;font-weight:500}td:first-child{width:36px;color:#767080}td:nth-child(3),td:last-child{white-space:nowrap}.url{overflow-wrap:anywhere;font-family:Consolas,monospace;font-size:12px;color:#5e566e;max-width:640px}.status{color:#28695a}.bad{color:#b24642}details{border-bottom:1px solid #e5e2ed;padding:16px 0}summary{cursor:pointer;overflow-wrap:anywhere}pre{background:#f6f5f9;padding:16px;border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 Consolas,monospace}.policy{background:#f6f5fb;padding:20px;border-radius:10px;color:#635c74}.notice{font-size:12px;color:#6d6176}footer{margin-top:32px;color:#81768d;font-size:12px} @media(max-width:600px){article{margin:0;padding:24px 16px;border-radius:0}h1{font-size:24px}.summary{gap:12px}.url{font-size:11px}td{padding:10px 4px}}@media print{body{background:white}article{border:0;margin:0;padding:0}details{break-inside:avoid}}
</style></head><body><article><header><b>TRACE PARCEL</b><span>${zh ? '网络问题报告' : 'NETWORK REPORT'}</span></header><h1>${h(parcel.title)}</h1>${parcel.note ? `<p class="note">${h(parcel.note)}</p>` : ''}<div class="summary"><span><b>${parcel.entries.length}</b>${zh ? '个请求' : 'requests'}</span><span><b>${failed}</b>${zh ? '个失败' : 'failed'}</span><span><b>${parcel.changes.length}</b>${zh ? '处处理' : 'redactions'}</span></div><table><thead><tr><th>#</th><th>${zh ? '请求' : 'Request'}</th><th>${zh ? '状态' : 'Status'}</th><th>${zh ? '耗时' : 'Time'}</th></tr></thead><tbody>${rows}</tbody></table><h2>${zh ? '请求详情' : 'Request details'}</h2>${details}<h2>${zh ? '处理记录' : 'Redaction receipt'}</h2><div class="policy">${h(policyText(parcel))}</div><p class="notice">${zh ? '路径、业务字段和手写说明仍需人工检查；规则无法识别全部敏感信息' : 'Review paths, business fields and written notes before sharing; rules cannot identify every sensitive value.'}</p><details><summary>${zh ? '查看字段处理位置' : 'View redaction locations'}</summary><pre>${h(JSON.stringify(parcel.changes, null, 2))}</pre></details><footer>Trace Parcel ${VERSION} · ${zh ? '仅包含所选请求的处理后内容' : 'Contains only the processed content of selected requests'}</footer></article></body></html>`;
}
