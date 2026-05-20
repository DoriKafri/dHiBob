"use client";

import { trpc } from "@/lib/trpc";
import { DynamicTable } from "./dynamic-table";
import { Loader2, Database } from "lucide-react";

interface DynamicDataSectionProps {
  employeeId: string;
}

export function DynamicDataSection({ employeeId }: DynamicDataSectionProps) {
  const { data: definitions, isLoading } = trpc.custom.getDefinitions.useQuery();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Loading custom data tables...</p>
      </div>
    );
  }

  if (!definitions || definitions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed rounded-xl bg-muted/20">
        <Database className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-semibold text-muted-foreground">
          No additional data tables defined
        </h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm mt-2">
          Custom data tables allow you to store flexible information. 
          Admins can create new tables in the Settings section.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col space-y-1 pb-4">
        <h2 className="text-2xl font-bold tracking-tight">Additional Data</h2>
        <p className="text-muted-foreground">
          View and manage custom information for this employee.
        </p>
      </div>
      <div className="grid gap-8">
        {definitions.map((def) => (
          <DynamicTable key={def.id} tableDefinition={def} employeeId={employeeId} />
        ))}
      </div>
    </div>
  );
}
