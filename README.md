# Veil: decode the fine print, share none of it

> **#BuildHybridAI 2026 · Web (Chrome) · Firebase AI Logic hybrid inference**
>
> **Live demo: https://veil-hybrid-ce06b.web.app** · Best in desktop Chrome with Gemini Nano. In any other browser it still works: the shield falls back to local rules and reasoning falls back to the cloud model.

Medical bills, leases and insurance denials are confusing, and they are also some of the most private
documents a person owns. The usual advice is "paste it into an AI chatbot", which means uploading your
name, address, account numbers and diagnosis to a server.

**Veil uses hybrid inference as a privacy architecture, not just a fallback.**

```
 your document ──▶ ① SHIELD ──▶ ② ROUTE ──▶ ③ REASON ──▶ ④ RESTORE ──▶ plain-English answer
 (raw text)        on-device     policy       on-device     in your        with your real
                   only          function     OR cloud      browser        names put back
                   ▲ raw text    │            ▲ redacted text only
                   │ never       └─ Remote Config tunes the threshold
                   │ leaves
```

1. **Shield (on-device only).** Gemini Nano, through Firebase AI Logic in `ONLY_ON_DEVICE` mode, plus pattern
   rules, finds names, addresses, IDs, dates of birth and contact details. Raw text is only ever sent to this
   step, and the code asserts `response.inferenceSource === ON_DEVICE` or throws.
2. **Route.** A small pure function (`chooseRoute` in [`src/pipeline.ts`](src/pipeline.ts)) picks the inference mode:
   | Situation | Firebase AI Logic mode | Why |
   |---|---|---|
   | Offline | `ONLY_ON_DEVICE` | Works on a plane; nothing to leak |
   | "On-device only" toggle | `ONLY_ON_DEVICE` | User never wants the cloud |
   | Short document (≤ threshold) | `PREFER_ON_DEVICE` | Free, fast, private; the SDK falls back to cloud if the device has no model |
   | Long document (> threshold) | `ONLY_IN_CLOUD` | Beyond Nano's context budget, so escalate the *redacted* text to Gemini in the cloud |
3. **Reason.** The model sees only text like `[PERSON_1] owes $3,382.50 on [ID_1]`. A **leak guard** re-scans every
   outbound payload (including follow-up questions) and blocks the request if any protected string survived.
4. **Restore.** Placeholders in the structured answer are swapped back to your real values locally. Restored
   values are underlined so you can see exactly what came back from the device.

The UI makes the architecture visible: the middle panel is a **flight log** showing the routing decision, the mode
that was *requested* vs the source that actually *ran* (`inferenceSource`), timings, how many characters went to the
cloud, and the exact redacted text the model saw.

### Why hybrid matters here (and not just "on-device is cheaper")
- On-device alone can't read a 4-page lease; cloud alone is a privacy non-starter. Neither is enough, and the
  combination is the product.
- Gemini Nano isn't on every device. `PREFER_ON_DEVICE` plus the rule-based shield means Veil degrades gracefully
  instead of breaking.
- The on-device model is the **privacy layer** for the cloud model: a creative role for hybrid inference beyond
  "fall back when offline".

## Firebase products used
| Product | How |
|---|---|
| **Firebase AI Logic** (`firebase/ai`) | `getAI` + `getGenerativeModel` with `InferenceMode.ONLY_ON_DEVICE` / `PREFER_ON_DEVICE` / `ONLY_IN_CLOUD`; structured JSON output on both engines (`responseConstraint` + `responseSchema`); streaming follow-ups; `inferenceSource` surfaced in the UI. All calls live in [`src/engine.ts`](src/engine.ts). |
| **App Check** | reCAPTCHA Enterprise provider, with debug-token support for local dev and judging ([`src/firebase.ts`](src/firebase.ts)). |
| **Remote Config** | `ondevice_max_chars` (routing threshold) and `cloud_model` can be changed without a deploy ([`remoteconfig.template.json`](remoteconfig.template.json)). |
| **Hosting** | `firebase deploy` serves the Vite build ([`firebase.json`](firebase.json)). |

## Run it

```bash
npm install
cp .env.example .env.local     # fill in your Firebase web config (see below)
npm run dev                    # http://localhost:5173
```

**Browser:** desktop Chrome with Gemini Nano / the Prompt API enabled for the on-device path (follow Firebase's
[web hybrid guide](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started) to configure it). If `chrome://on-device-internals`
shows Gemini Nano as available (or "downloadable"), click **Download** in Veil's status bar. Without a local model,
Veil still works: the shield falls back to rules and reasoning falls back to the cloud model.

### Firebase setup (5 minutes)
1. Create a Firebase project and a **Web app**; paste its config into `.env.local`.
2. **Build → AI Logic → Get started**, choose the *Gemini Developer API*.
3. **Build → App Check → Apps**: register the web app (reCAPTCHA Enterprise) and **Manage debug tokens** to add one
   for local/judging use. Put it in `VITE_APPCHECK_DEBUG_TOKEN`, or leave it blank and copy the token the SDK prints
   to the console on first load. Enforce App Check for AI Logic.
4. (Optional) **Remote Config**: `firebase deploy --only remoteconfig` publishes the included template.
5. Deploy: `npm run build && firebase deploy --only hosting` (copy `.firebaserc.example` to `.firebaserc` first).

### Demo mode
`/?mock=1` swaps in canned answers and makes **no Firebase calls**. It exists for UI development and
screenshots, and the app labels it clearly. Real submissions run on the Firebase engine.

## Project layout
```
src/engine.ts    Every Firebase AI Logic call (models, prompts, schemas, inferenceSource checks)
src/pipeline.ts  Shield → Route → Reason → Restore orchestration + the routing policy
src/shield.ts    Local redaction: patterns, name heuristics, tokenisation, leak guard, rehydration
src/firebase.ts  App init, App Check, Remote Config
src/main.ts      UI
src/samples.ts   Fictional demo documents (hospital bill, lease, insurance denial)
```

## Limitations (being straight about them)
- Redaction is best-effort. The on-device model plus rules catch common identifiers, but review the highlighted
  text and click to adjust, or select any text to shield it. The leak guard only protects what is marked.
- Quotes in the document that embed a stranger's name in an unusual format may slip past the rule-based fallback.
- Veil explains documents; it is not legal or medical advice.

## License
Apache-2.0, see [LICENSE](LICENSE).

---

## Devpost submission copy

**Tagline:** Understand your bills and contracts with AI, without sharing your name, address, or account numbers.

**Inspiration.** Hospital bills, leases and insurance denials are confusing and full of private details. AI
assistants are the obvious tool, but pasting those documents into a cloud chatbot is exactly what privacy-conscious
people refuse to do. Hybrid inference lets the device do the private part and the cloud do the heavy part.

**What it does.** Veil reads a sensitive document and returns a plain-English summary, deadlines, red flags and
questions to ask. Your device first hides every identifier; only the anonymous text can ever reach a cloud model, and
your real details are restored locally. A live flight log shows what ran where and what left the device.

**How we built it with Firebase AI Logic.** Four hybrid inference patterns in one app: `ONLY_ON_DEVICE` for the
privacy shield (with a hard `inferenceSource` assertion), `PREFER_ON_DEVICE` for short documents, `ONLY_IN_CLOUD` to
escalate long documents, and automatic offline routing. Structured output works across both engines with shared
schemas. App Check guards the backend; Remote Config tunes the routing threshold and cloud model live.

**Challenges.** Making the privacy claim *verifiable*: leak-checking every payload, refusing to proceed if the shield
didn't run locally, and showing the exact redacted text. Also keeping Nano's small context budget in mind (chunked
entity detection, routing by size).

**What's next.** Photo/PDF input via on-device OCR, Android (Gemini Nano 4) and iOS (Apple Foundation Models)
clients on the same routing policy, and a Remote Config-driven policy per document type.

**Existing-app disclosure:** this project was created from scratch during the submission period.

### 3-minute demo script
1. (0:00) Hook: "Your medical bill is full of private details. Here's how to understand it without sharing them."
2. (0:15) Load the hospital bill. Click **Shield & decode**. Point at the black redaction bars, then the flight log:
   *asked `PREFER_ON_DEVICE`, ran `ON_DEVICE`, 0 bytes left this device*.
3. (0:55) Show the restored names underlined in the answer, then click a highlight to un-shield and re-decode.
4. (1:20) Load the lease (long). Show routing escalating to `ONLY_IN_CLOUD`, the payload preview, and the
   "0 names, addresses or IDs" leak-guard claim.
5. (2:00) Ask a follow-up using a real name; show the question is shielded too.
6. (2:20) DevTools → Network → **Offline**, decode the bill again: it still works, fully on-device.
7. (2:40) Show `src/engine.ts` and the Firebase console (AI Logic, App Check, Remote Config). Close on the tagline.
