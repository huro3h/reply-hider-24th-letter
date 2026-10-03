const normalize = (h) => h.trim().replace(/^@/, "").toLowerCase();

const TRASH_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

const form = document.getElementById("add");
const input = document.getElementById("handle");
const list = document.getElementById("list");
const showTrace = document.getElementById("show-trace");

chrome.storage.sync.get({ showTrace: false }).then((o) => (showTrace.checked = o.showTrace));
showTrace.addEventListener("change", () => chrome.storage.sync.set({ showTrace: showTrace.checked }));

const showToMe = document.getElementById("show-to-me");
chrome.storage.sync.get({ showToMe: false }).then((o) => (showToMe.checked = o.showToMe));
showToMe.addEventListener("change", () => chrome.storage.sync.set({ showToMe: showToMe.checked }));

// 旧形式（handles: string[]）からの移行込みで読む
async function loadUsers() {
  const { users, handles } = await chrome.storage.sync.get(["users", "handles"]);
  if (users) return users;
  const migrated = (handles || []).map((h) => ({ handle: normalize(h), enabled: true }));
  await chrome.storage.sync.set({ users: migrated });
  await chrome.storage.sync.remove("handles");
  return migrated;
}

async function updateUsers(fn) {
  await chrome.storage.sync.set({ users: fn(await loadUsers()) });
  render();
}

async function render() {
  const users = await loadUsers();
  const { names = {} } = await chrome.storage.local.get("names");

  list.replaceChildren();
  if (users.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "まだ登録がありません";
    list.append(li);
    return;
  }

  for (const { handle, enabled } of users) {
    const li = document.createElement("li");
    li.classList.toggle("off", !enabled);

    const toggle = document.createElement("label");
    toggle.className = "switch small";
    toggle.title = enabled ? "非表示: オン" : "非表示: オフ";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = enabled;
    checkbox.setAttribute("aria-label", `@${handle} のリプライを非表示`);
    checkbox.addEventListener("change", () =>
      updateUsers((us) => us.map((u) => (u.handle === handle ? { ...u, enabled: checkbox.checked } : u))),
    );
    const slider = document.createElement("span");
    slider.className = "slider";
    toggle.append(checkbox, slider);

    const who = document.createElement("span");
    who.className = "who";
    if (names[handle]) {
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = names[handle];
      who.append(name);
    }
    const h = document.createElement("span");
    h.className = "handle";
    h.textContent = "@" + handle;
    who.append(h);

    const remove = document.createElement("button");
    remove.className = "icon-btn remove";
    remove.title = "削除";
    remove.setAttribute("aria-label", `@${handle} を削除`);
    remove.innerHTML = TRASH_ICON;
    remove.addEventListener("click", () => updateUsers((us) => us.filter((u) => u.handle !== handle)));

    li.append(toggle, who, remove);
    list.append(li);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const handle = normalize(input.value);
  input.value = "";
  if (!/^\w{1,15}$/.test(handle)) return;
  updateUsers((us) => (us.some((u) => u.handle === handle) ? us : [...us, { handle, enabled: true }]));
});

// 表示名は x.com 側で見つかり次第保存されるので、開いている間も追従する
chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === "local" && changes.names) || (area === "sync" && changes.users)) render();
});

render();

document.getElementById("version").textContent = "v" + chrome.runtime.getManifest().version;
