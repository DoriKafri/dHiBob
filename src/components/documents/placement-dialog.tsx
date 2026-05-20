"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PdfViewer } from "./pdf-viewer";
import { trpc } from "@/lib/trpc";
import { PenTool, Loader2, ChevronRight } from "lucide-react";
import type { SignaturePlacement } from "@/types/signature";

interface PlacementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentName: string;
  /** Pre-selected signer (e.g., from people page pen icon) — skips step 1 */
  presetSignerId?: string;
  onComplete: () => void;
}

export function PlacementDialog({
  open,
  onOpenChange,
  documentId,
  documentName,
  presetSignerId,
  onComplete,
}: PlacementDialogProps) {
  const [step, setStep] = useState<"signer" | "placement">(presetSignerId ? "placement" : "signer");
  const [signerId, setSignerId] = useState(presetSignerId || "");
  const [placements, setPlacements] = useState<SignaturePlacement[]>([]);

  const employees = trpc.employee.list.useQuery({ limit: 500 });
  const pdfUrl = trpc.document.getDocumentPdfUrl.useQuery(
    { documentId },
    { enabled: step === "placement" },
  );
  const requestMutation = trpc.signature.requestSignature.useMutation({
    onSuccess: () => {
      onComplete();
      handleClose(false);
    },
  });

  const handleClose = (o: boolean) => {
    if (!o) {
      setStep(presetSignerId ? "placement" : "signer");
      setSignerId(presetSignerId || "");
      setPlacements([]);
    }
    onOpenChange(o);
  };

  const handleAddPlacement = useCallback((p: SignaturePlacement) => {
    setPlacements((prev) => [...prev, p]);
  }, []);

  const handleRemovePlacement = useCallback((index: number) => {
    setPlacements((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSend = async () => {
    await requestMutation.mutateAsync({
      documentId,
      signerId,
      placements: placements.length > 0 ? JSON.stringify(placements) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenTool size={18} />
            Send for Signature — {documentName}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Select Signer */}
        {step === "signer" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Select Signer</label>
              <select
                value={signerId}
                onChange={(e) => setSignerId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-charcoal-600 rounded-md bg-white dark:bg-charcoal-900 text-sm"
              >
                <option value="">Choose an employee...</option>
                {(employees.data?.employees ?? []).map((emp: any) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} ({emp.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={!signerId}
                onClick={() => setStep("placement")}
                className="gap-1"
              >
                Next: Mark Signature Spots <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Mark Placements on PDF */}
        {step === "placement" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Click on the PDF to mark where the signature should go.
              You can place multiple signatures across different pages.
            </p>

            {pdfUrl.data?.url ? (
              <PdfViewer
                pdfUrl={pdfUrl.data.url}
                placements={placements}
                editable
                onPlacementAdd={handleAddPlacement}
                onPlacementRemove={handleRemovePlacement}
              />
            ) : pdfUrl.isLoading ? (
              <div className="flex items-center justify-center py-8 text-gray-500">
                <Loader2 size={20} className="animate-spin mr-2" />
                Loading document...
              </div>
            ) : (
              <p className="text-sm text-red-500">Could not load document PDF.</p>
            )}

            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm text-gray-500">
                {placements.length} placement{placements.length !== 1 ? "s" : ""} marked
              </span>
              <div className="flex gap-2">
                {!presetSignerId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep("signer")}
                  >
                    Back
                  </Button>
                )}
                <Button
                  type="button"
                  disabled={requestMutation.isPending}
                  onClick={handleSend}
                  className="gap-1"
                >
                  {requestMutation.isPending ? (
                    <><Loader2 size={14} className="animate-spin" /> Sending...</>
                  ) : (
                    <><PenTool size={14} /> Send for Signature</>
                  )}
                </Button>
              </div>
            </div>
            {requestMutation.error && (
              <p className="text-sm text-red-500">{requestMutation.error.message}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
