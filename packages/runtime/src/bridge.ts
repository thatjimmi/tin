// Host-side half of the RPC bridge. The sandboxed iframe has an opaque
// origin, so we can't check event.origin - instead we check event.source
// is literally the iframe's window, which postMessage can't forge.

export type RpcHandlers = Record<string, (...args: any[]) => unknown>;

interface RpcRequest {
  type: "tin-rpc";
  id: string;
  method: string;
  args: unknown[];
}

export function createBridge(iframe: HTMLIFrameElement, handlers: RpcHandlers): () => void {
  function onMessage(event: MessageEvent) {
    if (event.source !== iframe.contentWindow) return;
    const msg = event.data as Partial<RpcRequest> | undefined;
    if (!msg || msg.type !== "tin-rpc" || typeof msg.id !== "string") return;

    const reply = (payload: { result?: unknown; error?: string }) =>
      iframe.contentWindow?.postMessage({ type: "tin-rpc-response", id: msg.id, ...payload }, "*");

    Promise.resolve()
      .then(() => {
        const handler = msg.method && handlers[msg.method];
        if (!handler) throw new Error(`Unknown method: ${msg.method}`);
        return handler(...(msg.args ?? []));
      })
      .then(
        (result) => reply({ result }),
        (error) => reply({ error: error instanceof Error ? error.message : String(error) }),
      );
  }

  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
