const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function fetchWithRetry(input: string | URL, options: RequestInit & { timeoutMs?: number; retries?: number; retryDelayMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 20_000, retries = 2, retryDelayMs = 750, ...init } = options;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      if (!RETRYABLE.has(response.status) || attempt === retries) return response;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
    } catch (error) {
      lastError = error;
      if (attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
    } finally { clearTimeout(timer); }
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed after retries");
}

export function dedupeTenders<T extends { id: string; referenceNumber?: string; title: string; source: string }>(tenders: T[]): T[] {
  const seen = new Map<string, T>();
  for (const tender of tenders) {
    const ref = tender.referenceNumber?.trim().toLowerCase();
    const title = tender.title.replace(/\s+/g, " ").trim().toLowerCase();
    const key = ref ? `${tender.source.toLowerCase()}|ref:${ref}|title:${title}` : `${tender.source.toLowerCase()}|title:${title}`;
    if (!seen.has(key)) seen.set(key, tender);
  }
  return [...seen.values()];
}
