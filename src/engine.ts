// Every Firebase AI Logic call in the app lives here, behind one small interface,
// so the pipeline stays testable and the hybrid-inference surface area is easy to audit.
import {
  getGenerativeModel, InferenceMode, InferenceSource, Schema,
  type GenerativeModel,
} from "firebase/ai";
import type { FirebaseServices, RuntimeConfig } from "./firebase";
import type { Analysis, EntityType } from "./types";

export type ModeName = "ONLY_ON_DEVICE" | "PREFER_ON_DEVICE" | "ONLY_IN_CLOUD";
export type Source = "on_device" | "in_cloud";
export type DeviceStatus = "unsupported" | "unavailable" | "downloadable" | "downloading" | "available";

export interface Route { mode: ModeName; reason: string }

export interface CallMeta { source: Source; ms: number; model: string }

export interface Engine {
  readonly kind: "firebase" | "mock";
  readonly config: RuntimeConfig;
  deviceStatus(): Promise<DeviceStatus>;
  /** Download/initialise the on-device model. Must be triggered from a user gesture. */
  warmUp(onProgress: (p: number) => void): Promise<void>;
  /** ON-DEVICE ONLY. Receives raw text; throws if no local model is available. */
  detectEntities(text: string): Promise<{ text: string; type: EntityType }[]>;
  /** Receives REDACTED text only. */
  analyze(redacted: string, route: Route): Promise<{ analysis: Analysis } & CallMeta>;
  answer(
    prompt: { redactedDoc: string; history: string; question: string },
    route: Route,
    onText: (soFar: string) => void,
  ): Promise<{ text: string } & CallMeta>;
}

const MODE: Record<ModeName, InferenceMode> = {
  ONLY_ON_DEVICE: InferenceMode.ONLY_ON_DEVICE,
  PREFER_ON_DEVICE: InferenceMode.PREFER_ON_DEVICE,
  ONLY_IN_CLOUD: InferenceMode.ONLY_IN_CLOUD,
};

const text = Schema.string;

const nerSchema = Schema.object({
  properties: {
    entities: Schema.array({
      items: Schema.object({
        properties: {
          text: text(),
          type: Schema.enumString({ enum: ["PERSON", "LOCATION"] }),
        },
      }),
    }),
  },
});

const analysisSchema = Schema.object({
  properties: {
    docType: text(),
    headline: text(),
    plainEnglish: text(),
    keyFacts: Schema.array({ items: Schema.object({ properties: { label: text(), value: text() } }) }),
    deadlines: Schema.array({ items: Schema.object({ properties: { what: text(), when: text() } }) }),
    redFlags: Schema.array({
      items: Schema.object({
        properties: {
          issue: text(), why: text(),
          severity: Schema.enumString({ enum: ["low", "medium", "high"] }),
        },
      }),
    }),
    questionsToAsk: Schema.array({ items: text() }),
  },
});

const EN = [{ type: "text" as const, languages: ["en"] }];

export const NER_PROMPT = (chunk: string) => `List every person's full name and every street address or city+ZIP in this document. Copy each exactly as written. Skip organizations, dates, dollar amounts, phone numbers and ID numbers.

${chunk}`;

export const ANALYZE_PROMPT = (redacted: string) => `You are Veil, a calm, plain-spoken guide who helps ordinary people understand confusing documents (medical bills, leases, insurance letters, lab results).
The document below has had private details replaced with placeholders such as [PERSON_1] or [ID_2]. Keep placeholders exactly as written whenever you mention those people or things. Never guess what a placeholder stands for.
Write at an 8th-grade reading level. Be specific: quote amounts, dates and clauses from the document. Flag anything unusual, one-sided or worth disputing, and say why. Dates and dollar amounts are not private: keep them exactly as written, and never repeat the same fact in two fields. If something is not in the document, do not invent it. This is education, not legal or medical advice.
Return JSON that matches the schema. Keep plainEnglish under 120 words, give at most 5 keyFacts, 4 deadlines, 4 redFlags and 4 questionsToAsk.

Document:
"""
${redacted}
"""`;

export const CHAT_PROMPT = (p: { redactedDoc: string; history: string; question: string }) => `You are Veil, a calm, plain-spoken guide. Answer the user's question using ONLY the document below. Placeholders like [PERSON_1] stand for private details that were removed; keep them exactly as written and never guess what they are. Be specific, under 120 words, no legal or medical advice.

Document:
"""
${p.redactedDoc}
"""
${p.history ? `\nConversation so far:\n${p.history}\n` : ""}
Question: ${p.question}`;

export function chunkText(s: string, size = 2200): string[] {
  const paras = s.split(/\n{2,}/);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length > size) { chunks.push(cur); cur = ""; }
    cur += (cur ? "\n\n" : "") + p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export function parseJson<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned) as T;
}

export async function deviceAvailability(): Promise<DeviceStatus> {
  const LM = (self as unknown as { LanguageModel?: { availability(o: object): Promise<string> } }).LanguageModel;
  if (!LM) return "unsupported";
  try {
    const a = await LM.availability({ expectedInputs: EN, expectedOutputs: [{ type: "text", languages: ["en"] }] });
    return a as DeviceStatus;
  } catch {
    return "unavailable";
  }
}

export function createFirebaseEngine(fb: FirebaseServices): Engine {
  const cache = new Map<string, GenerativeModel>();
  const ready = new Set<GenerativeModel>();

  function model(kind: "ner" | "analysis" | "chat", mode: ModeName): GenerativeModel {
    const key = `${kind}:${mode}:${fb.config.cloudModel}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const schema = kind === "ner" ? nerSchema : kind === "analysis" ? analysisSchema : undefined;
    const m = getGenerativeModel(fb.ai, {
      mode: MODE[mode],
      inCloudParams: {
        model: fb.config.cloudModel,
        generationConfig: schema
          ? { responseMimeType: "application/json", responseSchema: schema, temperature: 0.2 }
          : { temperature: 0.3, maxOutputTokens: 600 },
      },
      onDeviceParams: {
        createOptions: { expectedInputs: EN, expectedOutputs: [{ type: "text", languages: ["en"] }] },
        promptOptions: schema ? { responseConstraint: schema } : {},
      },
    });
    cache.set(key, m);
    return m;
  }

  /** initializeDeviceModel must run before the first query; for PREFER_* modes failure just means "use cloud". */
  async function ensureReady(m: GenerativeModel, strict: boolean, onProgress?: (p: number) => void) {
    if (ready.has(m)) return;
    try {
      await m.initializeDeviceModel(onProgress);
      ready.add(m);
    } catch (err) {
      if (strict) throw err;
    }
  }

  return {
    kind: "firebase",
    config: fb.config,
    deviceStatus: deviceAvailability,

    async warmUp(onProgress) {
      await ensureReady(model("ner", "ONLY_ON_DEVICE"), true, onProgress);
      await ensureReady(model("analysis", "PREFER_ON_DEVICE"), false);
      await ensureReady(model("chat", "PREFER_ON_DEVICE"), false);
    },

    async detectEntities(raw) {
      const m = model("ner", "ONLY_ON_DEVICE");
      await ensureReady(m, true);
      const found: { text: string; type: EntityType }[] = [];
      for (const chunk of chunkText(raw)) {
        const res = await m.generateContent(NER_PROMPT(chunk));
        // Hard guarantee: this step must never have touched the network.
        if (res.response.inferenceSource !== InferenceSource.ON_DEVICE)
          throw new Error("Shield refused: entity detection did not run on-device.");
        const parsed = parseJson<{ entities?: { text: string; type: string }[] }>(res.response.text());
        for (const e of parsed.entities ?? []) {
          const t = (e.type === "LOCATION" ? "LOCATION" : "PERSON") as EntityType;
          const v = (e.text ?? "").trim();
          // Guard against hallucinated spans (must literally appear) and obvious non-PII (dates, amounts).
          const notPii = /^\$?[\d,.\s-]+$/.test(v) || /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d/i.test(v) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(v);
          if (v.length > 1 && v.length < 80 && !notPii && raw.toLowerCase().includes(v.toLowerCase()))
            found.push({ text: v, type: t });
        }
      }
      return found;
    },

    async analyze(redacted, route) {
      const m = model("analysis", route.mode);
      await ensureReady(m, route.mode === "ONLY_ON_DEVICE");
      const t0 = performance.now();
      const res = await m.generateContent(ANALYZE_PROMPT(redacted));
      const source = res.response.inferenceSource === InferenceSource.ON_DEVICE ? "on_device" : "in_cloud";
      return {
        analysis: parseJson<Analysis>(res.response.text()),
        source,
        ms: performance.now() - t0,
        model: source === "in_cloud" ? fb.config.cloudModel : "Gemini Nano (Chrome)",
      };
    },

    async answer(prompt, route, onText) {
      const m = model("chat", route.mode);
      await ensureReady(m, route.mode === "ONLY_ON_DEVICE");
      const t0 = performance.now();
      const stream = await m.generateContentStream(CHAT_PROMPT(prompt));
      let acc = "";
      for await (const chunk of stream.stream) {
        acc += chunk.text();
        onText(acc);
      }
      const final = await stream.response;
      const source = final.inferenceSource === InferenceSource.ON_DEVICE ? "on_device" : "in_cloud";
      return {
        text: acc,
        source,
        ms: performance.now() - t0,
        model: source === "in_cloud" ? fb.config.cloudModel : "Gemini Nano (Chrome)",
      };
    },
  };
}
