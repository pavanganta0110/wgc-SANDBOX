import { HELP_ARTICLES, type HelpArticle } from "@/lib/support/helpArticles";

/**
 * Search over the Help Center: finds the best question-and-answer for what a person typed, with no AI and no
 * outside service. The articles are static content in this codebase; every search runs on our own server.
 *
 * Each article is split into question/answer entries (the <h3> question followed by its <p> answer; an older
 * single-paragraph article is one entry whose question is its title). Entries are ranked with a small
 * BM25-style score over word stems, with a few synonym groups so "donor"/"payer" or "payout"/"deposit" match.
 */

export interface HelpEntry {
  slug: string;
  articleTitle: string;
  category: string;
  question: string;
  answer: string;
}

export interface HelpSearchResult extends HelpEntry {
  score: number;
}

const ENTITIES: [RegExp, string][] = [
  [/&amp;/g, "&"],
  [/&gt;/g, ">"],
  [/&lt;/g, "<"],
  [/&quot;/g, '"'],
  [/&#39;|&apos;/g, "'"],
  [/&nbsp;/g, " "],
];

export function htmlToText(html: string): string {
  // Inline formatting joins the surrounding text; block tags (p, h3, li, br) separate it.
  let text = html.replace(/<\/?(?:strong|em|b|i|a|span|code|u)(?:\s[^>]*)?>/g, "").replace(/<[^>]+>/g, " ");
  for (const [pattern, replacement] of ENTITIES) text = text.replace(pattern, replacement);
  return text.replace(/\s+/g, " ").trim();
}

/** Splits an article into question/answer entries. */
export function extractEntries(article: HelpArticle): HelpEntry[] {
  const base = { slug: article.slug, articleTitle: article.title, category: article.category };
  const pairs = [...article.bodyHtml.matchAll(/<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)];
  if (pairs.length > 0) {
    return pairs.map((m) => ({ ...base, question: htmlToText(m[1]), answer: htmlToText(m[2]) }));
  }
  return [{ ...base, question: article.title, answer: htmlToText(article.bodyHtml) }];
}

const STOPWORDS = new Set(
  (
    "a an the is are was were be been do does did done i me my we our us you your it its this that these those " +
    "how what why when where which who whom can could should would will may might to of in on at for from by with " +
    "and or but if so not no yes as about into than then there here also just only any some all more most very " +
    "please want need get got make made use using see say said instead tell like"
  ).split(" ")
);

// Words that mean the same thing for our product. Every word in a group matches every other in the group.
const SYNONYM_GROUPS: string[][] = [
  ["payer", "donor", "customer", "giver", "student"],
  ["payment", "donation", "gift", "transaction", "charge"],
  ["deposit", "payout", "settlement", "transfer", "paid"],
  ["fee", "cost", "price", "pricing", "rate", "surcharge"],
  ["print", "pdf", "download", "save"],
  ["email", "mail", "send", "resend"],
  ["export", "csv", "spreadsheet", "excel", "download"],
  ["filter", "narrow", "sort"],
  ["attach", "upload", "document", "file", "proof", "evidence"],
  ["remove", "delete", "detach"],
  ["note", "memo", "comment", "reference"],
  ["logo", "brand", "color", "colour", "theme"],
  ["weekly", "week", "daily", "schedule", "frequency", "often"],
  ["phone", "call", "telephone"],
  ["term", "semester", "quarter"],
  ["receipt", "confirmation"],
  ["refund", "reverse", "reversal"],
  ["team", "teammate", "user", "member", "staff"],
  ["password", "login", "signin", "sign-in", "locked"],
  ["insight", "analytics", "report", "volume"],
];

/** Light stemmer: enough to match "receipts"/"receipt", "processing"/"processed"/"process". */
export function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && w.endsWith("sses")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  if (w.length > 4 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

// Words that mean the same thing so closely that they should match at full strength.
const CANONICAL: Record<string, string> = { find: "search", lookup: "search", locate: "search", searching: "search" };

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9$\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map((t) => stem(CANONICAL[t] ?? t));
}

const SYNONYMS = new Map<string, Set<string>>();
for (const group of SYNONYM_GROUPS) {
  const stems = group.map((g) => stem(g));
  for (const s of stems) {
    const set = SYNONYMS.get(s) ?? new Set<string>();
    for (const other of stems) if (other !== s) set.add(other);
    SYNONYMS.set(s, set);
  }
}

interface IndexedEntry {
  entry: HelpEntry;
  weighted: Map<string, number>; // term -> weighted frequency (question x3, article title x2, answer x1)
  length: number;
}

const FIELD_WEIGHTS = { question: 3, title: 2, answer: 1 };

function addTerms(into: Map<string, number>, text: string, weight: number): number {
  const tokens = tokenize(text);
  for (const t of tokens) into.set(t, (into.get(t) ?? 0) + weight);
  return tokens.length * weight;
}

function buildIndex(articles: HelpArticle[]) {
  const entries: IndexedEntry[] = [];
  for (const article of articles) {
    for (const entry of extractEntries(article)) {
      const weighted = new Map<string, number>();
      let length = 0;
      length += addTerms(weighted, entry.question, FIELD_WEIGHTS.question);
      length += addTerms(weighted, entry.articleTitle, FIELD_WEIGHTS.title);
      length += addTerms(weighted, entry.answer, FIELD_WEIGHTS.answer);
      entries.push({ entry, weighted, length });
    }
  }
  const docFreq = new Map<string, number>();
  for (const e of entries) for (const term of e.weighted.keys()) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
  const avgLength = entries.reduce((s, e) => s + e.length, 0) / Math.max(entries.length, 1);
  return { entries, docFreq, avgLength };
}

const K1 = 1.2;
const B = 0.5;
const SYNONYM_WEIGHT = 0.55;
/** A result must score at least this, and match this share of the meaningful words typed, to be shown. */
export const MIN_SCORE = 1.6;
export const MIN_COVERAGE = 0.34;

export interface SearchOptions {
  articles?: HelpArticle[];
  limit?: number;
}

/**
 * Best matching question-and-answer per article, best first. Empty when nothing is a reasonable match, which is
 * the cue to offer "Contact Support".
 */
export function searchHelp(query: string, options: SearchOptions = {}): HelpSearchResult[] {
  const articles = options.articles ?? HELP_ARTICLES;
  const limit = options.limit ?? 3;
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0) return [];

  const { entries, docFreq, avgLength } = buildIndex(articles);
  const n = entries.length;
  const idf = (term: string) => {
    const df = docFreq.get(term) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  };
  const termScore = (tf: number, length: number, term: string) =>
    idf(term) * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (length / avgLength))));

  const scored: HelpSearchResult[] = [];
  for (const { entry, weighted, length } of entries) {
    let score = 0;
    let matched = 0;
    for (const term of queryTerms) {
      const direct = weighted.get(term);
      if (direct) {
        score += termScore(direct, length, term);
        matched++;
        continue;
      }
      // No exact word: take the best synonym, at a reduced weight.
      let best = 0;
      for (const syn of SYNONYMS.get(term) ?? []) {
        const tf = weighted.get(syn);
        if (tf) best = Math.max(best, termScore(tf, length, syn) * SYNONYM_WEIGHT);
      }
      if (best > 0) {
        score += best;
        matched++;
      }
    }
    const coverage = matched / queryTerms.length;
    // Reward entries whose question contains most of what was typed.
    const questionTerms = new Set(tokenize(entry.question));
    const inQuestion = queryTerms.filter((t) => questionTerms.has(t)).length / queryTerms.length;
    const finalScore = score * (0.55 + 0.45 * coverage) * (1 + 0.35 * inQuestion);
    if (coverage >= MIN_COVERAGE && finalScore >= MIN_SCORE) scored.push({ ...entry, score: finalScore });
  }

  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const results: HelpSearchResult[] = [];
  for (const r of scored) {
    if (seen.has(r.slug)) continue;
    seen.add(r.slug);
    results.push(r);
    if (results.length >= limit) break;
  }
  return results;
}

/**
 * What we are willing to keep about a search: long digit runs (card/account numbers) and email addresses are
 * masked before anything is logged, and the text is capped.
 */
export function redactQuery(query: string): string {
  return query
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\b\d(?:[ -]?\d){5,}\b/g, "[number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}
