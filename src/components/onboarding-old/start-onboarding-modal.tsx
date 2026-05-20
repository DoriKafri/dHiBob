"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useState } from "react";

interface Props {
  employeeId: string;
  employeeName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StartOnboardingModal({ employeeId, employeeName, open, onOpenChange }: Props) {
  const [templateId, setTemplateId] = useState<string>("");
  const utils = trpc.useContext();
  const { data: templates } = trpc.onboarding.listTemplates.useQuery();
  const startMutation = trpc.onboarding.start.useMutation();

  const handleStart = async () => {
    if (!templateId) return;
    await startMutation.mutateAsync({ employeeId, templateId });
    utils.onboarding.listNewHires.invalidate();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Start Onboarding for {employeeName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Select a template to generate a checklist of tasks for this employee.</p>
          <Select onValueChange={setTemplateId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a template" />
            </SelectTrigger>
            <SelectContent>
              {templates?.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleStart} disabled={!templateId || startMutation.isLoading}>
              {startMutation.isLoading ? "Starting..." : "Start Onboarding"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
