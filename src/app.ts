import {
  DEFAULT_OPTIONS,
  MAX_BYTES,
  MASK,
  OMITTED,
  VERSION,
  escapeHtml as h,
  exportHar,
  exportHtml,
  exportMarkdown,
  object,
  pairs,
  parseHar,
  parseLiterals,
  prepare,
  text,
  type Entry,
  type Language,
  type Parcel,
  type Reason,
} from './core.js';
import { SAMPLE } from './sample.js';
import { icon } from './icons.js';

let language: Language = 'zh-CN';
try {
  language = localStorage.getItem('trace-parcel-language') === 'en' ? 'en' : 'zh-CN';
} catch {
  /* Files also work without storage. */
}
const t = (zh: string, en: string) => (language === 'zh-CN' ? zh : en);
const app = document.querySelector<HTMLDivElement>('#app')!;
const exportDialog = document.querySelector<HTMLDialogElement>('#export-dialog')!;
const helpDialog = document.querySelector<HTMLDialogElement>('#help-dialog')!;
const fileInput = document.querySelector<HTMLInputElement>('#har-file')!;
let capture = parseHar(SAMPLE);
let selected = new Set(
  capture.entries.filter((e) => e.status >= 400 || e.status === 0).map((e) => e.id),
);
let active = [...selected][0] ?? 0;
let isSample = true,
  filename = '',
  filter = 'all',
  query = '',
  inspectorTab = 'overview',
  original = false;
let options = { ...DEFAULT_OPTIONS, literals: [] as string[] };
let ruleDraft = '',
  titleDraft = '',
  noteDraft = '';
let previewFormat: 'html' | 'har' | 'markdown' = 'html';
let dialogParcel: Parcel;
let loadGeneration = 0;
const title = () =>
  titleDraft ||
  (isSample ? t('结账失败排查', 'Checkout failure') : t('网络问题报告', 'Network issue report'));
const failed = (e: Entry) => e.status === 0 || e.status >= 400;
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`);
const safeUrl = (value: string) => {
  try {
    return new URL(value);
  } catch {
    return new URL('https://redacted.invalid/');
  }
};
const allParcel = () =>
  prepare(
    capture,
    new Set(capture.entries.map((e) => e.id)),
    options,
    title(),
    noteDraft,
    language,
  );
const selectedParcel = () => prepare(capture, selected, options, title(), noteDraft, language);
function toast(message: string) {
  const node = document.querySelector<HTMLDivElement>('#toast')!;
  node.textContent = message;
  node.classList.add('visible');
  setTimeout(() => node.classList.remove('visible'), 4000);
}
function reasonLabel(reason: Reason): string {
  return {
    header: t('请求头与响应头', 'Header values'),
    cookie: t('Cookie', 'Cookies'),
    query: t('查询参数值', 'Query values'),
    body: t('请求与响应正文', 'Body content'),
    host: t('域名', 'Hostnames'),
    identity: t('URL 认证与片段', 'URL identity'),
    pattern: t('字段与文本规则', 'Key & text rules'),
    custom: t('自定义内容', 'Custom values'),
  }[reason];
}
function render() {
  const focusId = (document.activeElement as HTMLElement)?.id;
  const tableScroll = document.querySelector('.table-scroll')?.scrollTop;
  document.documentElement.lang = language;
  const parcel = selectedParcel();
  app.innerHTML = `<header class="topbar"><a class="brand" href="#" aria-label="Trace Parcel">${icon('parcel', 'brand-mark')}<span>Trace Parcel</span><span class="version">v${VERSION}</span></a><div class="top-actions"><span class="local-label">${icon('lock')}${t('本地处理', 'On your device')}</span><button class="text-button" id="language" data-action="language">${t('English', '中文')}</button><a class="github" href="https://github.com/chenpingan-dev/trace-parcel" target="_blank" rel="noreferrer">GitHub ↗</a><button class="button primary import-button" data-action="import">${icon('upload')}${t('导入 HAR', 'Import HAR')}</button></div></header>
  <main><section class="intro"><div><div class="eyebrow">CAPTURE LESS. EXPLAIN MORE.</div><h1>${t('把抓包变成清晰的问题报告', 'From network noise to a clear report')}</h1><p>${t('保留关键请求，处理敏感内容，让接手的人直接开始排查', 'Keep the evidence. Remove private values. Give the next person a head start.')}</p></div><button class="text-button help-link" data-action="help">${icon('help')}${t('如何获取 HAR 文件', 'How to capture a HAR')}</button></section>
  <div class="workspace"><section class="evidence-column"><div class="request-card card" id="dropzone"><div class="card-heading"><div class="section-title"><span class="section-icon">${icon('network')}</span><h2>${t('选择请求', 'Choose the evidence')}</h2></div><div class="source"><span class="source-dot"></span><span title="${h(filename)}">${isSample ? t('结账流程 · 合成记录', 'Checkout · synthetic recording') : h(filename || t('未导入文件', 'No file loaded'))}</span><button class="icon-button" data-action="clear" aria-label="${t('清空当前记录', 'Clear recording')}">${icon('close')}</button></div></div>
  <div class="request-tools"><div class="filters" role="group" aria-label="${t('请求筛选', 'Request filters')}">${[
    ['all', t('全部', 'All'), capture.entries.length],
    ['failed', t('失败', 'Failed'), capture.entries.filter(failed).length],
    ['slow', t('慢请求', 'Slow'), capture.entries.filter((e) => e.time >= 1000).length],
  ]
    .map(
      ([id, name, count]) =>
        `<button id="filter-${id}" class="filter ${filter === id ? 'active' : ''}" data-action="filter" data-value="${id}" aria-pressed="${filter === id}">${name}<span>${count}</span></button>`,
    )
    .join(
      '',
    )}</div><label class="search">${icon('search')}<input id="search" type="search" placeholder="${t('搜索域名或路径', 'Find host or path')}" aria-label="${t('搜索域名或路径', 'Find host or path')}" value="${h(query)}"></label></div>
  <div id="request-list"></div><div class="request-footer"><span>${t('已选择', 'Selected')} <b>${selected.size}</b> / ${capture.entries.length}</span><div><button class="text-button" data-action="select-failed">${t('只选失败请求', 'Select failures')}</button><span>·</span><button class="text-button" data-action="select-all">${t('全选', 'Select all')}</button><span>·</span><button class="text-button" data-action="select-none">${t('清空', 'Clear')}</button></div></div></div><section id="inspector" class="inspector card"></section></section>
  <aside class="parcel-column"><div class="parcel-heading"><div class="section-title"><span class="section-icon">${icon('send')}</span><h2>${t('整理分享包', 'Prepare your parcel')}</h2></div><span class="subtle">${t('仅导出所选请求', 'Selected requests only')}</span></div>
  <div class="paper"><div class="paper-top"><span>${icon('parcel')} NETWORK REPORT</span><span class="paper-lines">≡</span></div><label class="sr-only" for="report-title">${t('报告标题', 'Report title')}</label><input id="report-title" class="title-input" maxlength="160" value="${h(title())}"><label class="sr-only" for="report-note">${t('问题说明', 'Issue notes')}</label><textarea id="report-note" rows="2" maxlength="4000" placeholder="${t('补充复现步骤、预期结果…', 'Add steps to reproduce, expected behavior…')}">${h(noteDraft)}</textarea><div class="paper-divider"></div><div class="paper-summary"><span><b>${selected.size}</b>${t(' 个请求', ' requests')}</span><span class="fail-count">${capture.entries.filter((e) => selected.has(e.id) && failed(e)).length} ${t('个失败', 'failed')}</span></div><div class="paper-requests">${
    parcel.entries
      .slice(0, 3)
      .map(
        (e) =>
          `<div><span class="paper-status">${e.har.response.status}</span><span>${h(safeUrl(e.har.request.url).pathname)}</span></div>`,
      )
      .join('') ||
    `<div class="paper-empty">${t('从左侧选择要分享的请求', 'Select requests to include')}</div>`
  }${parcel.entries.length > 3 ? `<div class="more-items">+ ${parcel.entries.length - 3} ${t('个请求', 'more requests')}</div>` : ''}</div><div class="paper-stamp">${icon('lock')} ${t('按下方规则处理', 'Processed with your settings')}</div></div>
  <section class="privacy-settings"><div class="setting-heading"><h3>${t('隐私处理', 'Privacy controls')}</h3><span>${icon('check')} ${parcel.changes.length} ${t('处已处理', 'redactions')}</span></div><label class="toggle-row"><span><b>${t('替换域名', 'Replace hostnames')}</b><small>${t('使用 host-1.invalid 等代号', 'Use host-1.invalid and stable aliases')}</small></span><input id="hide-hosts" type="checkbox" role="switch" ${options.hideHosts ? 'checked' : ''}><span class="switch" aria-hidden="true"></span></label><label class="toggle-row"><span><b>${t('保留 JSON 正文', 'Keep JSON bodies')}</b><small>${t('按字段与文本规则处理，仍需核对', 'Apply key & text rules, then review')}</small></span><input id="keep-json" type="checkbox" role="switch" ${options.keepJson ? 'checked' : ''}><span class="switch" aria-hidden="true"></span></label>
  <details class="rules" ${ruleDraft || options.literals.length ? 'open' : ''}><summary>${t('补充要隐藏的内容', 'Add values to redact')}<span>${options.literals.length || '+'}</span></summary><label for="custom-rules">${t('每行一项，至少 3 个字符', 'One literal per line, at least 3 characters')}</label><textarea id="custom-rules" rows="3" maxlength="51200" placeholder="${t('订单号、内部项目名、其他敏感值', 'Order IDs, internal names, other private values')}">${h(ruleDraft)}</textarea><button id="apply-rules" class="button small" data-action="rules">${t('应用规则', 'Apply rules')}</button></details>
  <details class="receipt"><summary>${t('查看处理记录', 'View redaction receipt')}<span>↗</span></summary><ul>${Object.entries(
    parcel.changes.reduce(
      (out, e) => ({ ...out, [e.reason]: (out[e.reason] || 0) + 1 }),
      {} as Record<string, number>,
    ),
  )
    .map(([key, count]) => `<li><span>${reasonLabel(key as Reason)}</span><b>${count}</b></li>`)
    .join(
      '',
    )}</ul><p>${t('IP、原始日期、注释与扩展元数据也不会带入导出文件', 'IPs, capture dates, comments and extension metadata are also omitted')}</p></details></section>
  <div class="export-actions"><button class="button primary export-button" data-action="preview" ${!selected.size ? 'disabled' : ''}>${t('检查并导出', 'Review & export')}${icon('arrow')}</button><span>HTML <i>·</i> HAR <i>·</i> Markdown</span><p>${t('发送前请核对路径、业务字段与手写说明', 'Review paths, business fields and notes before sharing')}</p></div></aside></div>
  <footer class="footer"><span>${icon('lock')}${t('文件只在当前标签页中处理', 'Your files stay in this tab')}</span><div><button class="text-button" data-action="sample">${t('载入合成记录', 'Load sample recording')}</button><span>·</span><a href="https://github.com/chenpingan-dev/trace-parcel/releases/latest" target="_blank" rel="noreferrer">${t('下载离线版', 'Get the offline app')} ↗</a></div></footer></main>`;
  renderList();
  renderInspector();
  const table = document.querySelector('.table-scroll');
  if (table) table.scrollTop = tableScroll ?? Math.max(0, active * 60 - 100);
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
}

function filtered() {
  return capture.entries.filter(
    (e) =>
      (filter !== 'failed' || failed(e)) &&
      (filter !== 'slow' || e.time >= 1000) &&
      `${e.method} ${e.url} ${e.status}`.toLowerCase().includes(query.toLowerCase()),
  );
}
function renderList() {
  const entries = filtered(),
    shown = entries.slice(0, 150),
    cleaned = allParcel();
  const maxTime = Math.max(capture.duration, 1);
  document.querySelector('#request-list')!.innerHTML = capture.entries.length
    ? `<div class="table-scroll"><table class="requests"><thead><tr><th><span class="sr-only">${t('选择', 'Select')}</span></th><th>${t('请求', 'Request')}</th><th>${t('状态', 'Status')}</th><th class="waterfall-col">${t('时间线', 'Waterfall')}<span>${ms(capture.duration)}</span></th><th>${t('耗时', 'Time')}</th></tr></thead><tbody>${shown
        .map((e) => {
          const safe = cleaned.entries[e.id].har,
            url = safeUrl(safe.request.url);
          const left = Math.min(96, (e.offset / maxTime) * 100),
            width = Math.max(1.5, (e.time / maxTime) * 100);
          return `<tr class="${active === e.id ? 'inspected' : ''} ${selected.has(e.id) ? 'included' : ''}"><td><input id="select-${e.id}" data-select="${e.id}" type="checkbox" ${selected.has(e.id) ? 'checked' : ''} aria-label="${t('选择请求', 'Select request')} ${e.id + 1}"></td><td><button id="request-${e.id}" class="request-name" data-action="inspect" data-id="${e.id}"><span class="method ${e.method === 'POST' ? 'post' : ''}">${h(e.method)}</span><span class="endpoint"><b title="${h(url.pathname + url.search)}">${h(url.pathname)}</b><small>${h(url.host)}</small></span></button></td><td><span class="status ${failed(e) ? 'failed' : ''}">${e.status || t('失败', 'Failed')}</span></td><td class="waterfall-col"><div class="waterfall-track"><span class="waterfall-bar ${failed(e) ? 'failed-bar' : ''}" style="margin-left:${left}%;width:${Math.min(width, 100 - left)}%"></span></div></td><td class="duration ${e.time >= 1000 ? 'slow' : ''}">${ms(e.time)}</td></tr>`;
        })
        .join(
          '',
        )}</tbody></table>${!entries.length ? `<div class="empty-result">${t('没有匹配的请求', 'No matching requests')}</div>` : ''}</div>${entries.length > 150 ? `<p class="list-limit">${t('当前显示前 150 条，请搜索缩小范围；导出仍包含全部勾选请求', 'Showing the first 150 matches. Search to narrow the list; exports include all selected requests.')}</p>` : ''}`
    : `<button class="empty-upload" data-action="import">${icon('upload')}<b>${t('拖入 HAR 文件，开始整理', 'Drop a HAR file to get started')}</b><span>${t('或点击选择文件 · 最大 20 MiB', 'Or choose a file · up to 20 MiB')}</span></button>`;
}
function renderInspector() {
  const e = capture.entries[active],
    panel = document.querySelector('#inspector')!;
  if (!e) {
    panel.innerHTML = `<div class="inspector-empty">${icon('file')}<p>${t('选择一个请求，查看它会分享哪些内容', 'Choose a request to see what will be shared')}</p></div>`;
    return;
  }
  const parcel = allParcel(),
    sanitized = parcel.entries[e.id].har;
  const request = original ? e.request : sanitized.request,
    response = original ? e.response : sanitized.response;
  const displayUrl = original ? e.url : sanitized.request.url;
  const changes = parcel.changes.filter((c) => c.entry === e.id).length;
  const bodyText = (value: unknown) => {
    const v = text(value);
    if (!v) return t('没有记录正文', 'No recorded body');
    if (v === OMITTED)
      return t(
        '正文已移除 · 可在右侧开启保留 JSON',
        'Body omitted · enable Keep JSON bodies to include it',
      );
    return (
      v.slice(0, 16000) +
      (v.length > 16000
        ? t(
            '\n…预览已截断，导出包含完整处理结果',
            '\n…Preview truncated; export includes the full processed result',
          )
        : '')
    );
  };
  panel.innerHTML = `<div class="inspector-heading"><div><span class="detail-kicker">${t('请求详情', 'REQUEST DETAILS')} <span>#${e.id + 1}</span></span><div class="detail-address"><b>${h(e.method)}</b><span>${h(displayUrl)}</span></div></div><div class="view-toggle" role="group" aria-label="${t('内容视图', 'Content view')}"><button id="view-clean" class="${!original ? 'active' : ''}" data-action="view" data-value="clean" aria-pressed="${!original}">${t('导出内容', 'Exported')}</button><button id="view-original" class="${original ? 'active' : ''}" data-action="view" data-value="original" aria-pressed="${original}">${t('原始内容', 'Original')}</button></div></div>
  ${original ? `<div class="original-notice">${icon('lock')}${t('正在查看原始内容，仅在本地显示', 'Showing original content, visible locally only')}</div>` : `<div class="clean-notice">${icon('check')}${changes} ${t('处内容已处理', 'redaction events')}<span>${selected.has(e.id) ? t('已加入分享包', 'Included in parcel') : t('未加入分享包', 'Not included in parcel')}</span></div>`}
  <div class="detail-tabs" role="group" aria-label="${t('请求详情分类', 'Request detail sections')}">${[
    ['overview', t('概览', 'Overview')],
    ['headers', t('请求头', 'Headers')],
    ['body', t('正文', 'Body')],
  ]
    .map(
      ([id, label]) =>
        `<button id="detail-${id}" class="${inspectorTab === id ? 'active' : ''}" data-action="detail-tab" data-value="${id}" aria-pressed="${inspectorTab === id}">${label}</button>`,
    )
    .join('')}</div>
  <div class="detail-content">${
    inspectorTab === 'overview'
      ? `<div class="overview-line"><div><small>${t('响应状态', 'Response')}</small><b class="${failed(e) ? 'failure-text' : ''}">${e.status || t('连接失败', 'Failed')} ${e.status === 503 ? 'Service Unavailable' : e.status === 401 ? 'Unauthorized' : ''}</b></div><div><small>${t('总耗时', 'Total time')}</small><b>${ms(e.time)}</b></div><div><small>${t('响应大小', 'Response size')}</small><b>${(e.size / 1024).toFixed(1)} KB</b></div></div><div class="timing-title">${t('耗时分布', 'Timing breakdown')}<span>${t('取自 HAR 记录', 'As recorded in HAR')}</span></div><div class="timing-chart">${(
          ['dns', 'connect', 'send', 'wait', 'receive'] as const
        )
          .filter((k) => e.timings[k] > 0)
          .map(
            (k, i) =>
              `<span title="${k}: ${ms(e.timings[k])}" style="flex:${e.timings[k]};background:var(--timing-${i})"></span>`,
          )
          .join(
            '',
          )}</div><div class="timing-legend">${(['dns', 'connect', 'send', 'wait', 'receive'] as const).map((k, i) => `<span><i style="background:var(--timing-${i})"></i>${{ dns: 'DNS', connect: t('连接', 'Connect'), send: t('发送', 'Send'), wait: t('等待', 'Wait'), receive: t('接收', 'Receive') }[k]} <b>${e.timings[k] >= 0 ? ms(e.timings[k]) : '—'}</b></span>`).join('')}</div>`
      : inspectorTab === 'headers'
        ? `<div class="two-details">${[
            ['request', request, t('请求头', 'Request headers')],
            ['response', response, t('响应头', 'Response headers')],
          ]
            .map(
              ([, obj, label]) =>
                `<div><h3>${label}</h3><dl class="headers">${
                  pairs(object(obj).headers)
                    .map(
                      (p) =>
                        `<div><dt>${h(p.name)}</dt><dd class="${p.value === MASK ? 'masked' : ''}">${h(p.value)}</dd></div>`,
                    )
                    .join('') || `<p>—</p>`
                }</dl></div>`,
            )
            .join('')}</div>`
        : `<div class="two-details"><div><h3>${t('请求正文', 'Request body')}</h3><pre>${h(bodyText(object(request.postData).text))}</pre></div><div><h3>${t('响应正文', 'Response body')}</h3><pre>${h(bodyText(object(response.content).text))}</pre></div></div>`
  }</div>`;
}
function showPreview() {
  if (!selected.size) return;
  try {
    options.literals = parseLiterals(ruleDraft);
  } catch {
    toast(
      t(
        '请先修正自定义规则：每行 3–512 个字符，最多 100 项',
        'Fix custom rules first: 3–512 characters per line, up to 100 values',
      ),
    );
    return;
  }
  dialogParcel = selectedParcel();
  renderPreview();
  if (!exportDialog.open) exportDialog.showModal();
}
function renderPreview() {
  exportDialog.innerHTML = `<div class="dialog-bar"><div><h2 id="export-heading">${t('这是对方会收到的内容', 'This is what they will receive')}</h2><p>${t('仅包含所选请求的处理后内容', 'Only the processed content of selected requests')}</p></div><button class="icon-button" data-close="export" aria-label="${t('关闭', 'Close')}">${icon('close')}</button></div><div class="preview-toolbar"><div class="view-toggle" role="group" aria-label="${t('导出格式', 'Export format')}">${(['html', 'har', 'markdown'] as const).map((key) => `<button class="${previewFormat === key ? 'active' : ''}" data-format="${key}" aria-pressed="${previewFormat === key}">${key === 'markdown' ? 'Markdown' : key.toUpperCase()}</button>`).join('')}</div><button class="button primary" id="download-parcel">${icon('down')}${t('下载', 'Download')} ${previewFormat === 'markdown' ? 'Markdown' : previewFormat.toUpperCase()}</button></div><div class="export-preview">${previewFormat === 'html' ? `<iframe id="report-preview" sandbox title="${t('报告预览', 'Report preview')}"></iframe>` : `<pre>${h((previewFormat === 'har' ? exportHar(dialogParcel) : exportMarkdown(dialogParcel)).slice(0, 200000))}</pre>`}</div><p class="preview-note">${t('规则无法识别全部敏感内容，请检查路径、保留的业务字段与手写说明', 'Rules cannot identify every sensitive value. Review paths, retained business fields and written notes.')}</p>`;
  const iframe = exportDialog.querySelector<HTMLIFrameElement>('iframe');
  if (iframe) iframe.srcdoc = exportHtml(dialogParcel);
}
function download() {
  const formats = {
    html: ['html', 'text/html', exportHtml],
    har: ['har', 'application/json', exportHar],
    markdown: ['md', 'text/markdown', exportMarkdown],
  } as const;
  const [extension, mime, generate] = formats[previewFormat];
  const blob = new Blob([generate(dialogParcel)], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = `trace-parcel.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(t('文件已生成', 'File generated'));
}
function help() {
  helpDialog.innerHTML = `<div class="dialog-bar"><h2 id="help-heading">${t('从浏览器导出 HAR', 'Capture a HAR in your browser')}</h2><button class="icon-button" data-close="help" aria-label="${t('关闭', 'Close')}">${icon('close')}</button></div><ol class="help-steps"><li>${t('打开开发者工具，进入「网络 / Network」', 'Open Developer Tools and select Network')}</li><li>${t('勾选「保留日志 / Preserve log」，重新操作到问题出现', 'Enable Preserve log, then reproduce the issue')}</li><li>${t('使用「导出 HAR」保存记录，再导入这里', 'Export the recording as a HAR file, then import it here')}</li></ol><p class="help-text">${t('支持 HAR 1.2 中的 HTTP / HTTPS 请求，最大 20 MiB、5,000 条请求。在线工作区预载的数据全部为合成记录', 'Supports HTTP / HTTPS requests in HAR 1.2, up to 20 MiB and 5,000 entries. The preloaded recording is entirely synthetic.')}</p><a class="help-doc" href="https://developer.chrome.com/docs/devtools/network/reference#save-as-har" target="_blank" rel="noreferrer">${t('Chrome 官方说明', 'Chrome documentation')} ↗</a>`;
  helpDialog.showModal();
}
async function loadFile(file: File) {
  const generation = ++loadGeneration;
  try {
    if (file.size > MAX_BYTES) throw new Error('size');
    const next = parseHar(await file.text());
    if (generation !== loadGeneration) return;
    capture = next;
    filename = file.name;
    isSample = false;
    selected = new Set(next.entries.map((e) => e.id));
    active = next.entries.find(failed)?.id ?? 0;
    filter = 'all';
    query = '';
    original = false;
    titleDraft = '';
    noteDraft = '';
    options = { ...DEFAULT_OPTIONS, literals: [] };
    ruleDraft = '';
    render();
    toast(t(`已载入 ${next.entries.length} 个请求`, `Loaded ${next.entries.length} requests`));
  } catch (error) {
    if (generation !== loadGeneration) return;
    const key = error instanceof Error ? error.message : '';
    toast(
      {
        size: t('文件超过 20 MiB', 'File exceeds 20 MiB'),
        entries: t('最多支持 5,000 条请求', 'Up to 5,000 requests supported'),
        json: t('文件不是有效的 JSON', 'File is not valid JSON'),
        format: t('找不到 HAR 的 log.entries', 'Missing HAR log.entries'),
        date: t('请求中有无效的 startedDateTime', 'An entry has an invalid startedDateTime'),
        url: t('请求中有无效的 HTTP / HTTPS 地址', 'An entry has an invalid HTTP / HTTPS URL'),
        status: t('请求中有无效的响应状态', 'An entry has an invalid response status'),
      }[key] ?? t('无法读取文件', 'Could not read file'),
    );
  } finally {
    if (generation === loadGeneration) fileInput.value = '';
  }
}
app.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'import') {
    fileInput.value = '';
    fileInput.click();
    return;
  }
  if (action === 'preview') {
    showPreview();
    return;
  }
  if (action === 'help') {
    help();
    return;
  }
  if (action === 'inspect') active = Number(target.dataset.id);
  if (action === 'filter') filter = target.dataset.value!;
  if (action === 'detail-tab') inspectorTab = target.dataset.value!;
  if (action === 'view') original = target.dataset.value === 'original';
  if (action === 'select-failed')
    selected = new Set(capture.entries.filter(failed).map((e) => e.id));
  if (action === 'select-all') selected = new Set(capture.entries.map((e) => e.id));
  if (action === 'select-none') selected.clear();
  if (action === 'clear') {
    loadGeneration++;
    fileInput.value = '';
    capture = { entries: [], duration: 0 };
    selected.clear();
    filename = '';
    titleDraft = '';
    noteDraft = '';
    ruleDraft = '';
    options = { ...DEFAULT_OPTIONS, literals: [] };
    isSample = false;
    original = false;
  }
  if (action === 'sample') {
    loadGeneration++;
    fileInput.value = '';
    capture = parseHar(SAMPLE);
    selected = new Set(capture.entries.filter(failed).map((e) => e.id));
    active = [...selected][0];
    isSample = true;
    filename = '';
    filter = 'all';
    query = '';
    original = false;
    titleDraft = '';
    noteDraft = '';
  }
  if (action === 'rules') {
    try {
      options.literals = parseLiterals(ruleDraft);
      toast(t('规则已应用', 'Rules applied'));
    } catch {
      toast(
        t('每行需为 3–512 个字符，最多 100 项', 'Use 3–512 characters per line, up to 100 values'),
      );
      return;
    }
  }
  if (action === 'language') {
    language = language === 'en' ? 'zh-CN' : 'en';
    try {
      localStorage.setItem('trace-parcel-language', language);
    } catch {
      /* Optional preference. */
    }
  }
  render();
});
app.addEventListener('input', (event) => {
  const target = event.target as HTMLInputElement;
  if (target.id === 'search') {
    query = target.value;
    renderList();
  }
  if (target.id === 'custom-rules') ruleDraft = target.value;
  if (target.id === 'report-title') titleDraft = target.value;
  if (target.id === 'report-note') noteDraft = target.value;
});
app.addEventListener('change', (event) => {
  const target = event.target as HTMLInputElement;
  if (target.hasAttribute('data-select')) {
    const id = Number(target.dataset.select);
    if (target.checked) selected.add(id);
    else selected.delete(id);
    render();
  }
  if (target.id === 'hide-hosts') {
    options.hideHosts = target.checked;
    render();
  }
  if (target.id === 'keep-json') {
    options.keepJson = target.checked;
    render();
  }
});
fileInput.addEventListener('change', () => {
  if (fileInput.files?.[0]) void loadFile(fileInput.files[0]);
});
app.addEventListener('dragover', (event) => {
  event.preventDefault();
  document.querySelector('#dropzone')?.classList.add('dragging');
});
app.addEventListener('dragleave', (event) => {
  if (!app.contains(event.relatedTarget as Node))
    document.querySelector('#dropzone')?.classList.remove('dragging');
});
app.addEventListener('drop', (event) => {
  event.preventDefault();
  document.querySelector('#dropzone')?.classList.remove('dragging');
  if (event.dataTransfer?.files[0]) void loadFile(event.dataTransfer.files[0]);
});
exportDialog.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('button');
  if (target?.dataset.close) exportDialog.close();
  if (target?.dataset.format) {
    previewFormat = target.dataset.format as typeof previewFormat;
    renderPreview();
    exportDialog.querySelector<HTMLButtonElement>(`[data-format="${previewFormat}"]`)?.focus();
  }
  if (target?.id === 'download-parcel') download();
});
helpDialog.addEventListener('click', (event) => {
  if ((event.target as HTMLElement).closest('[data-close]')) helpDialog.close();
});
render();
