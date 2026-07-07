import { getHaClient } from "@/lib/server/ha-client";
import type { HassState } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const client = getHaClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // controller already closed
        }
      };

      const onState = (state: HassState) => send("state", state);
      const onConnection = (connected: boolean) => send("connection", { connected });

      client.on("state_changed", onState);
      client.on("connection", onConnection);

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 25_000);

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        client.off("state_changed", onState);
        client.off("connection", onConnection);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
