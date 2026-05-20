"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserPlus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { EmployeeChecklistRow } from "@/components/onboarding/employee-checklist-row";

export default function OnboardingPage() {
  const [addOpen, setAddOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data: newHires, isLoading } = trpc.onboarding.listNewHires.useQuery();
  const { data: departments } = trpc.workforce.departments.useQuery();
  const addNewHire = trpc.onboarding.addNewHire.useMutation({
    onSuccess: () => { utils.onboarding.listNewHires.invalidate(); setAddOpen(false); },
  });

  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', departmentId: '', startDate: '' });

  // Separate pending hires and active employees
  const pendingHires = (newHires || []).filter((e: any) => e.status === 'PENDING_HIRE');
  const activeHires = (newHires || []).filter((e: any) => e.status === 'ACTIVE');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Onboarding</h1>
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <UserPlus size={16} /> New Hire
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && (
        <>
          {/* Pending Hires */}
          {pendingHires.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-300">Pending Hires</h2>
                <Badge variant="warning" className="text-[10px]">{pendingHires.length}</Badge>
                <span className="text-[10px] text-gray-400">Profile created when Contract task is completed</span>
              </div>
              {pendingHires.map((emp: any) => (
                <EmployeeChecklistRow
                  key={emp.id}
                  employee={emp}
                  mode="onboarding"
                  isDevOps={emp.department?.name?.toLowerCase().includes('engineering') ?? false}
                />
              ))}
            </div>
          )}

          {/* Active Employees being onboarded */}
          {activeHires.length > 0 && (
            <div className="space-y-3">
              {pendingHires.length > 0 && (
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-300">Active Employees</h2>
              )}
              {activeHires.map((emp: any) => (
                <EmployeeChecklistRow
                  key={emp.id}
                  employee={emp}
                  mode="onboarding"
                  isDevOps={emp.department?.name?.toLowerCase().includes('engineering') ?? false}
                />
              ))}
            </div>
          )}

          {pendingHires.length === 0 && activeHires.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-300">
              <p>No employees currently being onboarded.</p>
              <p className="text-sm mt-1">Click &quot;New Hire&quot; to start onboarding someone.</p>
            </div>
          )}
        </>
      )}

      {/* New Hire Modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Hire</DialogTitle>
          </DialogHeader>
          <form onSubmit={e => {
            e.preventDefault();
            addNewHire.mutate({
              firstName: form.firstName,
              lastName: form.lastName,
              email: form.email,
              departmentId: form.departmentId || undefined,
              startDate: new Date(form.startDate),
            });
            setForm({ firstName: '', lastName: '', email: '', departmentId: '', startDate: '' });
          }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">First Name</label>
                <Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Last Name</label>
                <Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Department</label>
              <select
                value={form.departmentId}
                onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 text-gray-900 dark:text-white"
              >
                <option value="">Select department...</option>
                {(departments || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} required />
            </div>
            <p className="text-xs text-gray-400">
              The new hire will appear in onboarding with a checklist. Their employee profile will be created automatically when the &quot;Contract&quot; task is marked as Done.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addNewHire.isLoading}>
                {addNewHire.isLoading ? "Adding..." : "Add New Hire"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
