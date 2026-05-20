"use client";
import { useSession } from "next-auth/react";
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

const formSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email required"),
  department: z.string().min(1, "Department is required"),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT"]),
  startDate: z.string().min(1, "Start date is required"),
});

type FormValues = z.infer<typeof formSchema>;

const DEPARTMENTS = [
  "Engineering", "Product", "Design", "Marketing",
  "Sales", "HR", "Finance", "Operations", "Executive",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddEmployeeModal({ open, onOpenChange }: Props) {
  const { data: session } = useSession();
  const utils = trpc.useContext();

  const today = typeof window !== 'undefined'
    ? new Date().toISOString().split('T')[0]
    : '';

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      employmentType: "FULL_TIME",
      department: "Engineering",
      startDate: today,
    },
  });

  const createMutation = trpc.employee.create.useMutation();

  const onSubmit = async (values: FormValues) => {
    if (!session?.user.companyId) return;
    await createMutation.mutateAsync({
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      department: values.department,
      jobTitle: values.department, // jobTitle is required by schema; mirrors department for now
      startDate: new Date(values.startDate),
      employmentType: values.employmentType,
      companyId: session.user.companyId,
    });
    utils.employee.list.invalidate();
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Employee</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium mb-1">First Name</label>
            <Input id="firstName" {...register("firstName")} />
            {errors.firstName && <p className="text-xs text-red-600 mt-1">{errors.firstName.message}</p>}
          </div>
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium mb-1">Last Name</label>
            <Input id="lastName" {...register("lastName")} />
            {errors.lastName && <p className="text-xs text-red-600 mt-1">{errors.lastName.message}</p>}
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
            <Input id="email" type="email" {...register("email")} />
            {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Department</label>
            <Select onValueChange={v => setValue("department", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.department && <p className="text-xs text-red-600 mt-1">{errors.department.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Employment Type</label>
            <Select
              defaultValue="FULL_TIME"
              onValueChange={v => setValue("employmentType", v as any)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FULL_TIME">Full Time</SelectItem>
                <SelectItem value="PART_TIME">Part Time</SelectItem>
                <SelectItem value="CONTRACT">Contract</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium mb-1">Start Date</label>
            <Input id="startDate" type="date" {...register("startDate")} />
            {errors.startDate && <p className="text-xs text-red-600 mt-1">{errors.startDate.message}</p>}
          </div>
          {createMutation.error && (
            <p className="text-sm text-red-600">{createMutation.error.message}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isLoading}>
              {createMutation.isLoading ? "Adding..." : "Add Employee"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
