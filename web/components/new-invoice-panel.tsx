"use client";

import { useRef, useState } from "react";
import type { ProcessResult } from "@/lib/db";

const EVENT_SEPARATOR = "\n\n";

interface StreamEvent {
  event: string;
  data: unknown;
}

function parseChunk(chunk: string): StreamEvent {
  let event = "message";
  let data: unknown = null;
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data = JSON.parse(line.slice(5).trim());
    }
  }
  return { event, data };
}

export function NewInvoicePanel({
  onSuccess,
  onCancel,
}: {
  onSuccess: (result: ProcessResult) => void;
  onCancel: () => void;
}) {
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rawText = textRef.current?.value.trim() ?? "";
    if (!rawText || busy) return;

    setBusy(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch("/api/process-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          body?.error ??
            `The invoice endpoint did not accept the request (HTTP ${response.status}).`
        );
        return;
      }

      if (!(response.headers.get("Content-Type") ?? "").includes("text/event-stream")) {
        setError("The invoice endpoint did not return an event stream.");
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setError("The invoice endpoint did not return a readable body.");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let result: ProcessResult | null = null;
      let serverError: string | null = null;

      while (true) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        buffer += decoder.decode(value, { stream: true });
        let separator = buffer.indexOf(EVENT_SEPARATOR);
        while (separator !== -1) {
          const chunk = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          const { event, data } = parseChunk(chunk);
          if (event === "stage") {
            setStatus((data as { label?: string }).label ?? "Working...");
          } else if (event === "done") {
            result = (data as { result: ProcessResult }).result;
          } else if (event === "error") {
            serverError =
              (data as { message?: string }).message ??
              "Something went wrong while processing the invoice.";
          }
          separator = buffer.indexOf(EVENT_SEPARATOR);
        }
      }

      if (serverError) {
        setError(serverError);
        return;
      }
      if (!result) {
        setError("The invoice endpoint finished without a result.");
        return;
      }
      onSuccess(result);
    } catch {
      setError(
        "Could not reach the invoice pipeline. Check that the dev server is running."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-b border-ledger-line py-6">
      <form onSubmit={handleSubmit}>
        <label
          htmlFor="new-invoice-text"
          className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-ink/70"
        >
          Raw invoice text
        </label>
        <div className="mt-2">
          <textarea
            ref={textRef}
            id="new-invoice-text"
            rows={7}
            disabled={busy}
            spellCheck={false}
            placeholder="Paste the raw invoice text here…"
            className="block w-full resize-y border border-ledger-line bg-transparent p-3 font-mono text-sm leading-relaxed text-ink placeholder:text-ink/40 focus:border-brass focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          ></textarea>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <button
            type="submit"
            disabled={busy}
            className="border border-brass bg-transparent px-4 py-1.5 font-sans text-sm text-brass hover:bg-brass hover:text-paper focus:outline-none focus-visible:outline focus-visible:outline-brass disabled:cursor-not-allowed disabled:opacity-50"
          >
            Submit invoice
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="font-sans text-sm text-ink hover:text-brass focus:outline-none focus-visible:outline focus-visible:outline-brass disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          {status && (
            <p role="status" aria-live="polite" className="font-mono text-sm text-ink">
              {status}
            </p>
          )}
          {error && (
            <p role="alert" className="font-sans text-sm text-ink">
              {error}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}