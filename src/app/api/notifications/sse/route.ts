/**
 * SSE endpoint for real-time in-app notifications.
 * GET /api/notifications/sse
 *
 * Validates the JWT session before establishing the stream.
 * Pushes notification events when notifyService.send() creates in-app records.
 */
import { getToken } from "next-auth/jwt";
import { sseManager } from "@/lib/sse-manager";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Authenticate via JWT
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.employeeId) {
    return new Response("Unauthorized", { status: 401 });
  }
  const employeeId = token.employeeId as string;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial keepalive
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(": keepalive\n\n"));

      // Register this connection
      sseManager.register(employeeId, controller);

      // Periodic keepalive to prevent proxy/browser timeouts
      const keepaliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepaliveInterval);
        }
      }, 30_000);

      // Cleanup when the client disconnects
      request.signal.addEventListener("abort", () => {
        clearInterval(keepaliveInterval);
        sseManager.unregister(employeeId, controller);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
