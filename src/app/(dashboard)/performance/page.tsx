"use client";
import React, { useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Target, Star, Plus, BarChart2, ChevronDown, ChevronRight, CheckCircle2, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";

function Skeleton({ className }: { className?: string }) {
  return <div role="status" data-testid="skeleton" className={`animate-pulse bg-gray-200 dark:bg-charcoal-800 rounded ${className ?? ""}`} />;
}

const GOAL_TYPE_COLORS: Record<string, string> = {
  INDIVIDUAL: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  TEAM: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  DEPARTMENT: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  COMPANY: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

function progressColor(pct: number) {
  if (pct >= 100) return 'bg-emerald-500';
  if (pct >= 60) return 'bg-blue-500';
  if (pct >= 30) return 'bg-amber-500';
  return 'bg-red-400';
}

// ─── Goal Card with expandable Key Results ───
function GoalCard({ goal, showOwner }: { goal: any; showOwner?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [addKrOpen, setAddKrOpen] = useState(false);
  const [krTitle, setKrTitle] = useState('');
  const [krTarget, setKrTarget] = useState('');
  const [krUnit, setKrUnit] = useState('');

  const utils = trpc.useUtils();
  const updateProgress = trpc.performance.updateGoalProgress.useMutation({ onSuccess: () => { utils.performance.listGoals.invalidate(); utils.performance.listAllGoals.invalidate(); } });
  const updateKr = trpc.performance.updateKeyResult.useMutation({ onSuccess: () => { utils.performance.listGoals.invalidate(); utils.performance.listAllGoals.invalidate(); } });
  const addKr = trpc.performance.addKeyResult.useMutation({ onSuccess: () => { utils.performance.listGoals.invalidate(); utils.performance.listAllGoals.invalidate(); setAddKrOpen(false); setKrTitle(''); setKrTarget(''); setKrUnit(''); } });

  const keyResults = (goal.keyResults ?? []) as any[];
  const hasKrs = keyResults.length > 0;
  const isComplete = goal.status === 'COMPLETED';

  return (
    <Card className={isComplete ? 'opacity-75' : ''}>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <button onClick={() => setExpanded(e => !e)} className="mt-1 shrink-0 text-gray-400">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 flex-wrap">
                {isComplete && <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />}
                <h3 className={`font-semibold ${isComplete ? 'line-through text-gray-400' : ''}`}>{goal.title}</h3>
                <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${GOAL_TYPE_COLORS[goal.type] || GOAL_TYPE_COLORS.INDIVIDUAL}`}>{goal.type}</span>
              </div>
              <Badge variant={goal.status === 'COMPLETED' ? 'success' : 'secondary'}>{goal.status}</Badge>
            </div>

            {goal.description && <p className="text-sm text-gray-500 dark:text-gray-300 mb-2">{goal.description}</p>}

            {showOwner && goal.employee && (
              <p className="text-xs text-gray-400 mb-2">Owner: {goal.employee.firstName} {goal.employee.lastName}</p>
            )}

            {/* Progress bar */}
            <div className="flex items-center gap-3 mb-1">
              <div className="flex-1 h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full">
                <div className={`h-2.5 rounded-full transition-all ${progressColor(goal.progress)}`} style={{ width: `${goal.progress}%` }} />
              </div>
              <span className="text-sm font-bold w-10 text-right">{goal.progress}%</span>
            </div>

            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>Due: {new Date(goal.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              {hasKrs && <span>{keyResults.length} key result{keyResults.length > 1 ? 's' : ''}</span>}
            </div>
          </div>
        </div>

        {/* Expanded: Key Results */}
        {expanded && (
          <div className="mt-4 ml-7 space-y-3">
            {keyResults.map((kr: any) => {
              const krPct = kr.targetValue > 0 ? Math.min(Math.round((kr.currentValue / kr.targetValue) * 100), 100) : 0;
              return (
                <div key={kr.id} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium">{kr.title}</p>
                    <span className="text-xs text-gray-500 dark:text-gray-300">{kr.currentValue} / {kr.targetValue} {kr.unit}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full">
                      <div className={`h-1.5 rounded-full ${progressColor(krPct)}`} style={{ width: `${krPct}%` }} />
                    </div>
                    <input
                      type="number"
                      defaultValue={kr.currentValue}
                      min={0}
                      max={kr.targetValue}
                      className="w-16 border dark:border-gray-700 rounded px-2 py-0.5 text-xs bg-white dark:bg-charcoal-800"
                      onBlur={e => {
                        const val = Number(e.target.value);
                        if (val !== kr.currentValue) updateKr.mutate({ keyResultId: kr.id, currentValue: val });
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    />
                  </div>
                </div>
              );
            })}

            {/* Add key result */}
            {!addKrOpen ? (
              <button onClick={() => setAddKrOpen(true)} className="text-sm text-primary-500 hover:text-primary-600 font-medium flex items-center gap-1">
                <Plus size={14} /> Add key result
              </button>
            ) : (
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-2">
                <Input value={krTitle} onChange={e => setKrTitle(e.target.value)} placeholder="Key result title" className="h-8 text-sm" />
                <div className="flex gap-2">
                  <Input value={krTarget} onChange={e => setKrTarget(e.target.value)} placeholder="Target" type="number" className="h-8 text-sm w-24" />
                  <Input value={krUnit} onChange={e => setKrUnit(e.target.value)} placeholder="Unit (%, hrs, etc.)" className="h-8 text-sm flex-1" />
                  <Button size="sm" onClick={() => { if (krTitle && krTarget) addKr.mutate({ goalId: goal.id, title: krTitle, targetValue: Number(krTarget), unit: krUnit || 'units' }); }} disabled={!krTitle || !krTarget}>Add</Button>
                  <Button size="sm" variant="outline" onClick={() => setAddKrOpen(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Manual progress override */}
            {!hasKrs && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-300">Manual progress:</span>
                <input type="range" min={0} max={100} defaultValue={goal.progress} className="flex-1 h-1.5 accent-primary-500"
                  onMouseUp={e => updateProgress.mutate({ goalId: goal.id, progress: Number((e.target as HTMLInputElement).value) })} />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Review Cycle Card with expandable reviews ───
function CycleCard({ cycle }: { cycle: any }) {
  const [expanded, setExpanded] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewEmployeeId, setReviewEmployeeId] = useState('');
  const [reviewRating, setReviewRating] = useState(3);
  const [reviewFeedback, setReviewFeedback] = useState('');

  const { data: session } = useSession();
  const utils = trpc.useUtils();
  const { data: reviews } = trpc.performance.listReviews.useQuery({ cycleId: cycle.id }, { enabled: expanded });
  const submitReview = trpc.performance.submitReview.useMutation({ onSuccess: () => { utils.performance.listReviews.invalidate({ cycleId: cycle.id }); utils.performance.listCycles.invalidate(); setReviewOpen(false); } });
  const { data: employees } = trpc.employee.list.useQuery({ limit: 100 }, { enabled: reviewOpen });

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <button onClick={() => setExpanded(e => !e)} className="mt-1 shrink-0 text-gray-400">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Star size={18} className="text-amber-500" />
                <h3 className="font-semibold">{cycle.name}</h3>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={cycle.status === 'ACTIVE' ? 'success' : cycle.status === 'COMPLETED' ? 'secondary' : 'outline'}>{cycle.status}</Badge>
                <Badge variant="outline">{cycle.type}</Badge>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>{new Date(cycle.startDate).toLocaleDateString()} — {new Date(cycle.endDate).toLocaleDateString()}</span>
              <span>{cycle._count?.reviews ?? 0} reviews</span>
            </div>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 ml-7 space-y-3">
            {cycle.status === 'ACTIVE' && (
              <Button size="sm" onClick={() => setReviewOpen(true)} className="gap-1 mb-2"><Plus size={14} /> Submit Review</Button>
            )}

            {reviews && reviews.length > 0 ? (
              <div className="space-y-2">
                {(reviews as any[]).map((r: any) => (
                  <div key={r.id} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {r.employee?.avatar ? (
                        <img src={r.employee.avatar} className="w-8 h-8 rounded-full" alt="" />
                      ) : (
                        <span className="w-8 h-8 rounded-full bg-purple-500 text-white text-xs font-medium inline-flex items-center justify-center">
                          {r.employee?.firstName?.[0]}{r.employee?.lastName?.[0]}
                        </span>
                      )}
                      <div>
                        <p className="text-sm font-medium">{r.employee?.firstName} {r.employee?.lastName}</p>
                        <p className="text-xs text-gray-400">{r.employee?.department?.name} · {r.type} review</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={14} className={i < (r.rating || 0) ? 'text-amber-400 fill-amber-400' : 'text-gray-300'} />
                        ))}
                      </div>
                      <Badge variant={r.status === 'SUBMITTED' ? 'success' : 'secondary'}>{r.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No reviews submitted yet.</p>
            )}

            {/* Submit Review Dialog */}
            <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Submit Review</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Employee</label>
                    <select value={reviewEmployeeId} onChange={e => setReviewEmployeeId(e.target.value)} className="w-full border dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800">
                      <option value="">Select employee...</option>
                      {((employees as any)?.employees ?? []).map((emp: any) => (
                        <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Rating</label>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(v => (
                        <button key={v} type="button" onClick={() => setReviewRating(v)} className="p-1">
                          <Star size={24} className={v <= reviewRating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Feedback</label>
                    <textarea value={reviewFeedback} onChange={e => setReviewFeedback(e.target.value)} placeholder="Performance feedback..." className="w-full border dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 min-h-[80px]" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
                    <Button onClick={() => { if (reviewEmployeeId) submitReview.mutate({ cycleId: cycle.id, employeeId: reviewEmployeeId, rating: reviewRating, responses: JSON.stringify({ feedback: reviewFeedback }) }); }} disabled={!reviewEmployeeId}>Submit</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Create Goal Modal ───
function CreateGoalModal({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [type, setType] = useState('INDIVIDUAL');
  const utils = trpc.useUtils();
  const createGoal = trpc.performance.createGoal.useMutation({ onSuccess: () => { utils.performance.listGoals.invalidate(); utils.performance.listAllGoals.invalidate(); onClose(); } });

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Create Goal</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); createGoal.mutate({ employeeId, title, description: description || undefined, startDate: new Date(startDate), dueDate: new Date(dueDate), type }); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} required placeholder="Goal title" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full border dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 min-h-[60px]" placeholder="Optional description" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Due Date</label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value)} className="w-full border dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800">
              <option value="INDIVIDUAL">Individual</option>
              <option value="TEAM">Team</option>
              <option value="DEPARTMENT">Department</option>
              <option value="COMPANY">Company</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!title || !startDate || !dueDate}>Create Goal</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Cycle Modal ───
function CreateCycleModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [type, setType] = useState('ANNUAL');
  const [status, setStatus] = useState<'DRAFT' | 'ACTIVE'>('DRAFT');
  const utils = trpc.useUtils();
  const createCycle = trpc.performance.createCycle.useMutation({ onSuccess: () => { utils.performance.listCycles.invalidate(); onClose(); } });

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Create Review Cycle</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); createCycle.mutate({ name, startDate: new Date(startDate), endDate: new Date(endDate), type, status }); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} required placeholder="Q2 2026 Review" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date</label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select value={type} onChange={e => setType(e.target.value)} className="w-full border dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800">
                <option value="ANNUAL">Annual</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as any)} className="w-full border dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800">
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!name || !startDate || !endDate}>Create</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ───
export default function PerformancePage() {
  const { data: session } = useSession();
  const employeeId = session?.user?.employeeId;
  const [activeTab, setActiveTab] = useState("goals");
  const [showCreateGoal, setShowCreateGoal] = useState(false);
  const [showCreateCycle, setShowCreateCycle] = useState(false);

  const isHrOrAdmin = session?.user?.role === 'SUPER_ADMIN' || session?.user?.role === 'ADMIN' || session?.user?.role === 'HR';

  const { data: allGoals, isLoading: allGoalsLoading } = trpc.performance.listAllGoals.useQuery(undefined, { enabled: isHrOrAdmin });
  const { data: myGoalsData, isLoading: myGoalsLoading } = trpc.performance.listGoals.useQuery(
    { employeeId: employeeId!, limit: 100 },
    { enabled: !!employeeId && !isHrOrAdmin }
  );
  const { data: cyclesData, isLoading: cyclesLoading } = trpc.performance.listCycles.useQuery({ limit: 100 });

  const goals = isHrOrAdmin ? (allGoals ?? []) : (myGoalsData?.goals ?? []);
  const goalsLoading = isHrOrAdmin ? allGoalsLoading : myGoalsLoading;
  const cycles = cyclesData?.cycles ?? [];

  const activeGoals = goals.filter((g: any) => g.status === 'ACTIVE').length;
  const completedGoals = goals.filter((g: any) => g.status === 'COMPLETED').length;
  const activeCycles = cycles.filter((c: any) => c.status === 'ACTIVE').length;
  const avgProgress = goals.length > 0 ? Math.round(goals.reduce((s: number, g: any) => s + g.progress, 0) / goals.length) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Performance</h1>
        {activeTab === "goals" ? (
          <Button onClick={() => setShowCreateGoal(true)} className="gap-2"><Plus size={16} /> New Goal</Button>
        ) : isHrOrAdmin ? (
          <Button onClick={() => setShowCreateCycle(true)} className="gap-2"><Plus size={16} /> New Cycle</Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Active Goals" value={goalsLoading ? '—' : activeGoals} icon={<Target size={20} />} />
        <StatCard title="Completed" value={goalsLoading ? '—' : completedGoals} icon={<CheckCircle2 size={20} />} />
        <StatCard title="Avg Progress" value={goalsLoading ? '—' : `${avgProgress}%`} icon={<TrendingUp size={20} />} />
        <StatCard title="Active Cycles" value={cyclesLoading ? '—' : activeCycles} icon={<BarChart2 size={20} />} />
      </div>

      <Tabs defaultValue="goals" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="goals">Goals & OKRs</TabsTrigger>
          <TabsTrigger value="reviews">Review Cycles</TabsTrigger>
        </TabsList>

        <TabsContent value="goals" className="mt-4">
          {goalsLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
          ) : goals.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-300">
              <Target size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">No goals yet.</p>
              <p className="text-sm">Click &quot;New Goal&quot; to create one.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {goals.map((goal: any) => <GoalCard key={goal.id} goal={goal} showOwner={isHrOrAdmin} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reviews" className="mt-4">
          {cyclesLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : cycles.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-300">
              <Star size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">No review cycles yet.</p>
              <p className="text-sm">Click &quot;New Cycle&quot; to create one.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cycles.map((cycle: any) => <CycleCard key={cycle.id} cycle={cycle} />)}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {showCreateGoal && employeeId && <CreateGoalModal employeeId={employeeId} onClose={() => setShowCreateGoal(false)} />}
      {showCreateCycle && <CreateCycleModal onClose={() => setShowCreateCycle(false)} />}
    </div>
  );
}
