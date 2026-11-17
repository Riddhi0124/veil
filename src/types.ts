export type EntityType =
  | "PERSON" | "ORG" | "LOCATION" | "ID" | "EMAIL" | "PHONE" | "SSN" | "CARD" | "DOB" | "URL";

export type DetectSource = "rules" | "on-device" | "heuristic" | "user";

export interface Entity {
  text: string;
  type: EntityType;
  token: string;
  /** When true the original text never leaves the device. */
  redact: boolean;
  source: DetectSource;
}

export type Engine = "local-rules" | "on-device" | "cloud";

export type RouteChoice = "auto" | "local" | "cloud";

export interface FlightStep {
  id: string;
  label: string;
  engine: Engine;
  /** Mode requested from Firebase AI Logic, e.g. ONLY_ON_DEVICE. */
  requestedMode?: string;
  /** What actually ran, as reported by response.inferenceSource. */
  actualSource?: "on_device" | "in_cloud" | "local_rules";
  model?: string;
  ms?: number;
  startedAt?: number;
  charsOut?: number;
  note?: string;
  status: "pending" | "running" | "done" | "skipped" | "error";
}

export interface Analysis {
  docType: string;
  headline: string;
  plainEnglish: string;
  keyFacts: { label: string; value: string }[];
  deadlines: { what: string; when: string }[];
  redFlags: { issue: string; why: string; severity: "low" | "medium" | "high" }[];
  questionsToAsk: string[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  source?: "on_device" | "in_cloud";
}
