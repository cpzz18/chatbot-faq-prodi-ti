import type {
  ApiKeyConfig,
  ChatApiResponse,
  ChatStateResponse,
  FaqListResponse,
} from "../types/chat";

const DEFAULT_TIMEOUT_MS = 25_000;
const inFlightGetRequests = new Map<string, Promise<unknown>>();

function getCsrfToken(): string {
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("csrftoken="));
  return match ? decodeURIComponent(match.slice("csrftoken=".length)) : "";
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Permintaan melebihi batas waktu koneksi. Silakan coba lagi.");
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const payload = data as { error?: string; message?: string };
    const message =
      typeof payload.message === "string"
        ? payload.message
        : typeof payload.error === "string"
        ? payload.error
        : "Terjadi kesalahan saat menghubungi server.";
    throw new Error(message);
  }
  return data as T;
}

function deduplicatedGet<T>(url: string): Promise<T> {
  const existing = inFlightGetRequests.get(url) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }

  const requestPromise = fetchWithTimeout(url, {
    method: "GET",
    credentials: "same-origin",
  })
    .then((res) => parseJsonOrThrow<T>(res))
    .finally(() => {
      inFlightGetRequests.delete(url);
    });

  inFlightGetRequests.set(url, requestPromise);
  return requestPromise;
}

export function fetchChatState(): Promise<ChatStateResponse> {
  return deduplicatedGet<ChatStateResponse>("/api/chat/state/");
}

export function fetchFaqs(): Promise<FaqListResponse> {
  return deduplicatedGet<FaqListResponse>("/api/faqs/");
}

export async function sendChatMessage(
  message: string,
  apiKeyConfig?: ApiKeyConfig | null
): Promise<ChatApiResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-CSRFToken": getCsrfToken(),
  };

  const trimmedKey = apiKeyConfig?.apiKey.trim();
  if (trimmedKey) {
    headers["X-LLM-API-Key"] = trimmedKey;
    if (apiKeyConfig?.provider) {
      headers["X-LLM-Provider"] = apiKeyConfig.provider;
    }
  }

  const res = await fetchWithTimeout("/api/chat/", {
    method: "POST",
    credentials: "same-origin",
    headers,
    body: JSON.stringify({ message }),
  });
  return parseJsonOrThrow<ChatApiResponse>(res);
}

export async function resetChatHistory(): Promise<void> {
  const res = await fetchWithTimeout("/api/chat/reset/", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "X-CSRFToken": getCsrfToken(),
    },
  });
  await parseJsonOrThrow<{ status: string }>(res);
}
