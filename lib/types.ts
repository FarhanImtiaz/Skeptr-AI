// Shared types for Skeptr — "Know before you reply."
// One user (job seekers), one recurring pain (vetting suspicious offers/recruiters).
// The pipeline shape is unchanged from the original build: evidence bundle ->
// one structured LLM call -> cited verdict.

export type SourceType =
  | "job_posting" // the pasted/linked offer or posting page itself
  | "company_site" // the company's real site / careers page
  | "search_result" // general web search hit
  | "review_platform" // Glassdoor/Trustpilot-style reviews
  | "social" // social profile / post
  | "forum"; // Reddit / forum discussion (incl. scam reports)

// The single most important data structure in the build: source attribution
// must survive all the way to the LLM prompt.
export type EvidenceItem = {
  source: string; // e.g. "reddit.com/r/scams", "acme.com/careers", "search"
  source_type: SourceType;
  content: string; // extracted text/summary from Wire
};

export type EvidenceBundle = EvidenceItem[];

// Structured fields extracted from a pasted offer/message (or derived from a URL)
// used to drive targeted Wire evidence gathering.
export type JobHints = {
  // Scope guard: is the input plausibly a job posting / offer / recruiter
  // message / employer page? Permissive — only clearly-unrelated input is false.
  is_job_related: boolean;
  company: string | null;
  role: string | null;
  recruiter_name: string | null;
  recruiter_contact: string | null; // email / phone / handle if present
  company_domain: string | null; // best guess at the real company domain
  search_query: string; // web query to verify the company / surface scam reports
};

export type Confidence = "low" | "medium" | "high";
export type RiskLevel = "Safe" | "Caution" | "High Risk" | "Dangerous";

export type Citation = {
  claim: string;
  source: string;
};

// The verdict contract the LLM must return.
export type Verdict = {
  trust_score: number; // 0-100
  confidence: Confidence;
  risk_level: RiskLevel;
  summary: string;
  red_flags: Citation[];
  positive_signals: Citation[];
  sentiment_summary: string;
  recommendation: string; // answers: should I engage with this offer, or walk away?
};

// Input: a job posting URL or pasted offer / recruiter message text, OR a
// screenshot (data URL) of a chat/message that we OCR into text first.
export type InvestigateRequest = {
  input?: string;
  image?: string; // data URL: "data:image/png;base64,...."
};

export type VerdictResponse = {
  verdict: Verdict;
  served_from: "live" | "fallback";
  evidence_count: number;
};

// Returned when the input isn't a job offer / posting / recruiter message —
// Skeptr stays in scope rather than scoring an arbitrary page.
export type OffTopicResponse = {
  off_topic: true;
  message: string;
};

export type InvestigateResponse = VerdictResponse | OffTopicResponse;
