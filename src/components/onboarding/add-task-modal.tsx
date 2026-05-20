"use client";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Plus, Trash2, Pencil } from "lucide-react";

type TaskPreset = { title: string; section: string };

// Default onboarding task presets
const DEFAULT_ONBOARDING_TASKS: TaskPreset[] = [
  { title: 'Approving recruitment', section: 'Pre-boarding' },
  { title: 'Notifying Candidate & HR', section: 'Pre-boarding' },
  { title: 'Contact Candidate for onboarding', section: 'Pre-boarding' },
  { title: 'Is computer needed?', section: 'Pre-boarding' },
  { title: 'Sending work start invite (on-site / remote)', section: 'Pre-boarding' },
  { title: 'Scheduling a Welcome meeting with TL', section: 'Upcoming meetings' },
  { title: 'Scheduling a Welcome meeting with Head of delivery', section: 'Upcoming meetings' },
  { title: 'Scheduling a meeting with Shani', section: 'Upcoming meetings' },
  { title: 'Scheduling a Welcome meeting with Kobi', section: 'Upcoming meetings' },
  { title: 'Scheduling a meeting with Dori', section: 'Upcoming meetings' },
  { title: 'Scheduling a meeting with HR - 1 week later', section: 'Upcoming meetings' },
  { title: 'Scheduling a meeting with HR - 1 month later', section: 'Upcoming meetings' },
  { title: 'Scheduling a meeting with HR - 3 months later', section: 'Upcoming meetings' },
  { title: 'Contract', section: 'HR touchpoints' },
  { title: 'Buddy', section: 'HR touchpoints' },
  { title: 'Sending the employee a "welcome aboard" mail', section: 'HR touchpoints' },
  { title: 'Michpal - 101 form', section: 'HR touchpoints' },
  { title: 'Academy ocean', section: 'HR touchpoints' },
  { title: 'DreamTeam', section: 'HR touchpoints' },
  { title: 'BuyMe', section: 'HR touchpoints' },
  { title: 'Accountant (Ben)', section: 'HR touchpoints' },
  { title: 'Insurance (Amnon Gur)', section: 'HR touchpoints' },
  { title: 'Zone (Hitechzone)', section: 'HR touchpoints' },
  { title: 'Uploading salary plan on Dream team', section: 'HR touchpoints' },
  { title: 'Form for receiving equipment', section: 'HR touchpoints' },
  { title: 'Cover', section: 'HR touchpoints' },
  { title: 'Add to birthday calendar', section: 'HR touchpoints' },
  { title: 'Add to contact us page', section: 'HR touchpoints' },
  { title: 'Toggl', section: 'HR touchpoints' },
  { title: 'Slack', section: 'HR touchpoints' },
  { title: 'Mindspace card', section: 'HR touchpoints' },
  { title: 'Welcome gift', section: 'HR touchpoints' },
];

// Default offboarding task presets
const DEFAULT_OFFBOARDING_TASKS: TaskPreset[] = [
  { title: 'Was the employee fired or resigned?', section: 'Administrative' },
  { title: 'Employment termination letter', section: 'Administrative' },
  { title: 'Update manager on employment end and close user', section: 'Administrative' },
  { title: 'Approve employment period', section: 'Administrative' },
  { title: 'Send pension release documents', section: 'Administrative' },
  { title: 'Cancel BuyMe and remove from birthday calendar', section: 'Systems & Access' },
  { title: 'Final account settlement', section: 'HR & Finance' },
  { title: 'Cancel Zone/Cibus', section: 'Systems & Access' },
  { title: 'Update employment end in DreamTeam', section: 'Systems & Access' },
  { title: 'Update employer portal (Amnon Gur)', section: 'Systems & Access' },
  { title: 'Return equipment to office', section: 'Systems & Access' },
  { title: 'HR conversation', section: 'HR & Finance' },
  { title: 'Cancel Cover', section: 'Systems & Access' },
  { title: 'Check if there is a loan and handle it', section: 'HR & Finance' },
  { title: 'Update health insurance about departure', section: 'HR & Finance' },
  { title: 'Check if employee has VESTED shares', section: 'HR & Finance' },
  { title: 'Execute share purchase in payslip', section: 'HR & Finance' },
  { title: 'Transfer employee details to former employees tab', section: 'Administrative' },
];

function getStoredPresets(mode: string): TaskPreset[] {
  if (typeof window === 'undefined') return mode === 'onboarding' ? DEFAULT_ONBOARDING_TASKS : DEFAULT_OFFBOARDING_TASKS;
  const key = `task-presets-${mode}`;
  const stored = localStorage.getItem(key);
  if (stored) {
    try { return JSON.parse(stored); } catch {}
  }
  return mode === 'onboarding' ? DEFAULT_ONBOARDING_TASKS : DEFAULT_OFFBOARDING_TASKS;
}

function savePresets(mode: string, presets: TaskPreset[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`task-presets-${mode}`, JSON.stringify(presets));
}

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  section: z.string().min(1, "Section is required"),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  employeeId: string;
  employeeName: string;
  mode?: 'onboarding' | 'offboarding';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskAdded?: () => void;
}

export function AddTaskModal({ employeeId, employeeName, mode = 'onboarding', open, onOpenChange, onTaskAdded }: Props) {
  const utils = trpc.useUtils();
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [customTitle, setCustomTitle] = useState(false);
  const [editingList, setEditingList] = useState(false);
  const [presets, setPresets] = useState<TaskPreset[]>([]);
  const [newPresetTitle, setNewPresetTitle] = useState('');
  const [newPresetSection, setNewPresetSection] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSection, setEditSection] = useState('');
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { section: 'General' },
  });

  useEffect(() => { setPresets(getStoredPresets(mode)); }, [mode, open]);

  const createOnboardingTask = trpc.onboarding.createTask.useMutation();
  const createOffboardingTask = trpc.onboarding.createOffboardingTask.useMutation();
  const { data: employees } = trpc.employee.list.useQuery({ limit: 100 }, { enabled: open });

  const isLoading = mode === 'onboarding' ? createOnboardingTask.isLoading : createOffboardingTask.isLoading;
  const sections = [...new Set(presets.map(p => p.section))];

  function addPreset() {
    if (!newPresetTitle.trim()) return;
    const section = newPresetSection.trim() || 'General';
    const updated = [...presets, { title: newPresetTitle.trim(), section }];
    setPresets(updated);
    savePresets(mode, updated);
    setNewPresetTitle('');
    setNewPresetSection('');
  }

  function removePreset(idx: number) {
    const updated = presets.filter((_, i) => i !== idx);
    setPresets(updated);
    savePresets(mode, updated);
  }

  function startEdit(idx: number) {
    setEditingIdx(idx);
    setEditTitle(presets[idx].title);
    setEditSection(presets[idx].section);
  }

  function saveEdit() {
    if (editingIdx === null || !editTitle.trim()) return;
    const updated = presets.map((p, i) => i === editingIdx ? { title: editTitle.trim(), section: editSection.trim() || p.section } : p);
    setPresets(updated);
    savePresets(mode, updated);
    setEditingIdx(null);
  }

  const onSubmit = async (values: FormValues) => {
    const payload = {
      employeeId,
      title: values.title,
      description: values.description,
      section: values.section,
      assigneeId: assigneeId || undefined,
      dueDate: values.dueDate ? new Date(values.dueDate) : undefined,
    };

    if (mode === 'onboarding') {
      await createOnboardingTask.mutateAsync(payload);
      utils.onboarding.listNewHires.invalidate();
    } else {
      await createOffboardingTask.mutateAsync(payload);
      utils.onboarding.listOffboarding.invalidate();
    }

    onTaskAdded?.();
    reset();
    setAssigneeId('');
    setCustomTitle(false);
    setEditingList(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add {mode === 'offboarding' ? 'Offboarding' : 'Onboarding'} Task for {employeeName}</DialogTitle>
        </DialogHeader>

        {editingList ? (
          /* ─── Edit Preset List ─── */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Edit Task List</p>
              <button type="button" onClick={() => setEditingList(false)} className="text-xs text-primary-500 hover:text-primary-600">
                ← Back
              </button>
            </div>

            {/* Add new preset */}
            <div className="flex gap-2">
              <Input value={newPresetTitle} onChange={e => setNewPresetTitle(e.target.value)} placeholder="New task title" className="flex-1" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPreset(); } }} />
              <Input value={newPresetSection} onChange={e => setNewPresetSection(e.target.value)} placeholder="Section" className="w-32" />
              <Button type="button" size="sm" onClick={addPreset} disabled={!newPresetTitle.trim()}>
                <Plus size={14} />
              </Button>
            </div>

            {/* Preset list */}
            <div className="max-h-[300px] overflow-y-auto space-y-1">
              {sections.map(section => (
                <div key={section}>
                  <p className="text-xs font-semibold text-gray-500 mt-2 mb-1">{section}</p>
                  {presets.filter(p => p.section === section).map((preset, _) => {
                    const idx = presets.indexOf(preset);
                    if (editingIdx === idx) {
                      return (
                        <div key={idx} className="flex items-center gap-2 py-1 px-2 bg-gray-50 dark:bg-gray-800 rounded">
                          <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="flex-1 h-7 text-sm" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditingIdx(null); }} autoFocus />
                          <Input value={editSection} onChange={e => setEditSection(e.target.value)} className="w-28 h-7 text-sm" placeholder="Section" />
                          <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={saveEdit}>Save</Button>
                          <button type="button" onClick={() => setEditingIdx(null)} className="text-xs text-gray-400">Cancel</button>
                        </div>
                      );
                    }
                    return (
                      <div key={idx} className="flex items-center justify-between py-1 px-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded text-sm group">
                        <span className="truncate flex-1">{preset.title}</span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 shrink-0 ml-2">
                          <button type="button" onClick={() => startEdit(idx)} className="text-gray-400 hover:text-primary-500">
                            <Pencil size={13} />
                          </button>
                          <button type="button" onClick={() => removePreset(idx)} className="text-red-400 hover:text-red-600">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <p className="text-[10px] text-gray-400">Changes are saved to your browser automatically.</p>
          </div>
        ) : (
          /* ─── Add Task Form ─── */
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium">Task Title</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setCustomTitle(!customTitle)} className="text-xs text-primary-500 hover:text-primary-600">
                    {customTitle ? 'Choose from list' : 'Custom title'}
                  </button>
                  <button type="button" onClick={() => setEditingList(true)} className="text-xs text-gray-400 hover:text-gray-600">
                    <Pencil size={12} className="inline mr-0.5" />Edit list
                  </button>
                </div>
              </div>
              {customTitle ? (
                <Input {...register("title")} placeholder="Type a custom task title..." />
              ) : (
                <select
                  {...register("title")}
                  onChange={e => {
                    const selected = presets.find(p => p.title === e.target.value);
                    setValue('title', e.target.value);
                    if (selected) setValue('section', selected.section);
                  }}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 text-gray-900 dark:text-white"
                >
                  <option value="">Select a task...</option>
                  {sections.map(section => (
                    <optgroup key={section} label={section}>
                      {presets.filter(p => p.section === section).map(p => (
                        <option key={p.title} value={p.title}>{p.title}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
              {errors.title && <p className="text-xs text-red-600 mt-1">{errors.title.message}</p>}
            </div>
            <div>
              <label htmlFor="section" className="block text-sm font-medium mb-1">Section</label>
              <Input id="section" {...register("section")} placeholder="e.g. Pre-boarding, HR touchpoints" />
              {errors.section && <p className="text-xs text-red-600 mt-1">{errors.section.message}</p>}
            </div>
            <div>
              <label htmlFor="assignee" className="block text-sm font-medium mb-1">Assigned to</label>
              <select
                id="assignee"
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                <option value="">No one assigned</option>
                {(employees?.employees ?? []).map((emp: any) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium mb-1">Description</label>
              <Input id="description" {...register("description")} placeholder="Optional details..." />
            </div>
            <div>
              <label htmlFor="dueDate" className="block text-sm font-medium mb-1">Due Date</label>
              <Input id="dueDate" type="date" {...register("dueDate")} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Adding..." : "Add Task"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
