import type {
  ChatApiResponse,
  ChatStateResponse,
  FaqListResponse,
} from "../types/chat";

const inFlightGetRequests = new Map<string, Promise<unknown>>();

function getCsrfToken(): string {
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("csrftoken="));
  return match ? decodeURIComponent(match.slice("csrftoken=".length)) : "";
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof (data as { error?: string }).error === "string"
        ? (data as { error: string }).error
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

  const requestPromise = fetch(url, {
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

export async function sendChatMessage(message: string): Promise<ChatApiResponse> {
  const res = await fetch("/api/chat/", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCsrfToken(),
    },
    body: JSON.stringify({ message }),
  });
  return parseJsonOrThrow<ChatApiResponse>(res);
}

export async function resetChatHistory(): Promise<void> {
  const res = await fetch("/api/chat/reset/", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "X-CSRFToken": getCsrfToken(),
    },
  });
  await parseJsonOrThrow<{ status: string }>(res);
}
