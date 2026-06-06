import { QueryClient, QueryCache, MutationCache, QueryFunction } from "@tanstack/react-query";
import { notifyError, markErrorNotified } from "./errorNotify";

function operationFromUrl(url: string): string {
  if (url.startsWith("/api/tts/confirmation")) return "Generate audio";
  if (url.startsWith("/api/tts/text")) return "Generate audio";
  if (url.startsWith("/api/tts/")) return "Generate audio";
  if (url.startsWith("/api/transcribe")) return "Transcribe audio";
  if (url.startsWith("/api/image/")) return "Generate image";
  if (url.startsWith("/api/admin/")) return "Admin action";
  return "Request";
}

async function throwIfResNotOk(res: Response, url: string) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    const err = new Error(`${res.status}: ${text}`);
    if (res.status !== 401) {
      notifyError(operationFromUrl(url), err);
    } else {
      markErrorNotified(err);
    }
    throw err;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: { headers?: Record<string, string> },
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(data ? { "Content-Type": "application/json" } : {}),
    ...(options?.headers || {}),
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
  } catch (err) {
    notifyError("Network", err);
    throw err;
  }

  await throwIfResNotOk(res, url);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    let res: Response;
    try {
      res = await fetch(url, {
        credentials: "include",
      });
    } catch (err) {
      notifyError("Network", err);
      throw err;
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res, url);
    return await res.json();
  };

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => notifyError("Request", error),
  }),
  mutationCache: new MutationCache({
    onError: (error) => notifyError("Request", error),
  }),
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
