"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SignaturePad } from "./signature-pad";
import { PdfViewer } from "./pdf-viewer";
import { trpc } from "@/lib/trpc";
import { PenTool, XCircle, Loader2, CheckCircle } from "lucide-react";
import type { SignaturePlacement } from "@/types/signature";

interface SignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signatureRecord: {
    id: string;
    documentName: string;
    requesterName: string;
    placements?: string | null;
  } | null;
  onComplete: () => void;
}

export function SignatureDialog({
  open,
  onOpenChange,
  signatureRecord,
  onComplete,
}: SignatureDialogProps) {
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [step, setStep] = useState<"capture" | "confirm" | "decline">("capture");
  const [declineReason, setDeclineReason] = useState("");
  const [done, setDone] = useState<"signed" | "declined" | null>(null);

  const placements = useMemo<SignaturePlacement[]>(() => {
    if (!signatureRecord?.placements) return [];
    try {
      const parsed = JSON.parse(signatureRecord.placements);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [signatureRecord?.placements]);

  const hasPlacements = placements.length > 0;

  // Fetch PDF URL when we have placements
  const pdfUrlQuery = trpc.signature.getPdfUrl.useQuery(
    { signatureRecordId: signatureRecord?.id ?? "" },
    { enabled: !!signatureRecord?.id && hasPlacements },
  );

  const signMutation = trpc.signature.sign.useMutation({
    onSuccess: () => {
      setDone("signed");
      setTimeout(() => {
        onComplete();
        resetState();
      }, 1500);
    },
  });

  const declineMutation = trpc.signature.decline.useMutation({
    onSuccess: () => {
      setDone("declined");
      setTimeout(() => {
        onComplete();
        resetState();
      }, 1500);
    },
  });

  const resetState = () => {
    setSignatureDataUrl(null);
    setStep("capture");
    setDeclineReason("");
    setDone(null);
  };

  const handleClose = (o: boolean) => {
    if (!o) resetState();
    onOpenChange(o);
  };

  if (!signatureRecord) return null;

  const isPending = signMutation.isPending || declineMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={hasPlacements ? "max-w-4xl max-h-[90vh] overflow-y-auto" : "max-w-lg"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenTool size={18} />
            Sign Document
          </DialogTitle>
        </DialogHeader>

        {/* Document info */}
        <div className="bg-gray-50 dark:bg-charcoal-800 rounded-md p-3 text-sm space-y-1">
          <p>
            <span className="text-gray-500 dark:text-gray-400">Document:</span>{" "}
            <span className="font-medium">{signatureRecord.documentName}</span>
          </p>
          <p>
            <span className="text-gray-500 dark:text-gray-400">Requested by:</span>{" "}
            <span className="font-medium">{signatureRecord.requesterName}</span>
          </p>
        </div>

        {/* Done state */}
        {done && (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle
              size={48}
              className={done === "signed" ? "text-green-500 mb-2" : "text-gray-500 mb-2"}
            />
            <p className="text-lg font-medium">
              {done === "signed" ? "Document Signed" : "Signature Declined"}
            </p>
          </div>
        )}

        {/* Main content when not done */}
        {!done && step === "capture" && (
          <>
            {/* PDF viewer with placements (when available) */}
            {hasPlacements && pdfUrlQuery.data?.url && (
              <div className="border rounded-md p-2 bg-gray-50 dark:bg-charcoal-900">
                <PdfViewer
                  pdfUrl={pdfUrlQuery.data.url}
                  placements={placements}
                  editable={false}
                  signatureImageUrl={signatureDataUrl || undefined}
                />
              </div>
            )}

            {/* Signature capture */}
            <div>
              <p className="text-sm text-gray-500 mb-2">
                {hasPlacements
                  ? "Draw or type your signature below. It will appear at the marked positions above."
                  : "Draw or type your signature below."}
              </p>
              <SignaturePad onChange={setSignatureDataUrl} />
            </div>

            <div className="flex justify-between pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                onClick={() => setStep("decline")}
              >
                <XCircle size={14} className="mr-1" /> Decline
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!signatureDataUrl}
                onClick={() => setStep("confirm")}
              >
                <PenTool size={14} className="mr-1" /> Continue
              </Button>
            </div>
          </>
        )}

        {/* Confirm step */}
        {!done && step === "confirm" && signatureDataUrl && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Your signature will be applied to this document. This action cannot be undone.
            </p>
            <div className="border border-gray-200 dark:border-charcoal-600 rounded-md p-4 bg-white dark:bg-charcoal-900 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signatureDataUrl}
                alt="Your signature"
                className="max-h-[80px]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep("capture")}
                disabled={isPending}
              >
                Back
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  signMutation.mutate({
                    signatureRecordId: signatureRecord.id,
                    signatureImageBase64: signatureDataUrl,
                  })
                }
              >
                {signMutation.isPending ? (
                  <><Loader2 size={14} className="mr-1 animate-spin" /> Signing...</>
                ) : (
                  <><PenTool size={14} className="mr-1" /> Sign Document</>
                )}
              </Button>
            </div>
            {signMutation.error && (
              <p className="text-sm text-red-500">{signMutation.error.message}</p>
            )}
          </div>
        )}

        {/* Decline step */}
        {!done && step === "decline" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Are you sure you want to decline signing this document?
            </p>
            <div>
              <label className="block text-sm font-medium mb-1">
                Reason (optional)
              </label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-charcoal-600 rounded-md bg-white dark:bg-charcoal-900 text-sm"
                placeholder="Why are you declining?"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep("capture")}
                disabled={isPending}
              >
                Back
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  declineMutation.mutate({
                    signatureRecordId: signatureRecord.id,
                    reason: declineReason || undefined,
                  })
                }
              >
                {declineMutation.isPending ? (
                  <><Loader2 size={14} className="mr-1 animate-spin" /> Declining...</>
                ) : (
                  "Decline to Sign"
                )}
              </Button>
            </div>
            {declineMutation.error && (
              <p className="text-sm text-red-500">{declineMutation.error.message}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
