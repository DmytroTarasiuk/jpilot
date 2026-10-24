"use client";

import { CheckCircle2Icon, FileUpIcon, LoaderCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type UploadState = "idle" | "requesting" | "uploading" | "finalizing" | "done" | "error";

export function CvUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [message, setMessage] = useState("PDF or DOCX · maximum 10 MB");

  async function upload(file: File) {
    try {
      setState("requesting");
      setMessage("Creating a private upload…");
      const request = await fetch("/api/cv/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, sizeBytes: file.size }),
      });
      if (!request.ok) throw new Error(await responseMessage(request));
      const payload = (await request.json()) as { documentId: string; uploadUrl: string };

      setState("uploading");
      setMessage("Uploading directly to private storage…");
      const uploaded = await fetch(payload.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!uploaded.ok) throw new Error("The storage upload failed.");

      setState("finalizing");
      setMessage("Verifying the uploaded object…");
      const finalized = await fetch(`/api/cv/uploads/${payload.documentId}/complete`, { method: "POST" });
      if (!finalized.ok) throw new Error(await responseMessage(finalized));

      setState("done");
      setMessage(`${file.name} was uploaded. Secure processing has started.`);
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Upload failed. Please try again.");
    }
  }

  const busy = state === "requesting" || state === "uploading" || state === "finalizing";
  return (
    <section className="rounded-2xl border border-[#d9e2dc] bg-white p-6">
      <input
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="sr-only"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
        ref={inputRef}
        type="file"
      />
      <button
        className="flex min-h-64 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-[#adc0b5] bg-[#f8faf7] px-6 text-center transition hover:border-[#567563] disabled:cursor-wait"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        <span className="grid size-14 place-items-center rounded-2xl bg-[#e6eee8] text-[#27563f]">
          {busy ? (
            <LoaderCircleIcon className="size-6 animate-spin" />
          ) : state === "done" ? (
            <CheckCircle2Icon className="size-6" />
          ) : (
            <FileUpIcon className="size-6" />
          )}
        </span>
        <span className="mt-5 font-semibold">{state === "done" ? "Upload another CV" : "Choose a CV to upload"}</span>
        <span aria-live="polite" className={`mt-2 text-sm ${state === "error" ? "text-red-700" : "text-[#718078]"}`}>{message}</span>
      </button>
      <p className="mt-4 text-xs leading-5 text-[#7a8780]">
        The browser uploads directly through a ten-minute signed URL. The bucket is not public, and JobPilot stores only the private object key.
      </p>
    </section>
  );
}

async function responseMessage(response: Response) {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? `Request failed with status ${response.status}.`;
}
