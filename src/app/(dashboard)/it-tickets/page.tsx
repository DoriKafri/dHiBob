"use client";
import React, { useState } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, MessageSquare, Send, ArrowLeft, Ticket, Search } from "lucide-react";
import { format } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "default"> = {
  OPEN: "warning",
  IN_PROGRESS: "default",
  RESOLVED: "success",
  CLOSED: "destructive",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "text-gray-500",
  MEDIUM: "text-blue-500",
  HIGH: "text-amber-500",
  URGENT: "text-red-500",
};

const CATEGORIES = ['General', 'Hardware', 'Software', 'Access', 'Network', 'Other'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

export default function ITTicketsPage() {
  const { data: session } = useSession();
  const isItOrAdmin = ['SUPER_ADMIN', 'ADMIN', 'IT'].includes(session?.user?.role || '');
  const utils = trpc.useContext();

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [newComment, setNewComment] = useState("");

  const { data: tickets, isLoading } = trpc.tickets.list.useQuery({
    status: (statusFilter || undefined) as any,
    category: categoryFilter || undefined,
  });
  const { data: stats } = trpc.tickets.stats.useQuery();
  const { data: selectedTicket, isLoading: ticketLoading } = trpc.tickets.getById.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId }
  );

  const createMutation = trpc.tickets.create.useMutation({
    onSuccess: () => { utils.tickets.invalidate(); setCreateOpen(false); },
  });
  const updateMutation = trpc.tickets.update.useMutation({
    onSuccess: () => utils.tickets.invalidate(),
  });
  const commentMutation = trpc.tickets.addComment.useMutation({
    onSuccess: () => { utils.tickets.getById.invalidate({ id: selectedId! }); setNewComment(""); },
  });
  const deleteMutation = trpc.tickets.delete.useMutation({
    onSuccess: () => { utils.tickets.invalidate(); setSelectedId(null); },
  });

  // Detail view
  if (selectedId) {
    return (
      <div className="space-y-4">
        <button onClick={() => setSelectedId(null)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
          <ArrowLeft size={16} /> Back to tickets
        </button>

        {ticketLoading || !selectedTicket ? (
          <div className="animate-pulse h-32 bg-gray-100 dark:bg-charcoal-800 rounded-lg" />
        ) : (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold">{selectedTicket.title}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-300 mt-1">
                      Opened by {selectedTicket.creator.firstName} {selectedTicket.creator.lastName}
                      {selectedTicket.creator.department?.name && ` · ${selectedTicket.creator.department.name}`}
                      {" · "}{format(new Date(selectedTicket.createdAt), "MMM d, yyyy 'at' HH:mm")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[selectedTicket.status]}>{selectedTicket.status.replace('_', ' ')}</Badge>
                    <span className={`text-xs font-medium ${PRIORITY_COLORS[selectedTicket.priority]}`}>{selectedTicket.priority}</span>
                    <Badge variant="outline">{selectedTicket.category}</Badge>
                  </div>
                </div>
                {selectedTicket.description && (
                  <p className="mt-4 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{selectedTicket.description}</p>
                )}

                {/* Status/priority controls (IT/Admin only) */}
                {isItOrAdmin && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-charcoal-700 flex items-center gap-3 flex-wrap">
                    <select
                      value={selectedTicket.status}
                      onChange={e => updateMutation.mutate({ id: selectedTicket.id, status: e.target.value as any })}
                      className="text-xs border rounded px-2 py-1 bg-white dark:bg-charcoal-800 dark:border-charcoal-600"
                    >
                      {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select>
                    <select
                      value={selectedTicket.priority}
                      onChange={e => updateMutation.mutate({ id: selectedTicket.id, priority: e.target.value as any })}
                      className="text-xs border rounded px-2 py-1 bg-white dark:bg-charcoal-800 dark:border-charcoal-600"
                    >
                      {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <Button size="sm" variant="outline" className="text-xs text-red-500" onClick={() => {
                      if (confirm('Delete this ticket?')) deleteMutation.mutate({ id: selectedTicket.id });
                    }}>Delete</Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Comments */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-1.5">
                  <MessageSquare size={16} /> Comments ({selectedTicket.comments.length})
                </h3>
                <div className="space-y-4">
                  {selectedTicket.comments.map((c: any) => (
                    <div key={c.id} className="flex gap-3">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="text-xs">{c.author.firstName?.[0]}{c.author.lastName?.[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">{c.author.firstName} {c.author.lastName}</span>
                          <span className="text-gray-400 ml-2 text-xs">{format(new Date(c.createdAt), "MMM d 'at' HH:mm")}</span>
                        </p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5 whitespace-pre-line">{c.content}</p>
                      </div>
                    </div>
                  ))}
                  {selectedTicket.comments.length === 0 && (
                    <p className="text-sm text-gray-400 dark:text-gray-500">No comments yet.</p>
                  )}
                </div>

                {/* Add comment */}
                <form
                  onSubmit={e => { e.preventDefault(); if (newComment.trim()) commentMutation.mutate({ ticketId: selectedTicket.id, content: newComment.trim() }); }}
                  className="mt-4 pt-4 border-t border-gray-100 dark:border-charcoal-700 flex gap-2"
                >
                  <Input
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder="Write a comment..."
                    className="flex-1"
                  />
                  <Button type="submit" size="sm" disabled={!newComment.trim() || commentMutation.isPending} className="gap-1">
                    <Send size={14} /> Send
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">IT Tickets</h1>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus size={16} /> New Ticket
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Open", value: stats.open, color: "text-amber-500" },
            { label: "In Progress", value: stats.inProgress, color: "text-blue-500" },
            { label: "Resolved", value: stats.resolved, color: "text-emerald-500" },
            { label: "Total", value: stats.total, color: "text-gray-600" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-4 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-300 mt-1">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tickets..."
            className="pl-9 w-56"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 dark:border-charcoal-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800"
        >
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="border border-gray-200 dark:border-charcoal-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Ticket list */}
      {(() => {
        const q = search.toLowerCase().trim();
        const filtered = q
          ? (tickets ?? []).filter((t: any) =>
              t.title.toLowerCase().includes(q) ||
              (t.description || '').toLowerCase().includes(q) ||
              `${t.creator?.firstName} ${t.creator?.lastName}`.toLowerCase().includes(q)
            )
          : tickets ?? [];

        return isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 dark:bg-charcoal-800 rounded-lg animate-pulse" />)}</div>
      ) : !filtered.length ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-300">
          <Ticket size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No tickets{search || statusFilter || categoryFilter ? ' match your filters' : ' yet'}.</p>
          <p className="text-sm mb-4">{isItOrAdmin ? 'Waiting for employees to submit tickets.' : 'Submit your first ticket to get IT support.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((ticket: any) => (
            <Card key={ticket.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedId(ticket.id)}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-1.5 h-10 rounded-full ${ticket.status === 'OPEN' ? 'bg-amber-400' : ticket.status === 'IN_PROGRESS' ? 'bg-blue-400' : ticket.status === 'RESOLVED' ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{ticket.title}</p>
                      <Badge variant={STATUS_VARIANT[ticket.status]} className="text-[10px]">{ticket.status.replace('_', ' ')}</Badge>
                      <span className={`text-[10px] font-medium ${PRIORITY_COLORS[ticket.priority]}`}>{ticket.priority}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-300 mt-0.5">
                      {ticket.creator.firstName} {ticket.creator.lastName}
                      {ticket.creator.department?.name && ` · ${ticket.creator.department.name}`}
                      {" · "}{format(new Date(ticket.createdAt), "MMM d")}
                      {ticket._count.comments > 0 && (
                        <span className="ml-2 inline-flex items-center gap-0.5"><MessageSquare size={10} /> {ticket._count.comments}</span>
                      )}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">{ticket.category}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      );
      })()}

      {/* Create ticket dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New IT Ticket</DialogTitle></DialogHeader>
          <form onSubmit={e => {
            e.preventDefault();
            const fd = new FormData(e.target as HTMLFormElement);
            createMutation.mutate({
              title: fd.get('title') as string,
              description: (fd.get('description') as string) || undefined,
              category: (fd.get('category') as string) as any,
              priority: (fd.get('priority') as string) as any,
            });
          }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title <span className="text-red-500">*</span></label>
              <Input name="title" required placeholder="e.g. Can't connect to VPN" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                name="description"
                rows={3}
                placeholder="Describe the issue in detail..."
                className="w-full border border-gray-200 dark:border-charcoal-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <select name="category" defaultValue="General"
                  className="w-full border border-gray-200 dark:border-charcoal-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Priority</label>
                <select name="priority" defaultValue="MEDIUM"
                  className="w-full border border-gray-200 dark:border-charcoal-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800">
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Ticket"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
