"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

interface ColumnDefinition {
  name: string;
  type: 'STRING' | 'NUMBER' | 'DATE' | 'SELECT';
  options?: string[];
}

interface DynamicEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableDefinition: {
    id: string;
    name: string;
    columns: string; // JSON string
  };
  employeeId: string;
  existingData?: {
    id: string;
    data: string; // JSON string
  };
  onSuccess: () => void;
}

export function DynamicEntryModal({
  isOpen,
  onClose,
  tableDefinition,
  employeeId,
  existingData,
  onSuccess,
}: DynamicEntryModalProps) {
  const columns = JSON.parse(tableDefinition.columns) as ColumnDefinition[];
  const parsedExistingData = existingData ? JSON.parse(existingData.data) : {};

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dynamically build schema
  const schemaObject: any = {};
  columns.forEach((col) => {
    if (col.type === 'NUMBER') {
      schemaObject[col.name] = z.coerce.number();
    } else {
      schemaObject[col.name] = z.string().min(1, `${col.name} is required`);
    }
  });
  const schema = z.object(schemaObject);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: parsedExistingData,
  });

  useEffect(() => {
    if (isOpen) {
      reset(parsedExistingData);
    }
  }, [isOpen, reset, existingData]);

  const upsertMutation = trpc.custom.upsertRow.useMutation({
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  const onSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      await upsertMutation.mutateAsync({
        id: existingData?.id,
        employeeId,
        tableId: tableDefinition.id,
        data,
      });
    } catch (error) {
      console.error("Failed to upsert row:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {existingData ? "Edit" : "Add"} {tableDefinition.name} Entry
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
          {columns.map((col) => (
            <div key={col.name} className="space-y-1">
              <label htmlFor={col.name} className="text-sm font-medium block">
                {col.name}
              </label>
              {col.type === 'SELECT' ? (
                <Select
                  defaultValue={parsedExistingData[col.name]}
                  onValueChange={(value) => setValue(col.name, value)}
                >
                  <SelectTrigger id={col.name}>
                    <SelectValue placeholder={`Select ${col.name}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {col.options?.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : col.type === 'DATE' ? (
                <Input
                  id={col.name}
                  type="date"
                  {...register(col.name)}
                />
              ) : (
                <Input
                  id={col.name}
                  type={col.type === 'NUMBER' ? 'number' : 'text'}
                  {...register(col.name)}
                />
              )}
              {errors[col.name] && (
                <p className="text-xs text-red-500">
                  {errors[col.name]?.message as string}
                </p>
              )}
            </div>
          ))}
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {existingData ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
