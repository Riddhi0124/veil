// Demo/UI-development engine (?mock=1). It never calls Firebase and is clearly labelled in the UI.
// Real submissions run on the Firebase engine in engine.ts.
import type { Engine, Route } from "./engine";
import { detectHeuristic } from "./shield";
import type { Analysis } from "./types";
import { DEFAULT_CONFIG } from "./firebase";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const firstToken = (s: string, type: string, n = 1) => s.match(new RegExp(`\\[${type}_${n}\\]`))?.[0] ?? "the other party";

function canned(redacted: string): Analysis {
  const p1 = redacted.match(/(?:Patient|Member):\s*(\[PERSON_\d+\])/)?.[1] ?? firstToken(redacted, "PERSON"), id = firstToken(redacted, "ID");
  if (/Adverse Benefit/i.test(redacted))
    return {
      docType: "Insurance denial letter",
      headline: "Your insurer denied 4 of 14 therapy visits, and you can appeal.",
      plainEnglish: `The plan paid for the first 10 physical therapy visits but denied visits 11 to 14 because no prior authorization was on file. That leaves $720.00 on your side. The denial is about paperwork, not about whether the therapy worked, which is exactly the kind of decision an appeal with a doctor's letter can change.`,
      keyFacts: [
        { label: "Denied amount", value: "$720.00 (visits 11–14)" },
        { label: "Visit limit", value: "10 per year without prior authorization" },
        { label: "Claim", value: id },
      ],
      deadlines: [{ what: "File your written appeal", when: "Within 180 days of receiving this notice" }],
      redFlags: [
        { issue: "Denied for missing paperwork, not medical need", why: "The letter says 'not medically necessary' but the only stated reason is a missing prior authorization.", severity: "high" },
        { issue: "Prior authorization was never mentioned earlier", why: "Ask whether the provider or plan was responsible for requesting it before visit 11.", severity: "medium" },
      ],
      questionsToAsk: [
        "Did my therapist's office request prior authorization, and when?",
        "Can the plan approve visits 11–14 retroactively with a doctor's letter?",
        "May I have a copy of all documents relevant to my claim, free of charge?",
      ],
    };
  if (/LEASE AGREEMENT/i.test(redacted))
    return {
      docType: "Residential lease",
      headline: "Standard rent, but several clauses lean heavily toward the landlord.",
      plainEnglish: `${redacted.match(/(\[PERSON_\d+\]) and \[PERSON_\d+\] \("Tenant"/)?.[1] ?? p1} would pay $2,350 a month for a 12-month term that renews automatically for another year at a rent the landlord alone sets unless you give 60 days' notice. The lease adds extra costs beyond rent, limits guests, and makes it expensive to leave early. Several clauses are worth negotiating before you sign.`,
      keyFacts: [
        { label: "Monthly rent", value: "$2,350.00" },
        { label: "Security deposit", value: "$3,525.00 + $350 non-refundable fee" },
        { label: "Building services fee", value: "$85/mo, adjustable" },
        { label: "Early exit fee", value: "3 months' rent" },
      ],
      deadlines: [
        { what: "Lease starts", when: "December 1, 2026" },
        { what: "Notice to avoid auto-renewal", when: "60 days before November 30, 2027" },
      ],
      redFlags: [
        { issue: "Auto-renewal at a rent set only by the landlord", why: "You'd be locked into another year at an unknown price if you miss the 60-day window.", severity: "high" },
        { issue: "Early termination costs 3 months' rent plus rent until re-let", why: "Landlord has no duty to re-let quickly, so exposure can exceed the fee itself.", severity: "high" },
        { issue: "Tenant pays landlord's attorney fees only if landlord wins", why: "One-sided fee shifting discourages you from disputing charges.", severity: "medium" },
        { issue: "Non-refundable $350 fee and an adjustable $85 services fee", why: "Hidden-ish costs on top of the advertised rent.", severity: "medium" },
      ],
      questionsToAsk: [
        "Can the renewal rent be capped, for example at a fixed percentage?",
        "Can the early-termination fee be lowered or end once the unit is re-let?",
        "What exactly does the $85 services fee cover and how is it adjusted?",
      ],
    };
  return {
    docType: "Hospital bill",
    headline: "You owe $3,382.50, and there are things worth asking about before paying.",
    plainEnglish: `${p1} visited the emergency department on September 18. The hospital billed $8,885.00. After the insurance discount and an insurance payment of $2,400.00, the remaining balance is $3,382.50. Most of that comes from your deductible and 20% coinsurance. You have 30 days to pay, and unpaid accounts can go to collections after 60 days.`,
    keyFacts: [
      { label: "Total billed", value: "$8,885.00" },
      { label: "Insurance paid", value: "$2,400.00" },
      { label: "You owe", value: "$3,382.50" },
      { label: "Account", value: id },
    ],
    deadlines: [
      { what: "Pay or arrange a plan", when: "30 days from October 29, 2026" },
      { what: "Possible collections referral", when: "After 60 days unpaid" },
    ],
    redFlags: [
      { issue: "Facility fee is $3,850.00 for one ED visit", why: "Level 4 emergency facility fees vary widely; it's the single biggest charge.", severity: "medium" },
      { issue: "The statement is not itemized", why: "You can request a full itemized bill and check each code, including 74177 (CT).", severity: "low" },
    ],
    questionsToAsk: [
      "Can I get a fully itemized bill and the explanation of benefits?",
      "Is there a financial-assistance or prompt-pay discount?",
      "Can I set up a no-interest payment plan before the 60-day mark?",
    ],
  };
}

export function createMockEngine(): Engine {
  return {
    kind: "mock",
    config: DEFAULT_CONFIG,
    deviceStatus: async () => "available",
    async warmUp(onProgress) {
      for (let i = 1; i <= 10; i++) { await sleep(90); onProgress(i / 10); }
    },
    async detectEntities(text) {
      await sleep(900);
      return detectHeuristic(text).map((r) => ({ text: r.text, type: r.type }));
    },
    async analyze(redacted, route: Route) {
      const cloud = route.mode === "ONLY_IN_CLOUD";
      await sleep(cloud ? 1500 : 2300);
      return {
        analysis: canned(redacted),
        source: cloud ? "in_cloud" : "on_device",
        ms: cloud ? 1480 : 2260,
        model: cloud ? DEFAULT_CONFIG.cloudModel : "Gemini Nano (Chrome)",
      };
    },
    async answer({ redactedDoc, question }, route, onText) {
      const p = firstToken(redactedDoc, "PERSON");
      const reply = `Based on the document, ${p} has a few options here. For "${question.slice(0, 60)}", the safest first step is to put the request in writing and ask for the specific clause or code to be explained. Keep copies of everything you send.`;
      let acc = "";
      for (const w of reply.split(" ")) { acc += (acc ? " " : "") + w; onText(acc); await sleep(28); }
      const cloud = route.mode === "ONLY_IN_CLOUD";
      return { text: acc, source: cloud ? "in_cloud" : "on_device", ms: 1200, model: cloud ? DEFAULT_CONFIG.cloudModel : "Gemini Nano (Chrome)" };
    },
  };
}
