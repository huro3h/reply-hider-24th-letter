// 登録ユーザーが他人に書いたリプライのセルを非表示にする。
// リプライ欄などは「返信先」表示が出ないため、React が持つポストのデータで判定する。
// そのためページの JS 世界（world: MAIN）で動かす。

const TARGETS_ATTR = "data-xrh-targets";
const HIDDEN_ATTR = "data-xrh-hidden";
const LINE_OFF_ATTR = "data-xrh-line-off";
const CUT_BELOW_ATTR = "data-xrh-cut-below";
const COLLAPSED_ATTR = "data-xrh-collapsed";
const COLLAPSED_END_ATTR = "data-xrh-collapsed-end";
const MESSAGE_SOURCE = "x-reply-hider";
const REPLY_LABEL = /^\s*(返信先|Replying to)/;

let enabled = new Set();
let registered = new Set();
let showTrace = false;
let scanQueued = false;
const reportedNames = new Map();

function readTargets() {
  try {
    const { enabled: e = [], all = [], trace = false } = JSON.parse(document.documentElement.getAttribute(TARGETS_ATTR) || "{}");
    enabled = new Set(e);
    registered = new Set(all);
    showTrace = trace;
  } catch {
    enabled = new Set();
    registered = new Set();
    showTrace = false;
  }
}

// article から React fiber を親方向にたどり、最初に見つかる props.tweet を返す
function tweetDataOf(article) {
  const key = Object.keys(article).find((k) => k.startsWith("__reactFiber"));
  let fiber = key && article[key];
  for (let i = 0; fiber && i < 40; i++, fiber = fiber.return) {
    const tweet = fiber.memoizedProps?.tweet;
    if (tweet?.id_str) return tweet.retweeted_status ?? tweet;
  }
  return null;
}

function authorLinkOf(article) {
  return article.querySelector('[data-testid="User-Name"] a[href^="/"]');
}

function authorOf(article) {
  const link = authorLinkOf(article);
  return link ? link.getAttribute("href").slice(1).toLowerCase() : null;
}

// データが取れない場合のフォールバック: 本文・引用以外に「返信先」表示があるか
function hasReplyLabel(article) {
  const names = article.querySelectorAll('[data-testid="User-Name"]');
  const quote = names.length > 1 ? names[1].closest('[role="link"]') : null;
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!REPLY_LABEL.test(node.textContent)) continue;
    const el = node.parentElement;
    if (el.closest('[data-testid="tweetText"]')) continue;
    if (quote && quote.contains(el)) continue;
    return true;
  }
  return false;
}

function shouldHide(article, tweet, author, focalId) {
  if (!enabled.has(author)) return false;
  if (!tweet) return hasReplyLabel(article);
  // 開いているポスト自体は残す
  if (tweet.id_str === focalId) return false;
  if (!tweet.in_reply_to_status_id_str) return false;
  // 自分へのリプライ（連投スレッド）は本人の投稿の続きとして残す
  return (tweet.in_reply_to_screen_name ?? "").toLowerCase() !== author;
}

// 会話の縦線: アバター列にある幅 3px 以下の要素。
// セル上端から始まる短い線が「上からつながる線」、それより下から始まる線が「下へつながる線」。
function threadLinesOf(cell) {
  const cellRect = cell.getBoundingClientRect();
  const lines = { above: null, below: null };
  for (const el of cell.querySelectorAll("article div")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.width > 3 || r.height === 0 || r.left - cellRect.left > 120) continue;
    if (r.top - cellRect.top <= 1) lines.above ??= el;
    else lines.below ??= el;
  }
  return lines;
}

// 区切り線の色と太さをページ上の実物から取り、CSS 変数にしておく
function captureSeparatorStyle(cell) {
  const root = document.documentElement;
  if (root.style.getPropertyValue("--xrh-sep-color")) return;
  const cellRect = cell.getBoundingClientRect();
  for (const el of cell.querySelectorAll("div")) {
    const cs = getComputedStyle(el);
    if (!(parseFloat(cs.borderBottomWidth) > 0)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < cellRect.width * 0.9 || cellRect.bottom - r.bottom > 1) continue;
    root.style.setProperty("--xrh-sep-color", cs.borderBottomColor);
    root.style.setProperty("--xrh-sep-width", cs.borderBottomWidth);
    return;
  }
}

function visibleSibling(cell, dir) {
  let s = cell[dir];
  while (s && s.hasAttribute(HIDDEN_ATTR)) s = s[dir];
  return s;
}

// 縦線の位置・太さ・色をページ上の実物から取り、目印モードの線に使う
function captureLineStyle(cell, line) {
  const root = document.documentElement;
  if (root.style.getPropertyValue("--xrh-line-color")) return;
  const r = line.getBoundingClientRect();
  root.style.setProperty("--xrh-line-color", getComputedStyle(line).backgroundColor);
  root.style.setProperty("--xrh-line-x", `${r.left - cell.getBoundingClientRect().left}px`);
  root.style.setProperty("--xrh-line-w", `${r.width}px`);
}

// 非表示にしたセルをまたいで縦線がつながって見えないよう、前後の線を切る
function repairThreadLines() {
  for (const cell of document.querySelectorAll(`[${HIDDEN_ATTR}]`)) {
    const prev = visibleSibling(cell, "previousElementSibling");
    const next = visibleSibling(cell, "nextElementSibling");
    const below = prev && threadLinesOf(prev).below;
    if (below) {
      below.setAttribute(LINE_OFF_ATTR, "");
      prev.setAttribute(CUT_BELOW_ATTR, "");
    }
    const above = next && threadLinesOf(next).above;
    if (above) above.setAttribute(LINE_OFF_ATTR, "");
  }
}

// 目印モード: 縮めたセルに、前後のポストとつながる分だけ縦線を描く
function drawTraceLines() {
  for (const cell of document.querySelectorAll(`[${COLLAPSED_ATTR}]`)) {
    const prev = cell.previousElementSibling;
    const next = cell.nextElementSibling;
    const below = prev && !prev.hasAttribute(COLLAPSED_ATTR) && threadLinesOf(prev).below;
    const above = next && !next.hasAttribute(COLLAPSED_ATTR) && threadLinesOf(next).above;
    const line = below || above;
    if (line) captureLineStyle(line === below ? prev : next, line);
    const fromPrev = Boolean(below) || prev?.hasAttribute(COLLAPSED_ATTR);
    const toNext = Boolean(above) || next?.hasAttribute(COLLAPSED_ATTR);
    cell.style.setProperty("--xrh-line-top", fromPrev ? "0" : "50%");
    cell.style.setProperty("--xrh-line-bottom", toNext ? "0" : "50%");
    // 会話の最後だったリプライなら区切り線を引く
    if (!toNext) cell.setAttribute(COLLAPSED_END_ATTR, "");
  }
}

function clearDecorations() {
  for (const attr of [LINE_OFF_ATTR, CUT_BELOW_ATTR, COLLAPSED_END_ATTR]) {
    for (const el of document.querySelectorAll(`[${attr}]`)) el.removeAttribute(attr);
  }
}

// 区切り線の見本を探す（まだ取れていなければ）
function ensureSeparatorStyle() {
  if (document.documentElement.style.getPropertyValue("--xrh-sep-color")) return;
  for (const cell of document.querySelectorAll(`[data-testid="cellInnerDiv"]:not([${HIDDEN_ATTR}]):not([${COLLAPSED_ATTR}])`)) {
    captureSeparatorStyle(cell);
    if (document.documentElement.style.getPropertyValue("--xrh-sep-color")) return;
  }
}

// 表示名の絵文字は <img alt="😀"> で描かれるので、textContent だけだと絵文字が抜ける
function textWithEmoji(el) {
  let text = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
    else if (node.nodeName === "IMG") text += node.getAttribute("alt") ?? "";
    else if (node.nodeType === Node.ELEMENT_NODE) text += textWithEmoji(node);
  }
  return text;
}

// 登録ユーザーの表示名を content.js に知らせる（設定画面に表示するため）。
// 保存済みの名前と違えば content.js 側で上書きされるので、改名にも追従する。
function noteName(handle, tweet, article, pending) {
  if (!registered.has(handle)) return;
  const link = authorLinkOf(article);
  const name = tweet?.user?.name ?? (link && textWithEmoji(link).trim());
  if (!name || reportedNames.get(handle) === name) return;
  reportedNames.set(handle, name);
  pending[handle] = name;
}

// 前回の結果と食い違うセルだけ属性を付け外しする（セルは仮想スクロールで使い回される）
function applyMarks(attr, marks) {
  for (const cell of document.querySelectorAll(`[${attr}]`)) {
    if (!marks.has(cell)) {
      cell.removeAttribute(attr);
      if (attr === COLLAPSED_ATTR) {
        cell.style.removeProperty("--xrh-line-top");
        cell.style.removeProperty("--xrh-line-bottom");
      }
    }
  }
  for (const [cell, value] of marks) {
    if (cell.getAttribute(attr) !== value) cell.setAttribute(attr, value);
  }
}

function scan() {
  scanQueued = false;
  const focalId = location.pathname.match(/\/status\/(\d+)/)?.[1] ?? null;
  const toHide = new Map();
  const pendingNames = {};

  if (registered.size > 0) {
    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      const tweet = tweetDataOf(article);
      const author = (tweet?.user?.screen_name ?? authorOf(article) ?? "").toLowerCase();
      noteName(author, tweet, article, pendingNames);
      const cell = article.closest('[data-testid="cellInnerDiv"]');
      if (cell && shouldHide(article, tweet, author, focalId)) {
        toHide.set(cell, "");
      }
    }
  }

  applyMarks(HIDDEN_ATTR, showTrace ? new Map() : new Map([...toHide].map(([c]) => [c, ""])));
  applyMarks(COLLAPSED_ATTR, showTrace ? toHide : new Map());

  clearDecorations();
  if (toHide.size > 0) {
    ensureSeparatorStyle();
    if (showTrace) drawTraceLines();
    else repairThreadLines();
  }

  if (Object.keys(pendingNames).length > 0) {
    window.postMessage({ source: MESSAGE_SOURCE, names: pendingNames }, location.origin);
  }
}

function scheduleScan() {
  if (scanQueued) return;
  scanQueued = true;
  requestAnimationFrame(scan);
}

readTargets();
scheduleScan();

new MutationObserver(() => {
  readTargets();
  reportedNames.clear();
  scheduleScan();
}).observe(document.documentElement, { attributes: true, attributeFilter: [TARGETS_ATTR] });

new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
