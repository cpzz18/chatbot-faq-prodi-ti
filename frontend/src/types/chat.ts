export type RagMode = "rag_llm" | "fallback_faq" | "no_context";

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
  sources?: FaqSource[];
  cached?: boolean;
}

export interface ChatStateResponse {
  history: ChatMessage[];
  faq_count: number;
  quick_prompts: string[];
}

export interface ChatApiResponse {
  reply: string;
  mode: RagMode;
  model: string | null;
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
  count: number;
  faqs: FaqListItem[];
}
