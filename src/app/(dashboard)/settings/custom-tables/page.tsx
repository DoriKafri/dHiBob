"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Database, Code, Save, RotateCcw } from "lucide-react";

const COLUMNS_TEMPLATE = `[
  {"name": "Model", "type": "STRING"},
  {"name": "Serial", "type": "STRING"},
  {"name": "Issued", "type": "DATE"}
]`;

const PERMISSIONS_TEMPLATE = `{
  "employeeView": true,
  "managerEdit": false
}`;

export default function CustomTablesSettingsPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [columns, setColumns] = useState(COLUMNS_TEMPLATE);
  const [permissions, setPermissions] = useState(PERMISSIONS_TEMPLATE);
  const [isCreating, setIsCreating] = useState(false);

  const utils = trpc.useUtils();
  const { data: definitions, isLoading } = trpc.custom.getDefinitions.useQuery();
  
  const createMutation = trpc.custom.createDefinition.useMutation({
    onSuccess: () => {
      window.alert("Custom table definition created");
      setName("");
      setDescription("");
      setColumns(COLUMNS_TEMPLATE);
      setPermissions(PERMISSIONS_TEMPLATE);
      setIsCreating(false);
      utils.custom.getDefinitions.invalidate();
    },
    onError: (error) => {
      window.alert(error.message || "Failed to create definition");
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      name,
      description,
      columns,
      permissions,
    });
  };

  const applyTemplate = () => {
    setColumns(COLUMNS_TEMPLATE);
    setPermissions(PERMISSIONS_TEMPLATE);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Custom Tables</h1>
          <p className="text-gray-500 dark:text-gray-400">Manage custom data tables for employee profiles.</p>
        </div>
        {!isCreating && (
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Table
          </Button>
        )}
      </div>

      {isCreating && (
        <Card className="border-cherry/20 dark:border-cherry/10">
          <CardHeader>
            <CardTitle>Create New Custom Table</CardTitle>
            <CardDescription>Define the schema and permissions for a new custom table.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Table Name</label>
                  <Input 
                    placeholder="e.g., Equipment, Certifications" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description (Optional)</label>
                  <Input 
                    placeholder="Briefly describe what this table tracks" 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium flex items-center">
                      <Code className="w-4 h-4 mr-2" />
                      Columns (JSON)
                    </label>
                    <Button type="button" variant="ghost" size="sm" onClick={applyTemplate} className="text-xs">
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Reset to Template
                    </Button>
                  </div>
                  <Textarea 
                    className="font-mono text-sm h-48"
                    value={columns}
                    onChange={(e) => setColumns(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center">
                    <Save className="w-4 h-4 mr-2" />
                    Permissions (JSON)
                  </label>
                  <Textarea 
                    className="font-mono text-sm h-48"
                    value={permissions}
                    onChange={(e) => setPermissions(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsCreating(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Table Definition"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Database className="w-5 h-5 mr-2" />
            Active Definitions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8 text-gray-400 italic">Loading definitions...</div>
          ) : !definitions || definitions.length === 0 ? (
            <div className="text-center p-12 border-2 border-dashed rounded-xl border-gray-100 dark:border-charcoal-700">
              <Database className="w-12 h-12 mx-auto text-gray-300 dark:text-charcoal-600 mb-4" />
              <p className="text-gray-500">No custom tables defined yet.</p>
              <Button variant="link" onClick={() => setIsCreating(true)} className="mt-2 text-cherry">
                Create your first custom table
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Columns</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {definitions.map((def) => {
                  const cols = JSON.parse(def.columns).length;
                  const perms = JSON.parse(def.permissions);
                  return (
                    <TableRow key={def.id}>
                      <TableCell className="font-medium">
                        <div>{def.name}</div>
                        <div className="text-xs text-gray-500 font-normal">{def.description}</div>
                      </TableCell>
                      <TableCell>{cols} columns</TableCell>
                      <TableCell>
                        <div className="text-xs space-x-2">
                          {perms.employeeView && <span className="px-1.5 py-0.5 bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400 rounded">View</span>}
                          {perms.managerEdit && <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 rounded">Edit</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-500 text-sm">
                        {new Date(def.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
