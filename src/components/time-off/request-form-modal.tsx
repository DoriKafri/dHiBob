"use client";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { differenceInCalendarDays } from "date-fns";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const formSchema = z.object({
  policyId: z.string().min(1, "Please select a leave type"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  reason: z.string().optional(),
}).refine(
  (data) => new Date(data.endDate) >= new Date(data.startDate),
  { message: "End date must not be before start date", path: ["endDate"] }
);

type FormValues = z.infer<typeof formSchema>;

interface Props {
  employeeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function RequestFormModal({ employeeId, open, onOpenChange }: Props) {
  const { data: policies = [], isLoading: policiesLoading } = trpc.timeoff.listPolicies.useQuery();
  const { data: balances = [] } = trpc.timeoff.getPolicyBalances.useQuery({ employeeId });
  const utils = trpc.useContext();

  const { register, handleSubmit, setValue, formState: { errors }, reset, control } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  const formValues = useWatch({ control });
  const selectedPolicyBalance = balances.find((b) => b.policyId === formValues.policyId);

  const requestedDays = (formValues.startDate && formValues.endDate)
    ? differenceInCalendarDays(new Date(formValues.endDate), new Date(formValues.startDate)) + 1
    : 0;

  const isOverBalance = selectedPolicyBalance && requestedDays > selectedPolicyBalance.available;

  const submitMutation = trpc.timeoff.submitRequest.useMutation({
    onSuccess: () => {
      utils.timeoff.listRequests.invalidate();
      reset();
      onOpenChange(false);
    },
  });

  const onSubmit = (values: FormValues) => {
    submitMutation.mutate({
      employeeId,
      policyId: values.policyId,
      startDate: new Date(values.startDate),
      endDate: new Date(values.endDate),
      reason: values.reason,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Time Off</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} role="form" className="space-y-4 mt-2">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium">Leave Type</label>
              {selectedPolicyBalance && (
                <span className="text-xs font-medium text-emerald-500">
                  Available: {selectedPolicyBalance.available.toFixed(1)} days
                </span>
              )}
            </div>
            {policiesLoading ? (
              <p className="text-sm text-gray-400">Loading policies...</p>
            ) : (
              <Select onValueChange={(v) => setValue("policyId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select leave type" />
                </SelectTrigger>
                <SelectContent>
                  {policies.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {errors.policyId && (
              <p className="text-sm text-red-500 mt-1">{errors.policyId.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="startDate" className="block text-sm font-medium mb-1">Start Date</label>
            <Input id="startDate" type="date" {...register("startDate")} />
            {errors.startDate && (
              <p className="text-sm text-red-500 mt-1">{errors.startDate.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="endDate" className="block text-sm font-medium mb-1">End Date</label>
            <Input id="endDate" type="date" {...register("endDate")} />
            {errors.endDate && (
              <p className="text-sm text-red-500 mt-1">{errors.endDate.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="reason" className="block text-sm font-medium mb-1">
              Reason <span className="text-gray-400">(optional)</span>
            </label>
            <Input id="reason" {...register("reason")} placeholder="e.g. Family vacation" />
          </div>

          {isOverBalance && (
            <p className="text-sm text-amber-500 font-medium">
              This will result in a negative balance.
            </p>
          )}

          {submitMutation.error && (
            <p className="text-sm text-red-500">{submitMutation.error.message}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitMutation.isPending}>
              {submitMutation.isPending ? "Submitting…" : "Submit Request"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
