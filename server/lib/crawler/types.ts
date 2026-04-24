export type PageSignals = {
  url: string;
  http_status: number;
  fetched_at: string;
  title: string | null;
  title_length: number;
  meta_description: string | null;
  meta_description_length: number;
  h1: string | null;
  has_h1: boolean;
  h1_count: number;
  headings: Array<{ tag: string; text: string }>;
  heading_hierarchy_clean: boolean;
  images_total: number;
  images_missing_alt: number;
  images_no_alt: string[];
  json_ld: unknown[];
  json_ld_types: string[];
  organization_schema: {
    present: boolean;
    has_name: boolean;
    has_url: boolean;
    has_logo: boolean;
    has_sameAs: boolean;
  };
  canonical: string | null;
  canonical_present: boolean;
  canonical_self_ref: boolean;
  og_tags: Record<string, string>;
  twitter_card: boolean;
  viewport: boolean;
  charset_utf8: boolean;
  lang: string | null;
  hreflang: string[];
  https: boolean;
  first_200_words: string;
  faq_section: boolean;
  internal_links: string[];
  external_links: string[];
  internal_anchor_generic_count: number;
  word_count: number;
  page_type_guess: PageTypeGuess;
};

export type PageTypeGuess =
  | "homepage"
  | "blog_post"
  | "blog_listing"
  | "product"
  | "about"
  | "contact"
  | "faq"
  | "content";

export type SiteSignals = {
  robots_txt: {
    present: boolean;
    blocks_all: boolean;
    sitemaps: string[];
  };
  sitemap: {
    present: boolean;
    valid: boolean;
    urls: string[];
  };
  llms_txt: boolean;
};
