"use client";

import { trpc } from "@/lib/trpc";
import { EmployeeChecklistRow } from "@/components/onboarding/employee-checklist-row";

export default function OffboardingPage() {
  const { data: offboarding, isLoading } = trpc.onboarding.listOffboarding.useQuery();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Offboarding</h1>
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
          {!offboarding || offboarding.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-300">
              <p>No employees being offboarded.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {offboarding.map(emp => (
                <EmployeeChecklistRow
                  key={emp.id}
                  employee={emp as any}
                  mode="offboarding"
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
