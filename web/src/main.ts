import "./style.css";
import { type Strategy, type TeamsCurrentResponse, type WsMessage } from "./types";
import {
  apiGetParticipants,
  apiGetTeamsCurrent,
  apiPostDemoRegen,
  apiPostExclude,
  apiPostImportCsv,
  apiPostMatchingConfig,
  apiPutParticipant,
} from "./net/api";
import { createViz } from "./viz/viz";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const ROLE_LABEL: Record<string, string> = {
  dev: "разработчик",
  design: "дизайнер",
  data: "data/ML",
  pm: "PM",
  biz: "biz",
};

function now() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function renderShell() {
  $("app")!.innerHTML = `
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="logo" aria-hidden="true"></div>
        <div>
          <h1>Constella</h1>
          <div class="subtitle">Интеллектуальное формирование команд как “созвездий”</div>
        </div>
      </div>

      <div class="card">
        <div class="statusRow" style="margin-bottom:10px;">
          <div class="statusPill" title="Состояние подключения">
            <span class="statusDot" id="stDot"></span>
            <span id="stText">подключение…</span>
          </div>
          <div class="smallNote" id="stDetail">API/WS</div>
        </div>

        <div class="divider"></div>
        <div class="smallNote">
          <strong>Как читать Constella</strong><br/>
          1) Сначала выбирается <strong>ядро</strong> (2–3 знакомых).<br/>
          2) Потом добавляются <strong>bridges</strong> — люди из другого фона/города/вуза/сообщества.<br/>
          3) В конце выравниваются команды по уровню и ролям.
        </div>
        <div class="divider"></div>

        <div class="row">
          <div>
            <label for="strategy">Стратегия</label>
            <select id="strategy">
              <option value="conservative">Консервативная</option>
              <option value="experimental" selected>Экспериментальная</option>
              <option value="chaotic">Хаотическая</option>
            </select>
          </div>
          <div>
            <label for="teamSize">Размер команды</label>
            <input id="teamSize" type="number" min="3" max="8" value="5" />
          </div>
        </div>

        <div class="divider"></div>
        <label for="rt">Real-time (WebSocket)</label>
        <input id="rt" type="range" min="0" max="1" step="1" value="1" />
        <div class="smallNote" id="rtLabel">Включено: получаем обновления команд/графа по WebSocket.</div>

        <div class="divider"></div>
        <div class="smallNote"><strong>Тюнинг матчинга</strong> (понятно):</div>
        <label for="tStability">Стабильность ядра</label>
        <input id="tStability" type="range" min="0" max="1" step="0.05" value="0.5" />
        <label for="tNovelty">Инновационность мостов</label>
        <input id="tNovelty" type="range" min="0" max="1" step="0.05" value="0.7" />
        <label for="tBalance">Баланс команд</label>
        <input id="tBalance" type="range" min="0" max="1" step="0.05" value="0.6" />
        <label for="tBridges">Bridges (override)</label>
        <select id="tBridges">
          <option value="">по стратегии</option>
          <option value="1">1 мост</option>
          <option value="2">2 моста</option>
        </select>

        <div class="divider"></div>
        <div class="actions">
          <button id="run">Сформировать команды</button>
          <button class="secondary" id="regen">Новые демо-данные</button>
        </div>

        <div class="pillRow">
          <div class="pill"><strong>ядро</strong>: 2–3 знакомых</div>
          <div class="pill"><strong>bridges</strong>: 1–2 “моста”</div>
          <div class="pill"><strong>баланс</strong>: выравнивание</div>
        </div>

        <div class="tabs" role="tablist" aria-label="Разделы">
          <button class="tabBtn active" id="tabTeams" role="tab" aria-selected="true">Созвездия</button>
          <button class="tabBtn" id="tabPeople" role="tab" aria-selected="false">Участники</button>
        </div>
      </div>

      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div style="font-weight:800;">Команды</div>
          <button class="secondary" id="clearFocus" style="width:auto;padding:8px 10px;">Сброс фокуса</button>
        </div>
        <div class="divider"></div>
        <label for="q">Поиск (имя/город/вуз/сообщество/роль)</label>
        <input id="q" placeholder="например: Алматы, Astana IT University, design…" />
        <div class="divider"></div>
        <div class="smallNote"><strong>Слои связей</strong>: какие ребра рисовать в созвездиях.</div>
        <div class="pillRow" style="margin-top:8px;">
          <label class="pill" style="cursor:pointer;">
            <input type="checkbox" id="tagWorked" style="margin-right:6px;" checked />
            <strong>worked</strong>
          </label>
          <label class="pill" style="cursor:pointer;">
            <input type="checkbox" id="tagUni" style="margin-right:6px;" />
            <strong>uni</strong>
          </label>
          <label class="pill" style="cursor:pointer;">
            <input type="checkbox" id="tagCommunity" style="margin-right:6px;" checked />
            <strong>community</strong>
          </label>
          <label class="pill" style="cursor:pointer;">
            <input type="checkbox" id="tagCity" style="margin-right:6px;" />
            <strong>city</strong>
          </label>
        </div>
        <div class="divider"></div>
        <div class="actions">
          <button class="secondary" id="copyTeams">Скопировать команды (JSON)</button>
          <button class="secondary" id="copyNames">Скопировать списки (текст)</button>
        </div>
        <div class="divider"></div>
        <div class="view active" id="viewTeams">
          <div class="teamsList" id="teams"></div>
        </div>
        <div class="view" id="viewPeople">
          <div class="smallNote"><strong>CSV импорт</strong>: вставьте CSV и нажмите “Импорт”.</div>
          <div class="divider"></div>
          <label for="csvParticipants">participants.csv (id,name,primaryRole,secondaryRole,city,university,community,level)</label>
          <textarea id="csvParticipants" class="csvBox" placeholder="id,name,primaryRole,city,university,community,level&#10;p1,Айгерім Серікұлы,design,Алматы,KIMEP University,Design KZ,4"></textarea>
          <div class="divider"></div>
          <label for="csvEdges">edges.csv (a,b,w,tags)</label>
          <textarea id="csvEdges" class="csvBox" placeholder="a,b,w,tags&#10;p1,p2,0.8,worked|community"></textarea>
          <div class="divider"></div>
          <div class="actions">
            <button class="secondary" id="importReplace">Импорт (заменить)</button>
            <button class="secondary" id="importMerge">Импорт (добавить)</button>
          </div>
          <div class="divider"></div>
          <label for="pq">Фильтр участников</label>
          <input id="pq" placeholder="например: Астана, NU, разработчик…" />
          <div class="divider"></div>
          <div style="max-height:380px;overflow:auto;border-radius:12px;">
            <table class="table" id="peopleTable"></table>
          </div>
          <div class="divider"></div>
          <div class="smallNote">Можно: исключать из матчинга, редактировать роль/уровень/город/вуз/сообщество.</div>
        </div>
        <div class="divider"></div>
        <div class="smallNote">Клик по команде — фокус на созвездии. Клик по участнику — объяснение “почему здесь”.</div>
      </div>

      <div class="card">
        <div class="metrics">
          <div class="metric"><div class="k">Команд</div><div class="v" id="mTeams">—</div></div>
          <div class="metric"><div class="k">Участников</div><div class="v" id="mPeople">—</div></div>
          <div class="metric"><div class="k">Средн. инновационность</div><div class="v" id="mNovelty">—</div></div>
          <div class="metric"><div class="k">Дисбаланс навыков</div><div class="v" id="mBalance">—</div></div>
        </div>
        <div class="divider"></div>
        <div class="smallNote">
          Ядра подсвечены как плотные группы, “мосты” — участники, которые соединяют разные кластеры (роль/город/универ/сообщество).
        </div>
      </div>

      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div style="font-weight:700;">События / объяснимость</div>
          <button class="secondary" id="clearLog" style="width:auto;padding:8px 10px;">Очистить</button>
        </div>
        <div class="divider"></div>
        <div class="log" id="log" aria-live="polite"></div>
      </div>
    </aside>

    <main class="main">
      <canvas id="c"></canvas>
      <div class="hud">
        <div class="hint">Наведение показывает карточку участника. Live‑обновления приходят с сервера.</div>
      </div>
      <div class="legend">
        <span class="item"><span class="dot" style="background:var(--core)"></span>ядро</span>
        <span class="item"><span class="dot" style="background:var(--bridge)"></span>bridge</span>
        <span class="item"><span class="dot" style="background:rgba(255,255,255,0.65)"></span>обычный</span>
      </div>
      <div class="toast" id="toast"></div>
    </main>
  </div>
  `;
}

function pushLog(msg: string) {
  const el = $("log") as HTMLDivElement;
  const line = `[${now()}] ${msg}`;
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 6;
  el.textContent = (el.textContent ? el.textContent + "\n" : "") + line;
  if (atBottom) el.scrollTop = el.scrollHeight;
}

function toast(msgHtml: string) {
  const host = $("toast") as HTMLDivElement;
  const t = document.createElement("div");
  t.className = "t";
  t.innerHTML = msgHtml;
  host.appendChild(t);
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateY(-2px)";
    t.style.transition = "opacity 250ms ease, transform 250ms ease";
  }, 1600);
  setTimeout(() => t.remove(), 2100);
}

function setStatus(kind: "ok" | "warn" | "bad", text: string, detail: string) {
  const dot = $("stDot") as HTMLSpanElement;
  const stText = $("stText") as HTMLSpanElement;
  const stDetail = $("stDetail") as HTMLDivElement;
  dot.className = `statusDot ${kind}`;
  stText.textContent = text;
  stDetail.textContent = detail;
}

function updateMetricsUI(res: TeamsCurrentResponse) {
  const teams = res.result?.teams || [];
  const people = res.dataset?.participants?.length ?? 0;
  $("mPeople").textContent = String(people);
  $("mTeams").textContent = String(teams.length || 0);
  const novelty = res.result?.metrics?.noveltyAvg ?? 0;
  const balance = res.result?.metrics?.balanceStd ?? 0;
  $("mNovelty").textContent = `${Math.round(novelty * 100)}%`;
  $("mBalance").textContent = balance.toFixed(2);
}

async function main() {
  renderShell();
  pushLog("Constella: подключаюсь к бэкенду…");
  setStatus("warn", "подключение…", "API/WS");

  const canvas = $("c") as HTMLCanvasElement;
  const viz = createViz(canvas);
  let focusedTeamIdx: number | null = null;
  let lastSnapshot: TeamsCurrentResponse | null = null;
  const qEl = $("q") as HTMLInputElement | null;
  const pqEl = $("pq") as HTMLInputElement | null;
  let peopleCache: { participants: any[]; excluded: string[] } | null = null;
  let edgeTags: string[] = [];

  function renderTeams(snapshot: TeamsCurrentResponse) {
    const host = $("teams") as HTMLDivElement;
    const byId = new Map(snapshot.dataset.participants.map((p) => [p.id, p]));
    const q = (qEl?.value || "").trim().toLowerCase();
    host.innerHTML = "";

    snapshot.result.teams.forEach((t, idx) => {
      // team-level filtering: show team if any member matches query
      if (q) {
        let ok = false;
        for (const pid of t.members) {
          const p = byId.get(pid);
          if (!p) continue;
          const hay = `${p.name} ${p.city} ${p.university} ${p.community} ${p.primaryRole} ${p.secondaryRole || ""} ${ROLE_LABEL[p.primaryRole] || ""}`.toLowerCase();
          if (hay.includes(q)) {
            ok = true;
            break;
          }
        }
        if (!ok) return;
      }

      const div = document.createElement("div");
      div.className = `teamItem${focusedTeamIdx === idx ? " active" : ""}`;
      div.dataset.teamIdx = String(idx);

      const coreCount = t.core.length;
      const bridgeCount = t.bridges.length;

      const header = document.createElement("div");
      header.className = "teamHdr";
      header.innerHTML = `
        <div class="teamTitle">${t.id}</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="tag core">ядро: ${coreCount}</span>
          <span class="tag bridge">мосты: ${bridgeCount}</span>
        </div>
      `;
      div.appendChild(header);

      const people = document.createElement("div");
      people.className = "teamPeople";
      for (const pid of t.members) {
        const p = byId.get(pid);
        if (!p) continue;
        if (q) {
          const hay = `${p.name} ${p.city} ${p.university} ${p.community} ${p.primaryRole} ${p.secondaryRole || ""} ${ROLE_LABEL[p.primaryRole] || ""}`.toLowerCase();
          if (!hay.includes(q)) continue;
        }
        const row = document.createElement("div");
        row.className = "personRow";
        const isCore = t.core.includes(pid) && t.core.length > 1;
        const isBridge = t.bridges.includes(pid);
        const badges = `
          ${isCore ? `<span class="badge core">ядро</span>` : ""}
          ${isBridge ? `<span class="badge bridge">bridge</span>` : ""}
        `;
        row.innerHTML = `
          <div>
            <div><strong>${p.name}</strong> <span class="meta">(${ROLE_LABEL[p.primaryRole] || p.primaryRole}${p.secondaryRole ? `/${ROLE_LABEL[p.secondaryRole] || p.secondaryRole}` : ""}, lvl ${p.level})</span></div>
            <div class="meta">${p.city} • ${p.university} • ${p.community}</div>
          </div>
          <div class="badges">${badges}</div>
        `;
        row.addEventListener("click", (e) => {
          e.stopPropagation();
          const r = t.reasons.find((x) => x.id === pid)?.text;
          if (r) {
            pushLog(`${t.id}: ${p.name} — ${r}`);
            toast(`<strong>${p.name}</strong><br/>${r}`);
          } else {
            pushLog(`${t.id}: ${p.name}`);
            toast(`<strong>${p.name}</strong><br/>участник команды`);
          }
        });
        people.appendChild(row);
      }
      div.appendChild(people);

      div.addEventListener("click", () => {
        focusedTeamIdx = focusedTeamIdx === idx ? null : idx;
        viz.focusTeam(focusedTeamIdx);
        renderTeams(snapshot);
        pushLog(`focus: ${focusedTeamIdx == null ? "none" : snapshot.result.teams[focusedTeamIdx].id}`);
      });

      host.appendChild(div);
    });
  }

  function applySnapshot(snapshot: TeamsCurrentResponse, reason: string) {
    lastSnapshot = snapshot;
    updateMetricsUI(snapshot);
    viz.setData({
      dataset: snapshot.dataset,
      result: snapshot.result,
      edgeTags,
    });
    renderTeams(snapshot);
    pushLog(`${reason}: teams=${snapshot.result.teams.length}, edges=${snapshot.dataset.edges.length}`);
  }

  // initial snapshot
  const first = await apiGetTeamsCurrent();
  applySnapshot(first, "snapshot");
  toast("<strong>Constella</strong>: получен снимок команд");
  setStatus("ok", "API: ok", "WS: по настройке");

  // UI actions
  const strategyEl = $("strategy") as HTMLSelectElement;
  const teamSizeEl = $("teamSize") as HTMLInputElement;
  const rtEl = $("rt") as HTMLInputElement;
  const rtLabel = $("rtLabel") as HTMLDivElement;
  const tStabilityEl = $("tStability") as HTMLInputElement;
  const tNoveltyEl = $("tNovelty") as HTMLInputElement;
  const tBalanceEl = $("tBalance") as HTMLInputElement;
  const tBridgesEl = $("tBridges") as HTMLSelectElement;

  async function sendConfig() {
    const strategy = strategyEl.value as Strategy;
    const teamSize = Math.max(3, Math.min(8, parseInt(teamSizeEl.value, 10) || 5));
    const bridgesRaw = String(tBridgesEl.value || "").trim();
    const bridges = bridgesRaw ? Number(bridgesRaw) : null;
    const tuning = {
      stability: Number(tStabilityEl.value),
      novelty: Number(tNoveltyEl.value),
      balance: Number(tBalanceEl.value),
      bridges: bridges === 1 || bridges === 2 ? bridges : null,
    };
    const res = await apiPostMatchingConfig({ strategy, teamSize, tuning });
    pushLog(`config: strategy=${res.config.strategy}, teamSize=${res.config.teamSize}`);
    toast(`<strong>Конфиг</strong>: ${res.config.strategy}, teamSize=${res.config.teamSize}`);
  }

  $("run").addEventListener("click", sendConfig);
  strategyEl.addEventListener("change", sendConfig);
  teamSizeEl.addEventListener("change", sendConfig);
  tStabilityEl.addEventListener("input", () => sendConfig());
  tNoveltyEl.addEventListener("input", () => sendConfig());
  tBalanceEl.addEventListener("input", () => sendConfig());
  tBridgesEl.addEventListener("change", sendConfig);
  $("regen").addEventListener("click", async () => {
    await apiPostDemoRegen();
    pushLog("demo: новые данные запрошены");
    toast("<strong>Демо</strong>: данные обновлены");
  });

  $("copyTeams")?.addEventListener("click", async () => {
    if (!lastSnapshot) return;
    const payload = {
      config: lastSnapshot.config,
      metrics: lastSnapshot.result.metrics,
      teams: lastSnapshot.result.teams,
      participants: lastSnapshot.dataset.participants,
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    pushLog("export: скопирован JSON команд");
    toast("<strong>Экспорт</strong>: JSON скопирован в буфер");
  });

  $("copyNames")?.addEventListener("click", async () => {
    if (!lastSnapshot) return;
    const byId = new Map(lastSnapshot.dataset.participants.map((p) => [p.id, p]));
    const lines: string[] = [];
    for (const t of lastSnapshot.result.teams) {
      lines.push(`${t.id}`);
      for (const pid of t.members) {
        const p = byId.get(pid);
        if (!p) continue;
        lines.push(`- ${p.name} (${ROLE_LABEL[p.primaryRole] || p.primaryRole}) — ${p.city}, ${p.university}`);
      }
      lines.push("");
    }
    await navigator.clipboard.writeText(lines.join("\n"));
    pushLog("export: скопирован текстовый список команд");
    toast("<strong>Экспорт</strong>: текст скопирован в буфер");
  });

  qEl?.addEventListener("input", () => {
    if (!lastSnapshot) return;
    renderTeams(lastSnapshot);
  });

  function escapeHtml(s: string) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setActiveView(which: "teams" | "people") {
    const tabTeams = $("tabTeams") as HTMLButtonElement;
    const tabPeople = $("tabPeople") as HTMLButtonElement;
    const viewTeams = $("viewTeams") as HTMLDivElement;
    const viewPeople = $("viewPeople") as HTMLDivElement;
    const isTeams = which === "teams";
    tabTeams.classList.toggle("active", isTeams);
    tabPeople.classList.toggle("active", !isTeams);
    tabTeams.setAttribute("aria-selected", String(isTeams));
    tabPeople.setAttribute("aria-selected", String(!isTeams));
    viewTeams.classList.toggle("active", isTeams);
    viewPeople.classList.toggle("active", !isTeams);
  }

  async function refreshPeople() {
    const res = await apiGetParticipants();
    peopleCache = { participants: res.participants, excluded: res.excluded };
    renderPeopleTable();
  }

  function renderPeopleTable() {
    const table = $("peopleTable") as HTMLTableElement;
    if (!peopleCache) {
      table.innerHTML = "";
      return;
    }
    const q = (pqEl?.value || "").trim().toLowerCase();
    const excluded = new Set(peopleCache.excluded || []);
    const rows = peopleCache.participants.filter((p) => {
      if (!q) return true;
      const hay = `${p.id} ${p.name} ${p.city} ${p.university} ${p.community} ${p.primaryRole} ${p.secondaryRole || ""} ${ROLE_LABEL[p.primaryRole] || ""}`.toLowerCase();
      return hay.includes(q);
    });

    table.innerHTML = `
      <thead>
        <tr>
          <th>Имя</th>
          <th>Роль</th>
          <th>Город</th>
          <th>Вуз</th>
          <th>Сообщество</th>
          <th>lvl</th>
          <th>Матчинг</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((p) => {
            const off = excluded.has(p.id);
            return `
              <tr data-id="${p.id}">
                <td><strong>${escapeHtml(p.name || "")}</strong><div class="tiny">${escapeHtml(p.id)}</div></td>
                <td>
                  <select class="inputMini" data-field="primaryRole">
                    ${["dev", "design", "data", "pm", "biz"]
                      .map((r) => `<option value="${r}" ${p.primaryRole === r ? "selected" : ""}>${ROLE_LABEL[r] || r}</option>`)
                      .join("")}
                  </select>
                </td>
                <td><input class="inputMini" data-field="city" value="${escapeHtml(p.city || "")}"/></td>
                <td><input class="inputMini" data-field="university" value="${escapeHtml(p.university || "")}"/></td>
                <td><input class="inputMini" data-field="community" value="${escapeHtml(p.community || "")}"/></td>
                <td><input class="inputMini" data-field="level" value="${escapeHtml(String(p.level ?? ""))}"/></td>
                <td>
                  <button class="btnMini secondary" data-action="exclude">${off ? "Включить" : "Исключить"}</button>
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    `;

    table.querySelectorAll("tr[data-id]").forEach((tr) => {
      const id = (tr as HTMLElement).dataset.id!;
      tr.querySelectorAll("[data-field]").forEach((el) => {
        el.addEventListener("change", async (e) => {
          const target = e.target as HTMLInputElement | HTMLSelectElement;
          const field = (target as HTMLElement).getAttribute("data-field")!;
          const value = target.value;
          await apiPutParticipant(id, field === "level" ? { [field]: Number(value) } : { [field]: value });
          pushLog(`participant.updated: ${id} ${field}=${value}`);
          toast(`<strong>Обновлено</strong>: ${id} ${field}`);
          await refreshPeople();
        });
      });
      const btn = tr.querySelector("[data-action='exclude']") as HTMLButtonElement | null;
      btn?.addEventListener("click", async () => {
        const off = excluded.has(id);
        await apiPostExclude(id, !off);
        pushLog(`exclude: ${id} -> ${!off}`);
        toast(`<strong>Матчинг</strong>: ${!off ? "исключен" : "включен"}`);
        await refreshPeople();
      });
    });
  }

  pqEl?.addEventListener("input", () => renderPeopleTable());

  $("importReplace").addEventListener("click", async () => {
    const participantsCsv = ($("csvParticipants") as HTMLTextAreaElement).value;
    const edgesCsv = ($("csvEdges") as HTMLTextAreaElement).value;
    await apiPostImportCsv({ mode: "replace", participantsCsv, edgesCsv });
    pushLog("import.csv: replace");
    toast("<strong>Импорт</strong>: данные заменены");
    const snap = await apiGetTeamsCurrent();
    applySnapshot(snap, "import.csv");
    await refreshPeople();
  });

  $("importMerge").addEventListener("click", async () => {
    const participantsCsv = ($("csvParticipants") as HTMLTextAreaElement).value;
    const edgesCsv = ($("csvEdges") as HTMLTextAreaElement).value;
    await apiPostImportCsv({ mode: "merge", participantsCsv, edgesCsv });
    pushLog("import.csv: merge");
    toast("<strong>Импорт</strong>: данные добавлены");
    const snap = await apiGetTeamsCurrent();
    applySnapshot(snap, "import.csv");
    await refreshPeople();
  });

  $("tabTeams").addEventListener("click", () => setActiveView("teams"));
  $("tabPeople").addEventListener("click", async () => {
    setActiveView("people");
    await refreshPeople();
  });

  function recomputeEdgeTagsAndRedraw() {
    const tags: string[] = [];
    if (($("tagWorked") as HTMLInputElement).checked) tags.push("worked");
    if (($("tagUni") as HTMLInputElement).checked) tags.push("uni");
    if (($("tagCommunity") as HTMLInputElement).checked) tags.push("community");
    if (($("tagCity") as HTMLInputElement).checked) tags.push("city");
    edgeTags = tags;
    if (lastSnapshot) applySnapshot(lastSnapshot, "viz.tags");
  }

  ["tagWorked", "tagUni", "tagCommunity", "tagCity"].forEach((id) => {
    ($(id) as HTMLInputElement).addEventListener("change", recomputeEdgeTagsAndRedraw);
  });

  // default tags
  recomputeEdgeTagsAndRedraw();
  $("clearLog").addEventListener("click", () => {
    ($("log") as HTMLDivElement).textContent = "";
  });
  $("clearFocus").addEventListener("click", () => {
    focusedTeamIdx = null;
    viz.focusTeam(null);
    // перерисуем список через текущий снимок
    apiGetTeamsCurrent().then((snap) => renderTeams(snap)).catch(() => {});
    pushLog("focus: none");
  });

  // WebSocket live updates
  let ws: WebSocket | null = null;
  let wsWanted = true;
  let wsBackoffMs = 400;

  function connectWs() {
    if (ws) ws.close();
    ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
    ws.onopen = () => {
      wsBackoffMs = 400;
      pushLog("ws: connected");
      setStatus("ok", "API: ok", "WS: connected");
    };
    ws.onclose = () => {
      pushLog("ws: disconnected");
      setStatus("warn", "API: ok", wsWanted ? "WS: reconnecting…" : "WS: off");
      if (wsWanted) scheduleReconnect();
    };
    ws.onerror = () => {
      pushLog("ws: error");
      setStatus("warn", "API: ok", "WS: error");
    };
    ws.onmessage = async (ev) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.type === "graph.updated") {
        pushLog(`event: ${msg.payload?.reason || "graph.updated"}`);
      }
      if (msg.type === "teams.updated") {
        try {
          const snap = await apiGetTeamsCurrent();
          applySnapshot(snap, msg.payload?.reason || "teams.updated");
          toast(`<strong>Обновление</strong>: ${msg.payload?.reason || "teams.updated"}`);
        } catch {
          pushLog("api: /api/teams/current failed");
          setStatus("bad", "API: error", "проверьте сервер");
        }
      }
    };
  }

  function scheduleReconnect() {
    const ms = wsBackoffMs;
    wsBackoffMs = Math.min(8000, Math.round(wsBackoffMs * 1.6));
    setTimeout(() => {
      if (!wsWanted) return;
      connectWs();
    }, ms);
  }

  function toggleWs(on: boolean) {
    wsWanted = on;
    if (on) {
      rtLabel.textContent = "Включено: получаем обновления команд/графа по WebSocket.";
      connectWs();
    } else {
      rtLabel.textContent = "Выключено: обновления только вручную (кнопка / смена конфигурации).";
      if (ws) ws.close();
      ws = null;
      setStatus("ok", "API: ok", "WS: off");
    }
  }

  rtEl.addEventListener("input", (e) => {
    const on = String((e.target as HTMLInputElement).value) === "1";
    pushLog(`ws: ${on ? "ON" : "OFF"}`);
    toggleWs(on);
  });
  toggleWs(rtEl.value === "1");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = `<div style="padding:24px;color:white">Ошибка запуска Constella: ${String(err)}</div>`;
});
