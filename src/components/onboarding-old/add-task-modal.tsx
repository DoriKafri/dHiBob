"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  dueDate: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  employeeId: string;
  employeeName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddTaskModal({ employeeId, employeeName, open, onOpenChange }: Props) {
  const utils = trpc.useContext();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  const createTaskMutation = trpc.onboarding.createTask.useMutation();

  const onSubmit = async (values: FormValues) => {
    await createTaskMutation.mutateAsync({
      employeeId,
      title: values.title,
      description: values.description,
      assigneeType: 'HR', // Simplified for MVP
      dueDate: values.dueDate ? new Date(values.dueDate) : undefined,
    });
    utils.onboarding.listNewHires.invalidate();
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Task for {employeeName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-1">Task Title</label>
            <Input id="title" {...register("title")} placeholder="e.g., Collect passport copy" />
            {errors.title && <p className="text-xs text-red-600 mt-1">{errors.title.message}</p>}
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium mb-1">Description</label>
            <Input id="description" {...register("description")} placeholder="Optional details..." />
          </div>
          <div>
            <label htmlFor="dueDate" className="block text-sm font-medium mb-1">Due Date</label>
            <Input id="dueDate" type="date" {...register("dueDate")} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createTaskMutation.isLoading}>
              {createTaskMutation.isLoading ? "Adding..." : "Add Task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
