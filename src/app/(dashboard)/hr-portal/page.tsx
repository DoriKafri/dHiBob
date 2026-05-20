"use client";

import React, { useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Plus, Link2, Megaphone, FileText, Pin, Trash2, Pencil, ExternalLink, Download } from "lucide-react";

type ItemType = 'LINK' | 'ANNOUNCEMENT' | 'FILE';

const TYPE_ICONS: Record<ItemType, typeof Link2> = {
  LINK: Link2,
  ANNOUNCEMENT: Megaphone,
  FILE: FileText,
};

const TYPE_COLORS: Record<ItemType, string> = {
  LINK: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  ANNOUNCEMENT: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  FILE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
};

const DEFAULT_SECTIONS = ['Company Policies', 'Benefits', 'Tools & Access', 'Announcements'];

export default function HrPortalPage() {
  const { data: session } = useSession();
  const isHr = session?.user.role === 'SUPER_ADMIN' || session?.user.role === 'ADMIN' || session?.user.role === 'HR';
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  const utils = trpc.useUtils();
  const { data: sections, isLoading } = trpc.hrPortal.list.useQuery();
  const createMutation = trpc.hrPortal.create.useMutation({ onSuccess: () => { utils.hrPortal.list.invalidate(); setAddOpen(false); } });
  const updateMutation = trpc.hrPortal.update.useMutation({ onSuccess: () => { utils.hrPortal.list.invalidate(); setEditItem(null); } });
  const deleteMutation = trpc.hrPortal.delete.useMutation({ onSuccess: () => utils.hrPortal.list.invalidate() });

  const [form, setForm] = useState({
    type: 'LINK' as ItemType,
    section: 'General',
    title: '',
    content: '',
    url: '',
    fileName: '',
    fileData: '',
    pinned: false,
  });

  function resetForm() {
    setForm({ type: 'LINK', section: 'General', title: '', content: '', url: '', fileName: '', fileData: '', pinned: false });
  }

  function openAdd() { resetForm(); setAddOpen(true); }

  function openEdit(item: any) {
    setForm({
      type: item.type,
      section: item.section,
      title: item.title,
      content: item.content || '',
      url: item.url || '',
      fileName: item.fileName || '',
      fileData: '',
      pinned: item.pinned,
    });
    setEditItem(item);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setForm(f => ({ ...f, fileName: file.name }));
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, fileData: reader.result as string }));
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (!form.title.trim()) return;
    if (editItem) {
      await updateMutation.mutateAsync({
        id: editItem.id,
        type: form.type,
        section: form.section,
        title: form.title,
        content: form.content || undefined,
        url: form.url || undefined,
        fileName: form.fileName || undefined,
        fileData: form.fileData || undefined,
        pinned: form.pinned,
      });
    } else {
      await createMutation.mutateAsync({
        type: form.type,
        section: form.section,
        title: form.title,
        content: form.content || undefined,
        url: form.url || undefined,
        fileName: form.fileName || undefined,
        fileData: form.fileData || undefined,
        pinned: form.pinned,
      });
    }
    resetForm();
  }

  const isFormOpen = addOpen || !!editItem;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">HR Portal</h1>
        {isHr && (
          <Button onClick={openAdd} className="gap-2">
            <Plus size={16} /> Add Item
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && (!sections || sections.length === 0) && (
        <div className="text-center py-16 text-gray-500 dark:text-gray-300">
          <Megaphone size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No items in the HR Portal yet.</p>
          {isHr && <p className="text-sm mt-1">Click &quot;Add Item&quot; to start adding links, announcements, and documents.</p>}
        </div>
      )}

      {!isLoading && sections && sections.map(({ section, items }: any) => (
        <div key={section}>
          <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">{section}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item: any) => {
              const Icon = TYPE_ICONS[item.type as ItemType] || Link2;
              return (
                <Card key={item.id} className="relative group">
                  {item.pinned && (
                    <Pin size={14} className="absolute top-3 right-3 text-amber-500" />
                  )}
                  <CardHeader className="pb-2">
                    <div className="flex items-start gap-3">
                      <span className={`p-2 rounded-lg ${TYPE_COLORS[item.type as ItemType]}`}>
                        <Icon size={18} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm font-semibold leading-tight">
                          {item.type === 'LINK' && item.url ? (
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary-500 flex items-center gap-1">
                              {item.title} <ExternalLink size={12} className="shrink-0 opacity-50" />
                            </a>
                          ) : (
                            item.title
                          )}
                        </CardTitle>
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-medium ${TYPE_COLORS[item.type as ItemType]}`}>
                          {item.type}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {item.content && (
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{item.content}</p>
                    )}
                    {item.type === 'FILE' && item.fileUrl && (
                      <a
                        href={item.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={item.fileName || 'file'}
                        className="inline-flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600"
                      >
                        <Download size={14} /> {item.fileName || 'Download'}
                      </a>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-gray-400">
                        {item.author ? `${item.author.firstName} ${item.author.lastName}` : ''} · {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      {isHr && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(item)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Edit">
                            <Pencil size={14} className="text-gray-500 dark:text-gray-300" />
                          </button>
                          <button onClick={() => { if (confirm('Delete this item?')) deleteMutation.mutate({ id: item.id }); }} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Delete">
                            <Trash2 size={14} className="text-red-500" />
                          </button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {/* Add/Edit Modal */}
      <Dialog open={isFormOpen} onOpenChange={open => { if (!open) { setAddOpen(false); setEditItem(null); resetForm(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Edit Item' : 'Add to HR Portal'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <div className="flex gap-2">
                {(['LINK', 'ANNOUNCEMENT', 'FILE'] as ItemType[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, type: t }))}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                      form.type === t
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    {React.createElement(TYPE_ICONS[t], { size: 14 })}
                    {t === 'LINK' ? 'Link' : t === 'ANNOUNCEMENT' ? 'Update' : 'File'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Section</label>
              <select
                value={form.section}
                onChange={e => setForm(f => ({ ...f, section: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 text-gray-900 dark:text-white"
              >
                {DEFAULT_SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                <option value="General">General</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g., Employee Handbook" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Optional description or announcement text..."
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 text-gray-900 dark:text-white min-h-[80px]"
              />
            </div>
            {form.type === 'LINK' && (
              <div>
                <label className="block text-sm font-medium mb-1">URL</label>
                <Input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." />
              </div>
            )}
            {form.type === 'FILE' && (
              <div>
                <label className="block text-sm font-medium mb-1">File</label>
                <input type="file" onChange={handleFileChange} className="text-sm" />
                {form.fileName && <p className="text-xs text-gray-500 dark:text-gray-300 mt-1">{form.fileName}</p>}
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.pinned} onChange={e => setForm(f => ({ ...f, pinned: e.target.checked }))} className="rounded" />
              <span className="text-sm">Pin to top of section</span>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setAddOpen(false); setEditItem(null); resetForm(); }}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isLoading || updateMutation.isLoading || !form.title.trim()}>
                {editItem ? 'Save' : 'Add'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
