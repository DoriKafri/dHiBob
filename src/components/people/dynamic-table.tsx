"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { DynamicEntryModal } from "./dynamic-entry-modal";
import { trpc } from "@/lib/trpc";

interface DynamicTableProps {
  tableDefinition: {
    id: string;
    name: string;
    description: string | null;
    columns: string; // JSON string
  };
  employeeId: string;
}

export function DynamicTable({ tableDefinition, employeeId }: DynamicTableProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<any>(null);

  const columns = JSON.parse(tableDefinition.columns) as Array<{ name: string; type: string }>;
  const { data: rows, refetch } = trpc.custom.getRows.useQuery({
    employeeId,
    tableId: tableDefinition.id,
  });

  const deleteMutation = trpc.custom.deleteRow.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const handleEdit = (row: any) => {
    setEditingRow(row);
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setEditingRow(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this row?")) {
      await deleteMutation.mutateAsync({ id });
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-xl font-bold">{tableDefinition.name}</CardTitle>
          {tableDefinition.description && (
            <p className="text-sm text-muted-foreground mt-1">
              {tableDefinition.description}
            </p>
          )}
        </div>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Row
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                {columns.map((col) => (
                  <th key={col.name} className="h-10 px-4 text-left font-medium text-muted-foreground whitespace-nowrap">
                    {col.name}
                  </th>
                ))}
                <th className="h-10 px-4 text-right font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {!rows || rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="h-24 text-center text-muted-foreground italic"
                  >
                    No data available in this table.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const rowData = JSON.parse(row.data);
                  return (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      {columns.map((col) => (
                        <td key={col.name} className="p-4 align-middle">
                          {rowData[col.name]?.toString() || "-"}
                        </td>
                      ))}
                      <td className="p-4 align-middle text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(row)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(row.id)}
                            disabled={deleteMutation.isLoading}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>

      <DynamicEntryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        tableDefinition={tableDefinition}
        employeeId={employeeId}
        existingData={editingRow}
        onSuccess={refetch}
      />
    </Card>
  );
}
