// Derive human-readable GEO readiness labels from the final per-page scores.
// Used by both runAudit (fresh audit) and rescoreAudit (re-run AI on existing
// crawl) so the report.geo_readiness object always has real labels instead of
// "pending_ai" placeholders.
//
// Source rubric (from checklist.json):
//   geo.direct_answer_potential   max 25
//   geo.citation_readiness        max 25
//   geo.information_gain          max 25
//   geo.structured_data_for_ai    max 25
//
// We can't recover per-sub-score values from the merged page scores after the
// fact, but we can reason about the *site* GEO score (0-100) plus the actual
// crawl signals (Organization schema completeness, sameAs presence, llms.txt,
// JSON-LD presence) to produce labels that match what an SEO consultant would
// say after looking at the audit.

import type { PageSignals, SiteSignals } from "../crawler/types";

export type GeoLabels = {
  citation_readiness: "absent" | "weak" | "moderate" | "strong";
  information_gain: "minimal" | "low" | "medium" | "high";
  brand_authority: "absent" | "weak" | "moderate" | "strong";
};

type ScoreOnly = { geo: number };

function quartileLabel(score: number): "absent" | "weak" | "moderate" | "strong" {
  if (score >= 70) return "strong";
  if (score >= 40) return "moderate";
  if (score >= 15) return "weak";
  return "absent";
}

function gainLabel(score: number): "minimal" | "low" | "medium" | "high" {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  if (score >= 15) return "low";
  return "minimal";
}

export function deriveGeoLabels(args: {
  aiScoringStatus: "pending" | "complete";
  pages: ScoreOnly[];
  signals?: PageSignals[];
  site?: SiteSignals;
}): GeoLabels {
  // If AI scoring didn't run, the geo score is structurally inflated (Phase-2
  // only deducts for the deterministic structured-data sub-score). Reflect that
  // by capping the labels at "weak" so the UI doesn't claim strong citation
  // readiness on an unaudited site.
  const cap: GeoLabels["citation_readiness"] =
    args.aiScoringStatus === "complete" ? "strong" : "weak";

  const avg =
    args.pages.length > 0
      ? args.pages.reduce((s, p) => s + (Number(p.geo) || 0), 0) /
        args.pages.length
      : 0;

  const citation = quartileLabel(avg);
  const gain = gainLabel(avg);

  // Brand authority blends the geo score with structural authority signals
  // (Organization schema completeness across pages, sameAs presence). A site
  // with great content but no Organization schema is still "weak" authority.
  let brand: GeoLabels["brand_authority"] = quartileLabel(avg);
  if (args.signals && args.signals.length > 0) {
    const orgPages = args.signals.filter(
      (s) => s.organization_schema?.present,
    ).length;
    const sameAsPages = args.signals.filter(
      (s) => s.organization_schema?.has_sameAs,
    ).length;
    const orgPct = orgPages / args.signals.length;
    const sameAsPct = sameAsPages / args.signals.length;
    if (orgPct < 0.1 && sameAsPct < 0.1) {
      brand =
        avg < 40 ? "absent" : avg < 70 ? "weak" : "moderate"; // demote
    } else if (orgPct >= 0.5 && sameAsPct >= 0.5 && avg >= 60) {
      brand = "strong";
    }
  }

  // Apply the AI-pending cap.
  const order: Array<GeoLabels["citation_readiness"]> = [
    "absent",
    "weak",
    "moderate",
    "strong",
  ];
  const capIdx = order.indexOf(cap);
  const clamp = (v: GeoLabels["citation_readiness"]) =>
    order[Math.min(order.indexOf(v), capIdx)] as GeoLabels["citation_readiness"];
  const clampGain = (v: GeoLabels["information_gain"]) => {
    const gainOrder: GeoLabels["information_gain"][] = [
      "minimal",
      "low",
      "medium",
      "high",
    ];
    return gainOrder[
      Math.min(gainOrder.indexOf(v), capIdx)
    ] as GeoLabels["information_gain"];
  };

  return {
    citation_readiness: clamp(citation),
    information_gain: clampGain(gain),
    brand_authority: clamp(brand),
  };
}

/**
 * Best-effort list of expected schema types for a site that didn't include
 * them. Used for the `missing_schema` chip row on the GEO readiness card.
 */
export function deriveMissingSchema(args: {
  signals: PageSignals[];
}): string[] {
  const present = new Set<string>();
  for (const p of args.signals) {
    for (const t of p.json_ld_types ?? []) present.add(t);
  }
  const expected: Array<{ type: string; reason: () => boolean }> = [
    { type: "Organization", reason: () => true },
    { type: "WebSite", reason: () => true },
    {
      type: "FAQPage",
      reason: () => args.signals.some((p) => p.faq_section),
    },
    {
      type: "BreadcrumbList",
      reason: () => args.signals.some((p) => p.page_type_guess !== "homepage"),
    },
    {
      type: "Person",
      reason: () =>
        args.signals.some((p) =>
          /(author|founder|CEO|consultant|advisor)/i.test(
            p.first_200_words ?? "",
          ),
        ),
    },
    {
      type: "Article",
      reason: () =>
        args.signals.some(
          (p) => p.page_type_guess === "blog_post",
        ),
    },
    {
      type: "Product",
      reason: () =>
        args.signals.some((p) => p.page_type_guess === "product"),
    },
  ];
  return expected
    .filter((e) => e.reason() && !present.has(e.type))
    .map((e) => e.type);
}

/**
 * Aggregate E-E-A-T signals observed across pages.
 */
export function aggregateEeatSignals(signals: PageSignals[]): string[] {
  const out = new Set<string>();
  for (const p of signals) {
    if (p.organization_schema?.has_sameAs) out.add("Organization sameAs");
    if (p.organization_schema?.has_logo) out.add("Organization logo");
    if (p.json_ld_types?.includes("Person")) out.add("Person schema");
    if (
      p.first_200_words &&
      /\b(founded|established|since\s+\d{4})\b/i.test(p.first_200_words)
    ) {
      out.add("Founding date");
    }
    if (
      p.first_200_words &&
      /(certified|certification|accredit|license[d]?)/i.test(
        p.first_200_words,
      )
    ) {
      out.add("Credentials / certifications");
    }
    if (
      p.first_200_words &&
      /\b(team|leadership|founder|CEO|principal)\b/i.test(p.first_200_words)
    ) {
      out.add("Team / leadership");
    }
    if (p.faq_section) out.add("FAQ content");
  }
  return Array.from(out);
}
