import { z } from "zod";

export const OgTags = z
  .record(z.string(), z.union([z.string(), z.boolean(), z.null()]))
  .default({});

export const PageAudit = z
  .object({
    url: z.string(),
    title: z.string().nullable().optional(),
    title_length: z.number().optional(),
    meta_description: z.string().nullable().optional(),
    meta_description_length: z.number().optional(),
    h1: z.string().nullable().optional(),
    has_h1: z.boolean().optional(),
    heading_hierarchy_clean: z.boolean().optional(),
    images_total: z.number().optional(),
    images_missing_alt: z.number().optional(),
    images_no_alt: z.array(z.string()).optional(),
    json_ld_types: z.array(z.string()).default([]),
    json_ld: z.array(z.any()).optional(),
    canonical_present: z.boolean().optional(),
    canonical_self_ref: z.boolean().optional(),
    canonical: z.union([z.string(), z.boolean()]).nullable().optional(),
    og_tags: z.union([OgTags, z.boolean()]).optional(),
    twitter_card: z.boolean().optional(),
    viewport: z.boolean().optional(),
    charset_utf8: z.boolean().optional(),
    lang: z.string().nullable().optional(),
    https: z.boolean().optional(),
    direct_answer_first_200: z.boolean().optional(),
    faq_section: z.boolean().optional(),
    eeat_signals: z.array(z.string()).default([]).optional(),
    internal_links_raw_count: z.number().optional(),
    technical: z.number().optional(),
    on_page: z.number().optional(),
    content: z.number().optional(),
    links: z.number().optional(),
    schema: z.number().optional(),
    geo: z.number().optional(),
    score: z.number().optional(),
    issues: z.array(z.string()).optional(),
    type: z.string().optional(),
  })
  .passthrough();

export const TodoItem = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    issue: z.string(),
    fix: z.string(),
    importance: z.string().optional(),
    severity: z.string().optional(),
    priority: z.string().optional(),
    category: z.string().optional(),
    status: z.string().optional(),
    pages_affected: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

export const ImplementationPlanItem = z
  .object({
    id: z.union([z.string(), z.number()]),
    action: z.string(),
    priority: z.string(),
    effort: z.string().optional(),
    pages: z.union([z.string(), z.number()]).optional(),
    expected_impact: z.string().optional(),
    completed: z.boolean().default(false),
  })
  .passthrough();

export const KeywordTiers = z
  .object({
    primary: z.array(z.any()).default([]),
    secondary: z.array(z.any()).default([]),
    tertiary: z.array(z.any()).default([]),
  })
  .passthrough();

export const Competitor = z
  .object({
    name: z.string().optional(),
    note: z.string().optional(),
  })
  .passthrough();

export const GeoReadiness = z
  .object({
    llms_txt: z.boolean().optional(),
    structured_data: z.array(z.string()).default([]),
    missing_schema: z.array(z.string()).default([]),
    faq_section: z.boolean().optional(),
    direct_answer_potential: z.boolean().optional(),
    citation_readiness: z.string().optional(),
    information_gain: z.string().optional(),
    brand_authority: z.string().optional(),
    eeat_signals: z.array(z.string()).default([]),
  })
  .passthrough();

export const International = z
  .object({
    hreflang_tags: z.array(z.string()).default([]),
    hreflang_valid: z.boolean().optional(),
    geo_targeting: z.string().optional(),
    strategy: z.string().optional(),
    locale_signals: z.array(z.string()).default([]),
    recommendations: z.array(z.string()).default([]),
  })
  .passthrough();

export const TrinityReview = z
  .object({
    seo: z.string().optional(),
    geo: z.string().optional(),
    ux: z.string().optional(),
  })
  .passthrough();

export const SkillBasedSummary = z
  .object({
    on_page: z.string().optional(),
    content: z.string().optional(),
    technical: z.string().optional(),
    schema_geo: z.string().optional(),
  })
  .passthrough();

export const CategoryAverages = z
  .object({
    technical: z.number().optional(),
    on_page: z.number().optional(),
    content: z.number().optional(),
    links: z.number().optional(),
    schema: z.number().optional(),
    geo: z.number().optional(),
  })
  .passthrough();

export const CountryAnalysisEntry = z
  .object({
    country_name: z.string().optional(),
    competitors: z.array(Competitor).default([]),
    keyword_tiers: KeywordTiers.optional(),
    serp_notes: z.string().optional(),
  })
  .passthrough();

export const AuditReport = z
  .object({
    generated_at: z.string(),
    source_type: z.string().default("url"),
    source_value: z.string(),
    site_name: z.string(),
    site_overall_score: z.number(),
    site_seo_score: z.number(),
    site_geo_score: z.number(),
    report_source: z.string().optional(),
    site_category_averages: CategoryAverages.default({}),
    pages_audited: z.number().default(0),
    pages_discovered: z.number().default(0),
    discovered_urls: z.array(z.string()).default([]),
    geo_readiness: GeoReadiness.optional(),
    keyword_tiers: KeywordTiers.optional(),
    competitors: z.array(Competitor).default([]),
    countries: z.array(z.string()).default([]),
    country_analysis: z.record(z.string(), CountryAnalysisEntry).nullable().optional(),
    international: International.optional(),
    search_locale_note: z.string().optional(),
    trinity_review: TrinityReview.optional(),
    skill_based_summary: SkillBasedSummary.optional(),
    top_actions: z.array(z.string()).default([]),
    todo_list: z.array(TodoItem).default([]),
    pages: z.array(PageAudit).default([]),
    implementation_plan: z.array(ImplementationPlanItem).default([]),
    research_brief_path: z.string().optional(),
  })
  .passthrough();

export type AuditReport = z.infer<typeof AuditReport>;

export const Company = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  domain: z.string().optional(),
  created_at: z.string(),
});
export type Company = z.infer<typeof Company>;

export const Audit = z.object({
  id: z.string(),
  company_id: z.string(),
  company_slug: z.string(),
  source_url: z.string(),
  status: z.enum(["queued", "running", "completed", "failed"]),
  created_at: z.string(),
  completed_at: z.string().nullable().optional(),
  report_path: z.string().optional(),
  origin: z.enum(["app", "migrated"]).default("app"),
  site_overall_score: z.number().optional(),
  site_seo_score: z.number().optional(),
  site_geo_score: z.number().optional(),
  pages_audited: z.number().optional(),
});
export type Audit = z.infer<typeof Audit>;

export const ChatMessage = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  created_at: z.string(),
  citations: z.array(z.string()).default([]).optional(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const Conversation = z.object({
  audit_id: z.string(),
  messages: z.array(ChatMessage).default([]),
  updated_at: z.string(),
});
export type Conversation = z.infer<typeof Conversation>;

export const JobStep = z.enum([
  "queued",
  "sitemap",
  "crawl",
  "score_deterministic",
  "score_claude",
  "narrative",
  "persist",
  "done",
  "failed",
]);

export const JobStatus = z.object({
  id: z.string(),
  audit_id: z.string(),
  company_slug: z.string(),
  source_url: z.string(),
  step: JobStep,
  progress: z.number().min(0).max(100),
  message: z.string().default(""),
  log: z
    .array(
      z.object({
        at: z.string(),
        step: JobStep,
        message: z.string(),
      }),
    )
    .default([]),
  started_at: z.string(),
  completed_at: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
});
export type JobStatus = z.infer<typeof JobStatus>;
