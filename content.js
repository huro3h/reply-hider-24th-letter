// 登録ユーザーを storage から読み、ページ側スクリプト（main.js）に属性で渡す。
// main.js はページの JS 世界で動くため chrome.storage を使えない。
// 逆方向（main.js が見つけた表示名）は postMessage で受け取って保存する。

const ATTR = "data-xrh-targets";
const MESSAGE_SOURCE = "x-reply-hider";
const normalize = (h) => h.trim().replace(/^@/, "").toLowerCase();

let users = [];
let showTrace = false;

// 旧形式（handles: string[]）からの移行込みで読む
async function loadUsers() {
  const { users, handles } = await chrome.storage.sync.get(["users", "handles"]);
  if (users) return users;
  const migrated = (handles || []).map((h) => ({ handle: normalize(h), enabled: true }));
  await chrome.storage.sync.set({ users: migrated });
  await chrome.storage.sync.remove("handles");
  return migrated;
}

function publish() {
  document.documentElement.setAttribute(ATTR, JSON.stringify({
    enabled: users.filter((u) => u.enabled).map((u) => u.handle),
    all: users.map((u) => u.handle),
    trace: showTrace,
  }));
}

Promise.all([loadUsers(), chrome.storage.sync.get({ showTrace: false })]).then(([loaded, options]) => {
  users = loaded;
  showTrace = options.showTrace;
  publish();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !(changes.users || changes.showTrace)) return;
  if (changes.users) users = changes.users.newValue || [];
  if (changes.showTrace) showTrace = Boolean(changes.showTrace.newValue);
  publish();
});

// 読んで書き戻す間に次のメッセージが割り込むと片方の更新が消えるので、1件ずつ順に処理する
let saving = Promise.resolve();

async function saveNames(found) {
  const registered = new Set(users.map((u) => u.handle));
  const { names = {} } = await chrome.storage.local.get("names");
  let changed = false;
  for (const [handle, name] of Object.entries(found)) {
    // 保存済みと違えば（改名されていれば）最新の表示名で上書きする
    if (!registered.has(handle) || typeof name !== "string" || names[handle] === name) continue;
    names[handle] = name;
    changed = true;
  }
  if (changed) await chrome.storage.local.set({ names });
}

window.addEventListener("message", (e) => {
  if (e.source !== window || e.data?.source !== MESSAGE_SOURCE) return;
  const found = e.data.names || {};
  saving = saving.then(() => saveNames(found)).catch(() => {});
});
