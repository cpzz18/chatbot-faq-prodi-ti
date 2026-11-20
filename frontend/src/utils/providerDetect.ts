import type { LlmProvider } from "../types/chat";

export const PROVIDER_OPTIONS: ReadonlyArray<{
  value: LlmProvider;
  label: string;
  hint: string;
}> = [
  { value: "auto", label: "Otomatis Deteksi dari Key", hint: "AIza / sk- / gsk_ / sk-ant- / sk-or-" },
  { value: "gemini", label: "Google Gemini", hint: "Prefix AIza..." },
  { value: "openai", label: "OpenAI (ChatGPT)", hint: "Prefix sk-... atau sk-proj-..." },
  { value: "groq", label: "Groq", hint: "Prefix gsk_..." },
  { value: "anthropic", label: "Anthropic Claude", hint: "Prefix sk-ant-..." },
  { value: "openrouter", label: "OpenRouter", hint: "Prefix sk-or-..." },
  { value: "deepseek", label: "DeepSeek", hint: "Prefix sk-... (DeepSeek Platform)" },
];

const DEEPSEEK_KEY_REGEX = /^sk-[0-9a-f]{32}$/;

export function detectClientProvider(
  rawKey: string,
  selectedProvider: LlmProvider = "auto"
): Exclude<LlmProvider, "auto"> {
  const key = rawKey.trim();

  // Prefix Guard: prefix yang tidak ambigu selalu mengarah ke provider pemilik resminya
  if (key.startsWith("AIza")) return "gemini";
  if (key.startsWith("gsk_")) return "groq";
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-or-")) return "openrouter";

  if (DEEPSEEK_KEY_REGEX.test(key)) {
    return selectedProvider === "openai" ? "openai" : "deepseek";
  }

  if (selectedProvider !== "auto") {
    return selectedProvider;
  }

  if (key.startsWith("sk-")) return "openai";
  return "gemini";
}

export function getProviderLabel(provider: string | null | undefined): string {
  switch (provider) {
    case "gemini":
      return "Gemini";
    case "openai":
      return "OpenAI";
    case "groq":
      return "Groq";
    case "anthropic":
      return "Claude";
    case "openrouter":
      return "OpenRouter";
    case "deepseek":
      return "DeepSeek";
    default:
      return "AI";
  }
}

export function maskApiKey(rawKey: string): string {
  const key = rawKey.trim();
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `••••${key.slice(-4)}`;
}
