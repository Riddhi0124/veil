import type { Engine, Route, DeviceStatus, Source } from "./engine";
import {
  buildEntities, detectHeuristic, detectRules, findLeaks, redact, rehydrateDeep,
} from "./shield";
import type { Analysis, Entity, FlightStep, RouteChoice } from "./types";

export interface RouteInput {
  choice: RouteChoice;
  chars: number;
  online: boolean;
  threshold: number;
  device: DeviceStatus;
}

/** The hybrid-routing policy. Pure function: easy to read, easy to test. */
export function chooseRoute(i: RouteInput): Route {
  if (!i.online)
    return { mode: "ONLY_ON_DEVICE", reason: "You're offline, so everything stays on this device." };
  if (i.choice === "local")
    return { mode: "ONLY_ON_DEVICE", reason: "Local-only mode: the cloud is never contacted." };
  if (i.choice === "cloud")
    return { mode: "ONLY_IN_CLOUD", reason: "Cloud mode: redacted text goes to the larger cloud model." };
  if (i.chars > i.threshold)
    return {
      mode: "ONLY_IN_CLOUD",
      reason: `${i.chars.toLocaleString()} chars exceeds the ${i.threshold.toLocaleString()}-char on-device budget, so the redacted text is escalated to the cloud model.`,
    };
  return {
    mode: "PREFER_ON_DEVICE",
    reason:
      i.device === "available"
        ? "Short enough for Gemini Nano. Runs on-device; cloud only if the local model fails."
        : "Prefer on-device, but this browser has no local model ready, so Firebase falls back to the cloud automatically.",
  };
}

export interface DecodeState {
  entities: Entity[];
  redacted: string;
  route?: Route;
  steps: FlightStep[];
  analysis?: Analysis;
  /** Exactly what was handed to the reasoning model (redacted). */
  payload?: string;
  usedSource?: Source;
}

const STEP_TEMPLATE: FlightStep[] = [
  { id: "scan", label: "Scan for private details", engine: "on-device", status: "pending" },
  { id: "redact", label: "Redact + leak check", engine: "local-rules", status: "pending" },
  { id: "route", label: "Choose where to think", engine: "local-rules", status: "pending" },
  { id: "reason", label: "Understand the document", engine: "on-device", status: "pending" },
  { id: "rehydrate", label: "Restore your details", engine: "local-rules", status: "pending" },
];

export async function decode(
  engine: Engine,
  text: string,
  previous: Entity[] | null,
  opts: { choice: RouteChoice; online: boolean },
  onUpdate: (s: DecodeState) => void,
): Promise<DecodeState> {
  const steps: FlightStep[] = STEP_TEMPLATE.map((s) => ({ ...s }));
  const state: DecodeState = { entities: previous ?? [], redacted: "", steps };
  const emit = () => onUpdate({ ...state, steps: steps.map((s) => ({ ...s })) });
  const step = (id: string) => steps.find((s) => s.id === id)!;
  const run = async <T>(id: string, patch: Partial<FlightStep>, fn: () => Promise<T>): Promise<T> => {
    const s = step(id);
    Object.assign(s, patch, { status: "running", startedAt: performance.now() });
    emit();
    const t0 = performance.now();
    try {
      const out = await fn();
      s.ms = performance.now() - t0;
      s.status = "done";
      emit();
      return out;
    } catch (err) {
      s.ms = performance.now() - t0;
      s.status = "error";
      s.note = err instanceof Error ? err.message : String(err);
      emit();
      throw err;
    }
  };

  // 1. SCAN — rules always run; the on-device model adds names and context. Raw text never leaves.
  if (!previous) {
    const raws = [...detectRules(text), ...detectHeuristic(text)];
    state.entities = buildEntities(raws);
    await run("scan", { requestedMode: "ONLY_ON_DEVICE" }, async () => {
      emit(); // show the instant rule-based shield while the on-device model reads deeper
      try {
        const found = await engine.detectEntities(text);
        state.entities = buildEntities(found.map((f) => ({ ...f, source: "on-device" as const })), state.entities);
        step("scan").actualSource = "on_device";
        step("scan").model = "Gemini Nano (Chrome)";
        step("scan").note = `On-device model + pattern rules found ${state.entities.length} private details`;
      } catch {
        step("scan").engine = "local-rules";
        step("scan").actualSource = "local_rules";
        step("scan").note = "No on-device model here, so the rule-based shield ran instead (still 100% local).";
      }
    });
  } else {
    step("scan").status = "skipped";
    step("scan").note = "Reused your reviewed selections.";
  }

  // 2. REDACT + LEAK CHECK
  await run("redact", {}, async () => {
    state.redacted = redact(text, state.entities);
    const leaks = findLeaks(state.redacted, state.entities);
    if (leaks.length) throw new Error(`Leak guard blocked the request (${leaks.length} identifier(s) survived redaction).`);
    const n = state.entities.filter((e) => e.redact).length;
    step("redact").note = `${n} identifiers masked · leak guard passed`;
  });

  // 3. ROUTE
  const device = await engine.deviceStatus();
  const route = await run("route", {}, async () => {
    const r = chooseRoute({
      choice: opts.choice, chars: state.redacted.length, online: opts.online,
      threshold: engine.config.onDeviceMaxChars, device,
    });
    step("route").note = r.reason;
    step("route").requestedMode = r.mode;
    return r;
  });
  state.route = route;
  state.payload = state.redacted;

  // 4. REASON — the only step that may reach the network, and only ever with redacted text.
  const res = await run("reason", { requestedMode: route.mode, engine: route.mode === "ONLY_IN_CLOUD" ? "cloud" : "on-device" }, () =>
    engine.analyze(state.redacted, route),
  );
  const rs = step("reason");
  rs.actualSource = res.source;
  rs.engine = res.source === "in_cloud" ? "cloud" : "on-device";
  rs.model = res.model;
  rs.charsOut = res.source === "in_cloud" ? state.redacted.length : 0;
  rs.note =
    res.source === "in_cloud"
      ? `${state.redacted.length.toLocaleString()} chars of redacted text sent`
      : "Nothing left this device";
  state.usedSource = res.source;
  emit();

  // 5. REHYDRATE — placeholders become the real values again, locally.
  await run("rehydrate", {}, async () => {
    state.analysis = rehydrateDeep(res.analysis, state.entities);
    step("rehydrate").note = "Done in your browser";
  });
  emit();
  return { ...state, steps: steps.map((s) => ({ ...s })) };
}
