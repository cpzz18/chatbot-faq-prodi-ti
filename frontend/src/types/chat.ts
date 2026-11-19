export type RagMode = "rag_llm" | "fallback_faq" | "no_context";

export type LlmProvider =
  | "auto"
  | "gemini"
  | "openai"
  | "groq"
  | "anthropic"
  | "openrouter"
  | "deepseek";

export interface ApiKeyConfig {
  apiKey: string;
  provider: LlmProvider;
}

export interface FaqSource {
  id?: number;
  question?: string;
  category?: string;
  source: string;
  score: number;
}

export interface ChatMessage {
  role: "user" | "bot";
  text: string;
  mode?: RagMode;
  model?: string | null;
  provider?: string | null;
  sources?: FaqSource[];
  cached?: boolean;
}

export interface ChatStateResponse {
  status?: string;
  request_id?: string;
  history: ChatMessage[];
  faq_count: number;
  quick_prompts: string[];
  server_llm_configured?: boolean;
  server_provider?: string | null;
}

export interface ChatApiResponse {
  status?: string;
  request_id?: string;
  reply: string;
  mode: RagMode;
  model: string | null;
  provider?: string | null;
  sources: FaqSource[];
  cached?: boolean;
}

export interface FaqListItem {
  id: number;
  category: string;
  question: string;
  source: string;
}

export interface FaqListResponse {
  status?: string;
  request_id?: string;
  count: number;
  faqs: FaqListItem[];
}
