"use client";

import { AlertTriangleIcon, CheckCircle2Icon, LoaderCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ConfirmationDialog({
  busy,
  confirmLabel,
  description,
  open,
  title,
  tone = "default",
  onConfirm,
  onOpenChange,
}: {
  busy: boolean;
  confirmLabel: string;
  description: string;
  open: boolean;
  title: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const Icon = tone === "danger" ? AlertTriangleIcon : CheckCircle2Icon;
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!busy) onOpenChange(nextOpen);
    }}>
      <DialogContent className="overflow-hidden rounded-3xl border-[#d7e0da] bg-white p-0 shadow-2xl sm:max-w-md" showCloseButton={!busy}>
        <div className="bg-gradient-to-br from-[#edf4ef] to-white px-6 pb-5 pt-6">
          <span className={`grid size-11 place-items-center rounded-2xl ${tone === "danger" ? "bg-red-100 text-red-700" : "bg-[#dcebe1] text-[#27563f]"}`}>
            <Icon className="size-5" />
          </span>
          <DialogHeader className="mt-4 text-left">
            <DialogTitle className="text-xl tracking-[-0.02em] text-[#173f2d]">{title}</DialogTitle>
            <DialogDescription className="leading-6 text-[#617168]">{description}</DialogDescription>
          </DialogHeader>
        </div>
        <DialogFooter className="border-t border-[#e3e9e5] bg-[#fafbf9] px-6 py-4 sm:justify-end">
          <Button disabled={busy} onClick={() => onOpenChange(false)} type="button" variant="outline">Cancel</Button>
          <Button disabled={busy} onClick={onConfirm} type="button" variant={tone === "danger" ? "destructive" : "default"}>
            {busy ? <LoaderCircleIcon className="animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
