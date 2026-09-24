import { plainMessage, processInvoice } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let rawText = "";
  try {
    const body = (await request.json()) as { rawText?: unknown };
    rawText = typeof body.rawText === "string" ? body.rawText.trim() : "";
  } catch {
    return Response.json(
      { error: "The request body was not valid JSON." },
      { status: 400 }
    );
  }
  if (!rawText) {
    return Response.json(
      { error: "No invoice text was provided." },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown): void => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };
      try {
        const result = await processInvoice(rawText, (label) =>
          send("stage", { label })
        );
        send("done", { result });
      } catch (reason) {
        send("error", { message: plainMessage(reason) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}