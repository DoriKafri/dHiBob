"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

const milestoneSchema = z.object({
  type: z.enum(['PROMOTION', 'DEPT_CHANGE', 'MANAGER_CHANGE', 'NOTE']),
  effectiveDate: z.string().min(1, "Date is required"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
});

type MilestoneValues = z.infer<typeof milestoneSchema>;

interface Props {
  employeeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddMilestoneModal({ employeeId, open, onOpenChange }: Props) {
  const utils = trpc.useContext();
  const createMutation = trpc.employee.createJobRecord.useMutation();

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<MilestoneValues>({
    resolver: zodResolver(milestoneSchema),
    defaultValues: {
      type: 'NOTE',
      effectiveDate: new Date().toISOString().split('T')[0],
      title: "",
      description: "",
    },
  });

  const onSubmit = async (values: MilestoneValues) => {
    await createMutation.mutateAsync({
      employeeId,
      type: values.type,
      effectiveDate: new Date(values.effectiveDate),
      title: values.title,
      description: values.description,
    });
    utils.employee.getTimeline.invalidate({ id: employeeId });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white dark:bg-charcoal-900 border-none">
        <DialogHeader>
          <DialogTitle>Add Career Milestone</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Event Type</label>
            <Select defaultValue="NOTE" onValueChange={v => setValue("type", v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PROMOTION">Promotion</SelectItem>
                <SelectItem value="DEPT_CHANGE">Department Change</SelectItem>
                <SelectItem value="MANAGER_CHANGE">Manager Change</SelectItem>
                <SelectItem value="NOTE">General Note / Award</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Date</label>
            <Input type="date" {...register("effectiveDate")} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <Input placeholder="e.g. Completed Leadership Training" {...register("title")} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description (Optional)</label>
            <Input placeholder="Add more details..." {...register("description")} />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t dark:border-charcoal-800">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Adding..." : "Add to Timeline"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
