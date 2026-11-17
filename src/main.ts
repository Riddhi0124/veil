import "./style.css";
import { createFirebaseEngine, type Engine, type DeviceStatus } from "./engine";
import { firebaseConfigured, initFirebase, type FirebaseServices } from "./firebase";
import { createMockEngine } from "./mock";
import { chooseRoute, decode, type DecodeState } from "./pipeline";
import { SAMPLES } from "./samples";
import {
  buildEntities, detectHeuristic, detectRules, findLeaks, redact, rehydrate, segment,
} from "./shield";
import type { ChatTurn, Entity, FlightStep, RouteChoice } from "./types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const fmtMs = (ms?: number) => (ms == null ? "" : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);

const params = new URLSearchParams(location.search);

const state = {
  engine: null as Engine | null,
  fb: null as FirebaseServices | null,
  text: "",
  sampleId: "" as string,
  entities: null as Entity[] | null,
  choice: "auto" as RouteChoice,
  online: navigator.onLine,
  device: "unsupported" as DeviceStatus,
  downloadProgress: null as number | null,
  decode: null as DecodeState | null,
  chat: [] as ChatTurn[],
  chatLog: [] as FlightStep[],
  busy: false,
  error: "",
  initError: "",
};

// ---------- boot ----------
async function boot() {
  if (params.get("mock") === "1") {
    state.engine = createMockEngine();
  } else if (firebaseConfigured) {
    try {
      state.fb = await initFirebase();
      state.engine = createFirebaseEngine(state.fb);
    } catch (e) {
      state.initError = e instanceof Error ? e.message : String(e);
    }
  }
  if (state.engine) state.device = await state.engine.deviceStatus();
  window.addEventListener("online", () => { state.online = true; renderStatus(); });
  window.addEventListener("offline", () => { state.online = false; renderStatus(); });
  renderAll();
}

// ---------- status pills ----------
function renderStatus() {
  const d = state.device;
  const pct = state.downloadProgress;
  let device = "";
  if (pct != null && pct < 1) {
    device = `<span class="pill warn"><span class="dot"></span>Downloading Gemini Nano <span class="bar"><i style="width:${Math.round(pct * 100)}%"></i></span></span>`;
  } else if (d === "available") {
    device = `<span class="pill good"><span class="dot"></span>Gemini Nano ready · on-device</span>`;
  } else if (d === "downloadable" || d === "downloading") {
    device = `<span class="pill warn"><span class="dot"></span>Gemini Nano not downloaded <button id="wake">Download</button></span>`;
  } else {
    device = `<span class="pill cloud"><span class="dot"></span>No local model here · cloud fallback active</span>`;
  }
  const net = state.online
    ? `<span class="pill good"><span class="dot"></span>Online</span>`
    : `<span class="pill warn"><span class="dot"></span>Offline · on-device only</span>`;
  let fb = `<span class="pill bad"><span class="dot"></span>Firebase not configured</span>`;
  if (state.engine?.kind === "mock") fb = `<span class="pill warn"><span class="dot"></span>Demo mode (no Firebase calls)</span>`;
  else if (state.fb) fb = `<span class="pill good"><span class="dot"></span>Firebase AI Logic · App Check ${state.fb.appCheck === "debug" ? "(debug)" : "on"}</span>`;
  $("status").innerHTML = device + net + fb;
  document.getElementById("wake")?.addEventListener("click", wake);
}

async function wake() {
  if (!state.engine) return;
  state.downloadProgress = 0;
  renderStatus();
  try {
    await state.engine.warmUp((p) => { state.downloadProgress = p; renderStatus(); });
  } catch (e) {
    state.error = `Couldn't start the on-device model: ${e instanceof Error ? e.message : e}`;
  }
  state.downloadProgress = null;
  state.device = await state.engine.deviceStatus();
  renderAll();
}

// ---------- banner ----------
function renderBanner() {
  const el = $("banner");
  if (state.engine) { el.innerHTML = ""; return; }
  el.innerHTML = `<div class="banner"><strong>Connect your Firebase project to run live.</strong> ${
    state.initError ? `<span class="err">${esc(state.initError)}</span> ` : ""
  }Copy <code>.env.example</code> to <code>.env.local</code>, add your web app config and an App Check debug token (see the README), then restart. Want a look around first? <a href="?mock=1">Open demo mode</a>, which uses canned answers and makes no Firebase calls.</div>`;
}

// ---------- document panel ----------
function renderDoc() {
  const reviewing = state.entities !== null;
  const samples = SAMPLES.map(
    (s) => `<button class="chip ${state.sampleId === s.id ? "active" : ""}" data-sample="${s.id}">${esc(s.label)}<small>${esc(s.blurb)}</small></button>`,
  ).join("");
  const active = state.entities?.filter((e) => e.redact).length ?? 0;
  const body = reviewing
    ? `<div class="shieldview" id="shieldview" tabindex="0">${segment(state.text, state.entities!)
        .map((s) =>
          s.entity
            ? `<mark class="ent ${s.entity.redact ? "on" : "off"}" role="button" tabindex="0" aria-pressed="${s.entity.redact}" data-token="${esc(s.entity.token)}" title="${esc(s.entity.type)} · click to ${s.entity.redact ? "reveal" : "shield"}">${s.entity.redact ? esc(s.entity.token.slice(1, -1).replace("_", " ")) : esc(s.text)}</mark>`
            : esc(s.text),
        )
        .join("")}</div>
       <div class="legend"><span><b>${active}</b> details shielded</span><span>Click any highlight to change it · select text to shield more</span></div>`
    : `<textarea id="doc" placeholder="Paste a bill, lease, insurance letter or lab result. Nothing is uploaded until it has been shielded." aria-label="Document text">${esc(state.text)}</textarea>
       <div class="legend"><span>${state.text.length.toLocaleString()} characters</span><label class="btn ghost sm" for="file">Open .txt</label><input id="file" type="file" accept=".txt,text/plain" hidden /></div>`;
  const seg = (v: RouteChoice, label: string) => `<button data-choice="${v}" aria-pressed="${state.choice === v}">${label}</button>`;
  $("doc-panel").innerHTML = `
    <div class="chips" role="group" aria-label="Sample documents">${samples}</div>
    ${body}
    <div class="row">
      <div><div class="lbl">Where may it think?</div>
        <div class="seg" role="group" aria-label="Inference routing">${seg("auto", "Auto")}${seg("local", "On-device only")}${seg("cloud", "Cloud")}</div></div>
      <span class="spacer"></span>
      ${reviewing ? `<button class="btn ghost sm" id="edit">Edit text</button>` : ""}
      <button class="btn" id="decode" ${!state.engine || !state.text.trim() || state.busy ? "disabled" : ""}>${state.busy ? "Working…" : reviewing ? "Decode again" : "Shield & decode"}</button>
    </div>
    ${state.error ? `<div class="err" role="alert">${esc(state.error)}</div>` : ""}`;
}

// ---------- flight panel ----------
function stepClass(s: FlightStep) {
  const e = s.status === "done" ? (s.engine === "cloud" ? " cloud" : s.engine === "local-rules" ? " local" : "") : "";
  return `${s.status}${e}`;
}
const badge = (s: FlightStep) =>
  s.engine === "cloud" ? `<span class="badge cloud">CLOUD</span>`
  : s.engine === "on-device" ? `<span class="badge device">ON-DEVICE</span>`
  : `<span class="badge local">LOCAL</span>`;

function payloadHtml(s: string) {
  return esc(s).replace(/\[([A-Z]+)_(\d+)\]/g, (_m, t, n) => `<span class="tok">${t} ${n}</span>`);
}

function renderFlight() {
  const d = state.decode;
  const all = [...(d?.steps ?? []), ...state.chatLog];
  const cloudChars = all.reduce((n, s) => n + (s.actualSource === "in_cloud" ? s.charsOut ?? 0 : 0), 0);
  const usedCloud = all.some((s) => s.actualSource === "in_cloud");
  const ran = all.some((s) => s.status === "done");
  const stat = !ran
    ? `<div class="stat"><div class="big">Nothing has left your device.</div><p>Decode a document to see exactly what is shared, and with which model.</p></div>`
    : usedCloud
      ? `<div class="stat sent"><div class="big">${cloudChars.toLocaleString()} chars went to the cloud.</div><p>All of it redacted. <strong>0 names, addresses or IDs</strong> were in the payload, verified by the leak guard before sending.</p></div>`
      : `<div class="stat safe"><div class="big">0 bytes left this device.</div><p>Detection, reasoning and restoring your details all ran locally in your browser.</p></div>`;
  const route = d?.route
    ? `<div class="route"><div class="lbl">Routing decision</div><div class="mode">${d.route.mode}</div><p>${esc(d.route.reason)}</p></div>` : "";
  const steps = all
    .map((s) => `<li class="${stepClass(s)}"><span class="node"></span><div><div class="t-label">${esc(s.label)}${s.status === "pending" ? "" : badge(s)}</div>
      <div class="t-note">${esc(
        s.note ?? "",
      )}${s.requestedMode && s.actualSource && s.status === "done" ? ` <span class="t-ms">· asked ${s.requestedMode}, ran ${s.actualSource === "in_cloud" ? "IN_CLOUD" : s.actualSource === "on_device" ? "ON_DEVICE" : "LOCAL"}</span>` : ""}${s.model && s.status === "done" ? ` <span class="t-ms">· ${esc(s.model)}</span>` : ""}</div></div>
      <span class="t-ms${s.status === "running" ? " live" : ""}" ${s.status === "running" && s.startedAt ? `data-start="${s.startedAt}"` : ""}>${s.status === "running" ? "" : fmtMs(s.ms)}</span></li>`)
    .join("");
  const payload = d?.payload
    ? `<details class="payload" open><summary>Exactly what the model saw</summary><pre>${payloadHtml(d.payload)}</pre></details>` : "";
  const receipt = d?.analysis
    ? `<div class="receipt" aria-label="Privacy receipt"><span><b>${state.entities?.filter((e) => e.redact).length ?? 0}</b> details hidden</span><span>route <b>${d.route?.mode.replace(/_/g, " ").toLowerCase()}</b></span><span>ran <b>${d.usedSource === "in_cloud" ? "in cloud" : "on device"}</b></span></div>`
    : "";
  $("flight-panel").innerHTML = `${stat}${receipt}${route}${steps ? `<ol class="timeline">${steps}</ol>` : ""}${payload}`;
}

// ---------- result panel ----------
/** Escape + highlight real values that were restored locally. */
function rich(text: string) {
  const ents = (state.entities ?? []).filter((e) => e.redact);
  return segment(text, ents)
    .map((s) => (s.entity ? `<span class="real" title="Restored on your device from ${esc(s.entity.token)}">${esc(s.text)}</span>` : esc(s.text)))
    .join("");
}

function renderResult() {
  const a = state.decode?.analysis;
  if (!a) {
    if (state.busy) {
      const running = state.decode?.steps.find((s) => s.status === "running");
      $("result-panel").innerHTML = `<div class="working">${esc(running ? running.label + "…" : "Starting…")}</div><div class="skel" aria-hidden="true"><i class="s"></i><i class="h"></i><i></i><i></i><i class="s"></i><i></i></div>`;
      return;
    }
    $("result-panel").innerHTML = `<div class="empty"><div class="glyph">◐</div><p>Your plain-English summary, red flags and questions to ask will appear here, with your real details put back.</p></div>`;
    return;
  }
  const facts = a.keyFacts?.map((f) => `<div class="fact"><div class="k">${rich(f.label)}</div><div class="v">${rich(f.value)}</div></div>`).join("") ?? "";
  const dl = a.deadlines?.map((x) => `<li><strong>${rich(x.when)}</strong> · ${rich(x.what)}</li>`).join("") ?? "";
  const flags = a.redFlags?.map((f) => `<div class="flag ${f.severity}"><b><span class="sev">${f.severity}</span>${rich(f.issue)}</b><span>${rich(f.why)}</span></div>`).join("") ?? "";
  const qs = a.questionsToAsk?.map((q) => `<li>${rich(q)}</li>`).join("") ?? "";
  const chat = state.chat
    .map((t) => `<div class="msg ${t.role}">${rich(rehydrate(t.text, state.entities ?? []))}${
      t.source ? `<br><span class="badge ${t.source === "in_cloud" ? "cloud" : "device"}">${t.source === "in_cloud" ? "CLOUD" : "ON-DEVICE"}</span>` : ""
    }</div>`)
    .join("");
  $("result-panel").innerHTML = `
    <div><div class="doctype">${esc(a.docType)}</div><div class="headline">${rich(a.headline)}</div><div class="plain">${rich(a.plainEnglish)}</div></div>
    ${facts ? `<div class="facts">${facts}</div>` : ""}
    ${dl ? `<div class="sect"><h3>Deadlines</h3><ul class="q">${dl}</ul></div>` : ""}
    ${flags ? `<div class="sect"><h3>Worth a closer look</h3>${flags}</div>` : ""}
    ${qs ? `<div class="sect"><h3>Questions to ask</h3><ul class="q">${qs}</ul></div>` : ""}
    <div class="chat">${chat}
      <form class="ask" id="ask"><input id="q" placeholder="Ask a follow-up, e.g. “Can I dispute this?”" aria-label="Follow-up question" autocomplete="off" ${state.busy ? "disabled" : ""} /><button class="btn" ${state.busy ? "disabled" : ""}>Ask</button></form>
    </div>`;
}

function renderAll() { renderStatus(); renderBanner(); renderDoc(); renderFlight(); renderResult(); }

// ---------- actions ----------
async function runDecode() {
  if (!state.engine || state.busy) return;
  const el = document.getElementById("doc") as HTMLTextAreaElement | null;
  if (el) state.text = el.value;
  if (!state.text.trim()) return;
  state.busy = true; state.error = ""; state.chat = []; state.chatLog = [];
  renderAll();
  try {
    state.decode = await decode(state.engine, state.text, state.entities, { choice: state.choice, online: state.online }, (s) => {
      state.decode = s;
      const first = state.entities === null && s.entities.length > 0;
      if (s.entities.length) state.entities = s.entities;
      if (first) renderDoc();
      renderFlight();
      if (!state.decode?.analysis) renderResult();
    });
    state.entities = state.decode.entities;
  } catch (e) {
    state.error = e instanceof Error ? e.message : String(e);
    // keep entities if the shield succeeded so the user can retry quickly
    if (state.decode?.entities?.length) state.entities = state.decode.entities;
  } finally {
    state.busy = false;
    renderAll();
  }
}

async function ask(question: string) {
  if (!state.engine || !state.decode || state.busy || !question.trim()) return;
  state.busy = true; state.error = "";
  // Shield the question with the same entity table (+ any new identifiers it contains).
  const ents = buildEntities([...detectRules(question), ...detectHeuristic(question)], state.entities ?? []);
  state.entities = ents;
  const rq = redact(question, ents);
  const leaks = findLeaks(rq, ents);
  const log: FlightStep = { id: `q${state.chatLog.length}`, label: "Follow-up question", engine: "on-device", status: "running" };
  state.chatLog.push(log);
  state.chat.push({ role: "user", text: rq });
  const reply: ChatTurn = { role: "assistant", text: "" };
  state.chat.push(reply);
  renderAll();
  try {
    if (leaks.length) throw new Error("Leak guard blocked the follow-up question.");
    const history = state.chat.slice(0, -2).slice(-6).map((t) => `${t.role === "user" ? "User" : "Veil"}: ${t.text}`).join("\n");
    // Recompute from the current selections: the user may have changed what is shielded since decoding.
    const redactedDoc = redact(state.text, ents);
    const docLeaks = findLeaks(redactedDoc, ents);
    if (docLeaks.length) throw new Error("Leak guard blocked the request.");
    const route = chooseRoute({
      choice: state.choice, chars: redactedDoc.length + history.length + rq.length, online: state.online,
      threshold: state.engine.config.onDeviceMaxChars, device: state.device,
    });
    log.requestedMode = route.mode;
    const t0 = performance.now();
    const res = await state.engine.answer({ redactedDoc, history, question: rq }, route, (soFar) => {
      reply.text = soFar;
      renderResult();
    });
    reply.text = res.text; reply.source = res.source;
    Object.assign(log, {
      status: "done", ms: performance.now() - t0, actualSource: res.source, model: res.model,
      engine: res.source === "in_cloud" ? "cloud" : "on-device",
      charsOut: res.source === "in_cloud" ? redactedDoc.length + history.length + rq.length : 0,
      note: res.source === "in_cloud" ? "Redacted document + question sent" : "Nothing left this device",
    } satisfies Partial<FlightStep>);
  } catch (e) {
    log.status = "error"; log.note = e instanceof Error ? e.message : String(e);
    state.chat.splice(-2, 2);
    state.error = log.note;
  } finally {
    state.busy = false;
    renderAll();
    (document.getElementById("q") as HTMLInputElement | null)?.focus();
  }
}

function toggleEntity(token: string) {
  const e = state.entities?.find((x) => x.token === token);
  if (!e) return;
  e.redact = !e.redact;
  renderDoc(); renderResult();
}

// ---------- events ----------
document.addEventListener("click", (ev) => {
  const t = ev.target as HTMLElement;
  const sample = t.closest<HTMLElement>("[data-sample]");
  if (sample) {
    const s = SAMPLES.find((x) => x.id === sample.dataset.sample)!;
    Object.assign(state, { text: s.text, sampleId: s.id, entities: null, decode: null, chat: [], chatLog: [], error: "" });
    renderAll(); return;
  }
  const choice = t.closest<HTMLElement>("[data-choice]");
  if (choice) { state.choice = choice.dataset.choice as RouteChoice; renderDoc(); return; }
  const ent = t.closest<HTMLElement>("mark.ent");
  if (ent) { toggleEntity(ent.dataset.token!); return; }
  if (t.closest("#decode")) { void runDecode(); return; }
  if (t.closest("#edit")) { Object.assign(state, { entities: null, decode: null, chat: [], chatLog: [] }); renderAll(); return; }
});
document.addEventListener("keydown", (ev) => {
  const t = ev.target as HTMLElement;
  if ((ev.key === "Enter" || ev.key === " ") && t.matches("mark.ent")) { ev.preventDefault(); toggleEntity(t.dataset.token!); }
});
document.addEventListener("submit", (ev) => {
  if ((ev.target as HTMLElement).id === "ask") {
    ev.preventDefault();
    const input = document.getElementById("q") as HTMLInputElement;
    const q = input.value; input.value = "";
    void ask(q);
  }
});
document.addEventListener("input", (ev) => {
  const t = ev.target as HTMLElement;
  if (t.id === "doc") {
    state.text = (t as HTMLTextAreaElement).value; state.sampleId = "";
    const btn = document.getElementById("decode") as HTMLButtonElement | null;
    if (btn) btn.disabled = !state.engine || !state.text.trim() || state.busy;
  }
});
document.addEventListener("change", async (ev) => {
  const t = ev.target as HTMLInputElement;
  if (t.id === "file" && t.files?.[0]) { state.text = await t.files[0].text(); state.sampleId = ""; renderDoc(); }
});

// User-driven shielding: select any text in the review view and shield it.
const selbtn = $("selbtn");
document.addEventListener("mouseup", () => {
  const sel = window.getSelection();
  const view = document.getElementById("shieldview");
  const s = sel?.toString().trim() ?? "";
  if (!view || !sel || sel.rangeCount === 0 || s.length < 2 || s.length > 80 || !view.contains(sel.anchorNode)) { selbtn.hidden = true; return; }
  const r = sel.getRangeAt(0).getBoundingClientRect();
  selbtn.style.left = `${Math.max(8, r.left)}px`; selbtn.style.top = `${r.bottom + 8}px`; selbtn.hidden = false;
  selbtn.dataset.text = s;
});
selbtn.addEventListener("mousedown", (e) => e.preventDefault());
selbtn.addEventListener("click", () => {
  const text = selbtn.dataset.text; selbtn.hidden = true;
  if (!text || !state.entities) return;
  state.entities = buildEntities([{ text, type: "ID", source: "user" }], state.entities);
  const e = state.entities.find((x) => x.text.toLowerCase() === text.toLowerCase());
  if (e) e.redact = true;
  window.getSelection()?.removeAllRanges();
  renderDoc();
});

// Tick live timers on running steps without re-rendering the whole panel.
setInterval(() => {
  document.querySelectorAll<HTMLElement>(".t-ms.live").forEach((el) => {
    el.textContent = fmtMs(performance.now() - Number(el.dataset.start));
  });
}, 250);

void boot();
