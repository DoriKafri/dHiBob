"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useEffect } from "react";

const formSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  jobTitle: z.string().min(1, "Job title is required"),
  departmentId: z.string().optional(),
  managerId: z.string().optional(),
  createMilestone: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  employee: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditEmployeeModal({ employee, open, onOpenChange }: Props) {
  const utils = trpc.useContext();
  const updateMutation = trpc.employee.update.useMutation();

  const workInfo = JSON.parse(employee?.workInfo || '{}');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: employee?.firstName || "",
      lastName: employee?.lastName || "",
      jobTitle: workInfo.jobTitle || "",
      departmentId: employee?.departmentId || "",
      managerId: employee?.managerId || "",
      createMilestone: true,
    },
  });

  useEffect(() => {
    if (employee) {
      const info = JSON.parse(employee.workInfo || '{}');
      reset({
        firstName: employee.firstName,
        lastName: employee.lastName,
        jobTitle: info.jobTitle || "",
        departmentId: employee.departmentId || "",
        managerId: employee.managerId || "",
        createMilestone: true,
      });
    }
  }, [employee, reset]);

  const onSubmit = async (values: FormValues) => {
    await updateMutation.mutateAsync({
      id: employee.id,
      firstName: values.firstName,
      lastName: values.lastName,
      jobTitle: values.jobTitle,
      department: values.departmentId,
      manager: values.managerId || undefined,
      createMilestone: values.createMilestone,
    });
    utils.employee.getById.invalidate({ id: employee.id });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-white dark:bg-charcoal-900 border-none shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Edit Employee Profile</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">First Name</label>
              <Input {...register("firstName")} className="bg-gray-50 dark:bg-charcoal-800 border-none" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Last Name</label>
              <Input {...register("lastName")} className="bg-gray-50 dark:bg-charcoal-800 border-none" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Job Title</label>
            <Input {...register("jobTitle")} className="bg-gray-50 dark:bg-charcoal-800 border-none" />
          </div>
          <div className="flex items-center gap-3 p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-100 dark:border-primary-800/30">
            <input 
              type="checkbox" 
              id="createMilestone" 
              {...register("createMilestone")}
              className="h-4 w-4 rounded border-primary-300 text-primary-600 focus:ring-primary-500"
            />
            <label htmlFor="createMilestone" className="text-sm font-semibold text-primary-900 dark:text-primary-100 cursor-pointer">
              Create a career milestone for these changes
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-6 border-t dark:border-charcoal-800">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="font-bold uppercase tracking-tight text-gray-400">Cancel</Button>
            <Button type="submit" disabled={updateMutation.isPending} className="bg-primary-500 hover:bg-primary-600 text-white font-bold uppercase tracking-tight px-8">
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
