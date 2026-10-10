// RPC handlers for window.tin.http (desktop only - see PLAN.md: the
// cross-origin fetch itself can't happen in here, since this package stays
// platform-agnostic. `doFetch` is the one thing the desktop shell supplies:
// a fetch-shaped function backed by Tauri's HTTP plugin, which runs the
// request in Rust and so isn't subject to the browser's CORS checks.
import type { RpcHandlers } from "./bridge.ts";

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export type DoFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<HttpResponse>;

export function createHttpHandlers(
  checkPermission: (name: string, reason: string) => Promise<boolean>,
  doFetch: DoFetch,
): RpcHandlers {
  return {
    async "http.fetch"(url: string, init?: Parameters<DoFetch>[1]) {
      const host = new URL(url).host;
      const allowed = await checkPermission(`network:${host}`, `Connect to ${host}`);
      if (!allowed) throw new Error(`Network access to ${host} was denied`);
      return doFetch(url, init);
    },
  };
}
