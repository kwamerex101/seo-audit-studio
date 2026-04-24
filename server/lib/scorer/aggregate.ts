import type { PageScoreResult } from "./deterministic";

export type SiteAggregates = {
  site_seo_score: number;
  site_geo_score: number;
  site_overall_score: number;
  site_category_averages: {
    technical: number;
    on_page: number;
    content: number;
    links: number;
    schema: number;
    geo: number;
  };
};

export function aggregateSite(
  pages: Array<{ score: PageScoreResult["score"] }>,
): SiteAggregates {
  if (pages.length === 0) {
    return {
      site_seo_score: 0,
      site_geo_score: 0,
      site_overall_score: 0,
      site_category_averages: {
        technical: 0,
        on_page: 0,
        content: 0,
        links: 0,
        schema: 0,
        geo: 0,
      },
    };
  }
  const avg = (key: keyof PageScoreResult["score"]) => {
    let sum = 0;
    for (const p of pages) sum += Number(p.score[key] ?? 0);
    return Math.round(sum / pages.length);
  };
  const technical = avg("technical");
  const on_page = avg("on_page");
  const content = avg("content");
  const links = avg("links");
  const schema = avg("schema");
  const geo = avg("geo");
  const seo = Math.round((technical + on_page + content + links + schema) / 5);
  const overall = Math.round(seo * 0.6 + geo * 0.4);
  return {
    site_seo_score: seo,
    site_geo_score: geo,
    site_overall_score: overall,
    site_category_averages: { technical, on_page, content, links, schema, geo },
  };
}
