// The Shield: everything in this file runs locally and deterministically.
// It turns a private document into a safe-to-share one, and back again.
import type { Entity, EntityType, DetectSource } from "./types";

interface Raw { text: string; type: EntityType; source: DetectSource }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function luhn(digits: string): boolean {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

const NAME_STOP = new Set([
  "account", "number", "date", "total", "amount", "balance", "insurance", "health", "plan", "payment",
  "service", "services", "billing", "statement", "department", "medical", "center", "hospital", "clinic",
  "lease", "agreement", "tenant", "landlord", "rent", "property", "management", "group", "member", "patient",
  "name", "street", "the", "and", "of", "dear", "sincerely", "regards", "claim", "policy", "provider",
  "financial", "emergency", "department", "physician", "insurance", "benefit", "determination", "residential",
]);

function isLikelyName(s: string): boolean {
  const words = s.trim().split(/\s+/);
  if (words.length < 1 || words.length > 4) return false;
  return words.every((w) => /^[A-Z][a-zA-Z'’.-]*$/.test(w) && !NAME_STOP.has(w.toLowerCase().replace(/\.$/, "")));
}

/** High-precision patterns for structured identifiers. Always runs, with or without a model. */
export function detectRules(text: string): Raw[] {
  const out: Raw[] = [];
  const push = (m: string | undefined, type: EntityType) => {
    if (m && m.trim().length > 1) out.push({ text: m.trim(), type, source: "rules" });
  };
  for (const m of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) push(m[0], "EMAIL");
  for (const m of text.matchAll(/\bhttps?:\/\/[^\s)]+/g)) push(m[0], "URL");
  for (const m of text.matchAll(/\b\d{3}-\d{2}-\d{4}\b/g)) push(m[0], "SSN");
  for (const m of text.matchAll(/\b(?:\d[ -]?){13,16}\b/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 13 && luhn(digits)) push(m[0], "CARD");
  }
  for (const m of text.matchAll(/(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g)) push(m[0], "PHONE");
  for (const m of text.matchAll(
    /\b(?:DOB|Date of Birth|Birth ?date)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[A-Z][a-z]+\.? \d{1,2}, \d{4})/gi,
  )) push(m[1], "DOB");
  for (const m of text.matchAll(
    /\b(?:Account|Acct|Member|Policy|Claim|Group|Patient|MRN|Case|Invoice|Reference|Ref|Subscriber|Licen[sc]e|ID)\b[ \t]*(?:No\.?|Number|#|ID)?[ \t]*[:#]?[ \t]*([A-Z0-9][A-Z0-9-]{4,})/gi,
  )) if (/\d/.test(m[1])) push(m[1], "ID");
  for (const m of text.matchAll(
    /\b\d{1,6}\s+(?:[A-Z][a-z]+\.?\s){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl|Terrace|Ter|Parkway|Pkwy)\b\.?(?:,?\s*(?:Apt|Unit|Suite|Ste|#)\s*[\w-]+)?/g,
  )) push(m[0], "LOCATION");
  for (const m of text.matchAll(/\b[A-Z][a-z]+(?: [A-Z][a-z]+)?,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g)) push(m[0], "LOCATION");
  return out;
}

/** Fallback when no on-device model exists: label- and title-anchored name finder. */
export function detectHeuristic(text: string): Raw[] {
  const out: Raw[] = [];
  const add = (s: string | undefined) => {
    if (s && isLikelyName(s)) out.push({ text: s.trim(), type: "PERSON", source: "heuristic" });
  };
  for (const m of text.matchAll(/\b(?:Dr|Mr|Mrs|Ms|Mx)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g)) add(m[1]);
  for (const m of text.matchAll(
    /\b(?:Patient|Tenant|Landlord|Lessee|Lessor|Insured|Subscriber|Member|Guarantor|Resident|Employee|Borrower|Dear|Name|Attn|Provider|Physician)\b(?:\s+Name)?\s*[:\-,]?[ \t]+((?:[A-Z][a-z'’-]+)(?:[ \t]+[A-Z](?![A-Za-z'’-])\.?)?(?:[ \t]+[A-Z][a-z'’-]+){0,2})/g,
  )) add(m[1]);
  for (const m of text.matchAll(/(?:Sincerely|Regards|Thank you),?\s*\n+\s*([A-Z][a-z]+(?: [A-Z][a-z]+){1,2})/g)) add(m[1]);
  // Contract-style: parties defined as ("Tenant"), "agent X", "contact: X", and signature lines.
  const N = "[A-Z][a-z'’]+(?:-[A-Z][a-z]+)?(?:[ \\t]+[A-Z](?![A-Za-z'’-])\\.?)?(?:[ \\t]+[A-Z][a-z'’]+(?:-[A-Z][a-z]+)?){1,2}";
  const party = new RegExp(`(${N})(?:[ \\t]+and[ \\t]+(${N}))?[ \\t]*\\(["“](?:Landlord|Tenant|Lessee|Lessor|Buyer|Seller|Borrower|Lender|Employee|Employer|Client|Patient)`, "g");
  for (const m of text.matchAll(party)) { add(m[1]); add(m[2]); }
  for (const m of text.matchAll(new RegExp(`\\b(?:agent|Signed:?|contact:?|by)[ \\t]+(${N})`, "g"))) add(m[1]);
  for (const m of text.matchAll(new RegExp(`(${N})[ \\t]*(?:,[ \\t]*for[ \\t]+\\w+[ \\t]*)?_{3,}`, "g"))) add(m[1]);
  return out;
}

const DEFAULT_REDACT: Record<EntityType, boolean> = {
  PERSON: true, LOCATION: true, ID: true, EMAIL: true, PHONE: true, SSN: true, CARD: true, DOB: true,
  URL: true, ORG: false,
};

/** Merge raw detections into a deduplicated entity table with stable placeholder tokens. */
export function buildEntities(raws: Raw[], previous: Entity[] = []): Entity[] {
  const byKey = new Map<string, Entity>();
  const counters: Partial<Record<EntityType, number>> = {};
  for (const p of previous) {
    byKey.set(p.text.toLowerCase(), p);
    const n = Number(p.token.match(/_(\d+)\]/)?.[1] ?? 0);
    counters[p.type] = Math.max(counters[p.type] ?? 0, n);
  }
  for (const r of raws) {
    const key = r.text.toLowerCase();
    if (byKey.has(key)) continue;
    // A name contained in a longer already-known entity is redundant.
    counters[r.type] = (counters[r.type] ?? 0) + 1;
    byKey.set(key, {
      text: r.text, type: r.type, source: r.source,
      token: `[${r.type}_${counters[r.type]}]`,
      redact: DEFAULT_REDACT[r.type],
    });
  }
  return [...byKey.values()].sort((a, b) => b.text.length - a.text.length);
}

function boundaryRegex(s: string): RegExp {
  const pre = /^\w/.test(s) ? "\\b" : "";
  const post = /\w$/.test(s) ? "\\b" : "";
  return new RegExp(`${pre}${esc(s)}${post}`, "gi");
}

/** Replace every redacted entity with its token. Longest-first so nothing is half-masked. */
export function redact(text: string, entities: Entity[]): string {
  let out = text;
  for (const e of [...entities].sort((a, b) => b.text.length - a.text.length)) {
    if (e.redact) out = out.replace(boundaryRegex(e.text), e.token);
  }
  return out;
}

/** Put real values back. Tolerates models that drop the brackets or swap `_` for a space. */
export function rehydrate(text: string, entities: Entity[]): string {
  const byToken = new Map(entities.map((e) => [e.token.slice(1, -1), e]));
  return text.replace(/\[?\b([A-Z]+)[_ ](\d+)\b\]?/g, (whole, type: string, n: string) => {
    const e = byToken.get(`${type}_${n}`);
    return e && e.redact ? e.text : whole;
  });
}

/** The leak guard: returns any protected original that survived into an outbound payload. */
export function findLeaks(payload: string, entities: Entity[]): string[] {
  return entities.filter((e) => e.redact && boundaryRegex(e.text).test(payload)).map((e) => e.text);
}

export interface Segment { text: string; entity?: Entity }

/** Split the original document into plain and entity segments for highlighting. */
export function segment(text: string, entities: Entity[]): Segment[] {
  const hits: { start: number; end: number; entity: Entity }[] = [];
  for (const e of [...entities].sort((a, b) => b.text.length - a.text.length)) {
    for (const m of text.matchAll(boundaryRegex(e.text))) {
      const start = m.index ?? 0, end = start + m[0].length;
      if (!hits.some((h) => start < h.end && end > h.start)) hits.push({ start, end, entity: e });
    }
  }
  hits.sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let cur = 0;
  for (const h of hits) {
    if (h.start > cur) out.push({ text: text.slice(cur, h.start) });
    out.push({ text: text.slice(h.start, h.end), entity: h.entity });
    cur = h.end;
  }
  if (cur < text.length) out.push({ text: text.slice(cur) });
  return out;
}

/** Walk any JSON value and rehydrate every string inside it. */
export function rehydrateDeep<T>(value: T, entities: Entity[]): T {
  if (typeof value === "string") return rehydrate(value, entities) as T;
  if (Array.isArray(value)) return value.map((v) => rehydrateDeep(v, entities)) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rehydrateDeep(v, entities)])) as T;
  return value;
}
