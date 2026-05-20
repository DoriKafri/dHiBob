"use client";
import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Briefcase, Plus, Users, Clock, CheckCircle, ArrowRight, Mail, Phone, Star, ExternalLink, MapPin } from "lucide-react";
import { trpc } from "@/lib/trpc";

const PIPELINE_STAGES = ["SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED"] as const;
type PipelineStage = typeof PIPELINE_STAGES[number];

const STAGE_CONFIG: Record<PipelineStage, { label: string; color: string; bg: string }> = {
  SCREENING: { label: "Screening", color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800" },
  INTERVIEW: { label: "Interview", color: "text-purple-700 dark:text-purple-300", bg: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800" },
  OFFER: { label: "Offer", color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800" },
  HIRED: { label: "Hired", color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" },
  REJECTED: { label: "Rejected", color: "text-red-700 dark:text-red-300", bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" },
};

const SOURCE_COLORS: Record<string, string> = {
  LINKEDIN: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  REFERRAL: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  WEBSITE: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  RECRUITER: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  OTHER: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

function formatRelative(date: Date | string): string {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function HiringPage() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showCreateJob, setShowCreateJob] = useState(false);
  const [showAddCandidate, setShowAddCandidate] = useState(false);

  const { data: jobsData, isLoading: jobsLoading } = trpc.hiring.listJobs.useQuery({ limit: 100 });

  useEffect(() => {
    if (!selectedJobId && jobsData?.jobs[0]) setSelectedJobId(jobsData.jobs[0].id);
  }, [jobsData, selectedJobId]);

  const { data: candidatesData, isLoading: candidatesLoading } =
    trpc.hiring.listCandidates.useQuery({ jobId: selectedJobId!, limit: 100 }, { enabled: !!selectedJobId });

  const utils = trpc.useUtils();
  const createJob = trpc.hiring.createJob.useMutation({ onSuccess: () => { utils.hiring.listJobs.invalidate(); setShowCreateJob(false); } });
  const addCandidate = trpc.hiring.addCandidate.useMutation({ onSuccess: () => { utils.hiring.listCandidates.invalidate(); utils.hiring.listJobs.invalidate(); setShowAddCandidate(false); } });
  const moveStage = trpc.hiring.moveStage.useMutation({ onSuccess: () => { utils.hiring.listCandidates.invalidate(); utils.hiring.listJobs.invalidate(); } });

  type CandidateItem = NonNullable<typeof candidatesData>["candidates"][number];
  const candidatesByStage = useMemo(() => {
    const map: Record<PipelineStage, CandidateItem[]> = { SCREENING: [], INTERVIEW: [], OFFER: [], HIRED: [], REJECTED: [] };
    if (candidatesData?.candidates) {
      for (const c of candidatesData.candidates) {
        const stage = c.stage as PipelineStage;
        if (map[stage]) map[stage].push(c);
      }
    }
    return map;
  }, [candidatesData]);

  const openPositions = jobsLoading ? '—' : jobsData?.jobs.filter(j => j.status === 'OPEN').length ?? 0;
  const totalCandidates = jobsLoading ? '—' : jobsData?.jobs.reduce((s, j) => s + j._count.candidates, 0) ?? 0;
  const hiredCount = candidatesData?.candidates.filter(c => c.stage === 'HIRED').length ?? 0;
  const selectedJob = jobsData?.jobs.find(j => j.id === selectedJobId);

  // Job create form state
  const [jobForm, setJobForm] = useState({ title: '', description: '', status: 'OPEN' as string, salaryMin: '', salaryMax: '' });
  // Candidate form state
  const [candForm, setCandForm] = useState({ firstName: '', lastName: '', email: '', phone: '', resume: '', source: 'OTHER' as string });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Hiring</h1>
        <Button onClick={() => setShowCreateJob(true)} className="gap-2"><Plus size={16} /> Post Job</Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Open Positions" value={openPositions} icon={<Briefcase size={20} />} />
        <StatCard title="Total Candidates" value={totalCandidates} icon={<Users size={20} />} />
        <StatCard title="In Pipeline" value={candidatesLoading ? '—' : (candidatesData?.candidates.filter(c => !['HIRED', 'REJECTED'].includes(c.stage)).length ?? 0)} icon={<Clock size={20} />} />
        <StatCard title="Hired" value={hiredCount} icon={<CheckCircle size={20} />} />
      </div>

      {/* Open Positions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Job Postings</CardTitle>
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />)}</div>
          ) : !jobsData?.jobs.length ? (
            <p className="text-center text-gray-500 dark:text-gray-300 py-8">No job postings yet.</p>
          ) : (
            <div className="space-y-2">
              {jobsData.jobs.map(job => {
                const isSelected = job.id === selectedJobId;
                return (
                  <div key={job.id} onClick={() => setSelectedJobId(job.id)}
                    className={`flex items-center justify-between p-4 rounded-lg cursor-pointer border transition-all ${
                      isSelected ? 'border-primary-300 bg-primary-50/50 dark:bg-primary-900/10 dark:border-primary-700' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{job.title}</p>
                        <Badge variant={job.status === 'OPEN' ? 'success' : job.status === 'ON_HOLD' ? 'warning' : 'secondary'}>{job.status}</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-300">
                        {(job as any).department?.name && <span className="flex items-center gap-1"><MapPin size={12} /> {(job as any).department.name}</span>}
                        <span>{job._count.candidates} candidate{job._count.candidates !== 1 ? 's' : ''}</span>
                        {job.salaryMin && job.salaryMax && <span>${(job.salaryMin/1000).toFixed(0)}k - ${(job.salaryMax/1000).toFixed(0)}k</span>}
                        <span>{formatRelative(job.createdAt)}</span>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); setSelectedJobId(job.id); setShowAddCandidate(true); }} className="gap-1 shrink-0">
                      <Plus size={14} /> Candidate
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pipeline Board */}
      {selectedJob && (
        <Card>
          <CardHeader>
            <CardTitle>Pipeline — {selectedJob.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {PIPELINE_STAGES.filter(s => s !== 'REJECTED').map(stage => {
                const config = STAGE_CONFIG[stage];
                const candidates = candidatesByStage[stage];
                return (
                  <div key={stage} className={`min-w-[220px] flex-1 rounded-lg border p-3 ${config.bg}`}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className={`font-semibold text-sm ${config.color}`}>{config.label}</h3>
                      <span className={`text-xs font-bold ${config.color}`}>{candidates.length}</span>
                    </div>
                    <div className="space-y-2">
                      {candidatesLoading ? (
                        <div className="h-16 bg-white/50 dark:bg-gray-900/50 rounded animate-pulse" />
                      ) : candidates.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-3">No candidates</p>
                      ) : candidates.map(c => (
                        <div key={c.id} className="bg-white dark:bg-charcoal-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700 shadow-sm">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-sm">{c.firstName} {c.lastName}</p>
                              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-300">
                                {c.email && <span className="flex items-center gap-0.5"><Mail size={10} /> {c.email.split('@')[0]}</span>}
                                {(c as any).source && <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_COLORS[(c as any).source] || SOURCE_COLORS.OTHER}`}>{(c as any).source}</span>}
                              </div>
                              {(c as any).rating && (
                                <div className="flex mt-1">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <Star key={i} size={10} className={i < ((c as any).rating || 0) ? 'text-amber-400 fill-amber-400' : 'text-gray-300'} />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          {stage !== 'HIRED' && (
                            <Button size="sm" variant="outline" className="mt-2 w-full text-xs gap-1 h-7"
                              onClick={() => {
                                const currentIdx = PIPELINE_STAGES.indexOf(stage);
                                const nextStage = PIPELINE_STAGES[currentIdx + 1];
                                if (nextStage) moveStage.mutate({ candidateId: c.id, stage: nextStage });
                              }}>
                              Move to {STAGE_CONFIG[PIPELINE_STAGES[PIPELINE_STAGES.indexOf(stage) + 1]]?.label ?? 'next'} <ArrowRight size={12} />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Rejected section */}
            {candidatesByStage.REJECTED.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-300 mb-2">Rejected ({candidatesByStage.REJECTED.length})</h4>
                <div className="flex flex-wrap gap-2">
                  {candidatesByStage.REJECTED.map(c => (
                    <span key={c.id} className="text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-2 py-1 rounded">
                      {c.firstName} {c.lastName}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create Job Modal */}
      <Dialog open={showCreateJob} onOpenChange={setShowCreateJob}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Post New Job</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createJob.mutate({ title: jobForm.title, description: jobForm.description, status: jobForm.status as any, salaryMin: jobForm.salaryMin ? Number(jobForm.salaryMin) : undefined, salaryMax: jobForm.salaryMax ? Number(jobForm.salaryMax) : undefined }); setJobForm({ title: '', description: '', status: 'OPEN', salaryMin: '', salaryMax: '' }); }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <Input value={jobForm.title} onChange={e => setJobForm(f => ({ ...f, title: e.target.value }))} required placeholder="e.g. Senior Frontend Engineer" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea value={jobForm.description} onChange={e => setJobForm(f => ({ ...f, description: e.target.value }))} required className="w-full border dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 min-h-[60px]" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Salary Min</label>
                <Input type="number" value={jobForm.salaryMin} onChange={e => setJobForm(f => ({ ...f, salaryMin: e.target.value }))} placeholder="80000" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Salary Max</label>
                <Input type="number" value={jobForm.salaryMax} onChange={e => setJobForm(f => ({ ...f, salaryMax: e.target.value }))} placeholder="120000" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateJob(false)}>Cancel</Button>
              <Button type="submit" disabled={!jobForm.title}>Create Job</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Candidate Modal */}
      <Dialog open={showAddCandidate} onOpenChange={setShowAddCandidate}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Candidate</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); addCandidate.mutate({ jobId: selectedJobId!, firstName: candForm.firstName, lastName: candForm.lastName, email: candForm.email, phone: candForm.phone || undefined, resume: candForm.resume || undefined, source: candForm.source as any }); setCandForm({ firstName: '', lastName: '', email: '', phone: '', resume: '', source: 'OTHER' }); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">First Name</label>
                <Input value={candForm.firstName} onChange={e => setCandForm(f => ({ ...f, firstName: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Last Name</label>
                <Input value={candForm.lastName} onChange={e => setCandForm(f => ({ ...f, lastName: e.target.value }))} required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <Input type="email" value={candForm.email} onChange={e => setCandForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <Input type="tel" value={candForm.phone} onChange={e => setCandForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Source</label>
              <select value={candForm.source} onChange={e => setCandForm(f => ({ ...f, source: e.target.value }))} className="w-full border dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800">
                <option value="LINKEDIN">LinkedIn</option>
                <option value="REFERRAL">Referral</option>
                <option value="WEBSITE">Website</option>
                <option value="RECRUITER">Recruiter</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowAddCandidate(false)}>Cancel</Button>
              <Button type="submit" disabled={!candForm.firstName || !candForm.email}>Add Candidate</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
