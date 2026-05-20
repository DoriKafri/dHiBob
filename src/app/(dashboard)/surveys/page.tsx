"use client";

import React, { useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Plus, Trash2, GripVertical, BarChart3, Eye, Send, X, Star, CheckSquare, AlignLeft, List, ArrowLeft } from "lucide-react";

type QuestionType = 'MULTIPLE_CHOICE' | 'CHECKBOX' | 'SHORT_TEXT' | 'LONG_TEXT' | 'RATING';
type Question = { id: string; type: QuestionType; title: string; required: boolean; options?: string[]; maxRating?: number };
type View = 'list' | 'create' | 'fill' | 'results';

const TYPE_LABELS: Record<QuestionType, { label: string; icon: typeof List }> = {
  MULTIPLE_CHOICE: { label: 'Multiple Choice', icon: List },
  CHECKBOX: { label: 'Checkboxes', icon: CheckSquare },
  SHORT_TEXT: { label: 'Short Text', icon: AlignLeft },
  LONG_TEXT: { label: 'Long Text', icon: AlignLeft },
  RATING: { label: 'Rating', icon: Star },
};

function genId() { return Math.random().toString(36).slice(2, 10); }

// ─── Survey Builder ───
function SurveyBuilder({ onClose, editSurvey }: { onClose: () => void; editSurvey?: any }) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState(editSurvey?.title || '');
  const [description, setDescription] = useState(editSurvey?.description || '');
  const [anonymous, setAnonymous] = useState(editSurvey?.anonymous ?? true);
  const [questions, setQuestions] = useState<Question[]>(editSurvey?.questions || []);

  const createMutation = trpc.surveys.create.useMutation({ onSuccess: () => { utils.surveys.list.invalidate(); onClose(); } });
  const updateMutation = trpc.surveys.update.useMutation({ onSuccess: () => { utils.surveys.list.invalidate(); onClose(); } });

  function addQuestion(type: QuestionType) {
    const q: Question = { id: genId(), type, title: '', required: false };
    if (type === 'MULTIPLE_CHOICE' || type === 'CHECKBOX') q.options = ['Option 1'];
    if (type === 'RATING') q.maxRating = 5;
    setQuestions([...questions, q]);
  }

  function updateQuestion(idx: number, updates: Partial<Question>) {
    setQuestions(questions.map((q, i) => i === idx ? { ...q, ...updates } : q));
  }

  function removeQuestion(idx: number) {
    setQuestions(questions.filter((_, i) => i !== idx));
  }

  function addOption(qIdx: number) {
    const q = questions[qIdx];
    updateQuestion(qIdx, { options: [...(q.options || []), `Option ${(q.options?.length || 0) + 1}`] });
  }

  function updateOption(qIdx: number, optIdx: number, value: string) {
    const q = questions[qIdx];
    const opts = [...(q.options || [])];
    opts[optIdx] = value;
    updateQuestion(qIdx, { options: opts });
  }

  function removeOption(qIdx: number, optIdx: number) {
    const q = questions[qIdx];
    updateQuestion(qIdx, { options: (q.options || []).filter((_, i) => i !== optIdx) });
  }

  async function handleSave() {
    if (!title.trim() || questions.length === 0) return;
    if (editSurvey) {
      await updateMutation.mutateAsync({ id: editSurvey.id, title, description, anonymous, questions });
    } else {
      await createMutation.mutateAsync({ title, description, anonymous, questions });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold">{editSurvey ? 'Edit Survey' : 'Create Survey'}</h1>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Survey Title" className="text-lg font-semibold border-0 border-b-2 rounded-none px-0 focus:ring-0" />
          </div>
          <div>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Survey description (optional)" className="w-full text-sm border-0 border-b border-gray-200 dark:border-gray-700 bg-transparent resize-none outline-none py-2" rows={2} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} className="rounded" />
            Anonymous responses
          </label>
        </CardContent>
      </Card>

      {/* Questions */}
      {questions.map((q, qIdx) => (
        <Card key={q.id}>
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <GripVertical size={16} className="text-gray-400 mt-3 shrink-0" />
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-3">
                  <Input value={q.title} onChange={e => updateQuestion(qIdx, { title: e.target.value })} placeholder="Question" className="flex-1 font-medium" />
                  <select value={q.type} onChange={e => updateQuestion(qIdx, { type: e.target.value as QuestionType, options: (e.target.value === 'MULTIPLE_CHOICE' || e.target.value === 'CHECKBOX') ? (q.options || ['Option 1']) : undefined })} className="border rounded-md px-2 py-1.5 text-sm bg-white dark:bg-charcoal-800 dark:border-gray-700">
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <button onClick={() => removeQuestion(qIdx)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-500">
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Options for MC / Checkbox */}
                {(q.type === 'MULTIPLE_CHOICE' || q.type === 'CHECKBOX') && (
                  <div className="space-y-2 pl-6">
                    {(q.options || []).map((opt, optIdx) => (
                      <div key={optIdx} className="flex items-center gap-2">
                        {q.type === 'MULTIPLE_CHOICE' ? <div className="w-4 h-4 rounded-full border-2 border-gray-300" /> : <div className="w-4 h-4 rounded border-2 border-gray-300" />}
                        <Input value={opt} onChange={e => updateOption(qIdx, optIdx, e.target.value)} className="flex-1 h-8 text-sm" />
                        {(q.options?.length || 0) > 1 && (
                          <button onClick={() => removeOption(qIdx, optIdx)} className="p-1 text-gray-400 hover:text-red-500"><X size={14} /></button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => addOption(qIdx)} className="text-sm text-primary-500 hover:text-primary-600 pl-6">+ Add option</button>
                  </div>
                )}

                {/* Rating preview */}
                {q.type === 'RATING' && (
                  <div className="flex items-center gap-3 pl-6">
                    <span className="text-sm text-gray-500 dark:text-gray-300">Scale: 1 to</span>
                    <select value={q.maxRating || 5} onChange={e => updateQuestion(qIdx, { maxRating: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm bg-white dark:bg-charcoal-800 dark:border-gray-700">
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                    </select>
                    <div className="flex gap-1">
                      {Array.from({ length: q.maxRating || 5 }).map((_, i) => <Star key={i} size={16} className="text-gray-300" />)}
                    </div>
                  </div>
                )}

                {/* Text preview */}
                {q.type === 'SHORT_TEXT' && <div className="pl-6"><div className="h-8 border-b border-gray-300 dark:border-gray-600 w-2/3" /></div>}
                {q.type === 'LONG_TEXT' && <div className="pl-6"><div className="h-20 border border-gray-300 dark:border-gray-600 rounded-md w-full" /></div>}

                <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300">
                  <input type="checkbox" checked={q.required} onChange={e => updateQuestion(qIdx, { required: e.target.checked })} className="rounded" />
                  Required
                </label>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Add question buttons */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-300 mb-3">Add question</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(TYPE_LABELS).map(([type, { label, icon: Icon }]) => (
              <button key={type} onClick={() => addQuestion(type as QuestionType)} className="flex items-center gap-2 px-3 py-2 text-sm border rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 dark:border-gray-700">
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={!title.trim() || questions.length === 0 || createMutation.isLoading || updateMutation.isLoading}>
          {editSurvey ? 'Save Changes' : 'Create Survey'}
        </Button>
      </div>
    </div>
  );
}

// ─── Survey Fill Form ───
function SurveyFillForm({ surveyId, onClose }: { surveyId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: survey, isLoading } = trpc.surveys.getById.useQuery({ id: surveyId });
  const { data: hasResponded } = trpc.surveys.hasResponded.useQuery({ surveyId });
  const submitMutation = trpc.surveys.submitResponse.useMutation({ onSuccess: () => { utils.surveys.list.invalidate(); utils.surveys.hasResponded.invalidate({ surveyId }); } });
  const [answers, setAnswers] = useState<Record<string, any>>({});

  if (isLoading) return <div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-lg" />)}</div>;
  if (!survey) return <p>Survey not found.</p>;

  const questions = survey.questions as Question[];

  async function handleSubmit() {
    // Validate required questions
    for (const q of questions) {
      if (q.required && !answers[q.id]) {
        alert(`Please answer: "${q.title}"`);
        return;
      }
    }
    await submitMutation.mutateAsync({ surveyId, answers });
    onClose();
  }

  if (hasResponded) {
    return (
      <div className="space-y-6">
        <button onClick={onClose} className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300 hover:text-gray-700"><ArrowLeft size={16} /> Back to surveys</button>
        <Card><CardContent className="p-12 text-center">
          <CheckSquare size={48} className="mx-auto mb-4 text-emerald-500" />
          <p className="text-lg font-semibold">You&apos;ve already responded to this survey.</p>
          <p className="text-sm text-gray-500 dark:text-gray-300 mt-1">Thank you for your feedback!</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button onClick={onClose} className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300 hover:text-gray-700"><ArrowLeft size={16} /> Back to surveys</button>
      <Card>
        <CardContent className="p-6">
          <h2 className="text-xl font-bold">{survey.title}</h2>
          {survey.description && <p className="text-sm text-gray-500 dark:text-gray-300 mt-1">{survey.description}</p>}
          {survey.anonymous && <p className="text-xs text-gray-400 mt-2">This survey is anonymous.</p>}
        </CardContent>
      </Card>

      {questions.map((q, i) => (
        <Card key={q.id}>
          <CardContent className="p-6">
            <p className="font-medium mb-3">{i + 1}. {q.title} {q.required && <span className="text-red-500">*</span>}</p>

            {q.type === 'MULTIPLE_CHOICE' && (
              <div className="space-y-2">
                {(q.options || []).map((opt, j) => (
                  <label key={j} className="flex items-center gap-3 cursor-pointer">
                    <input type="radio" name={q.id} value={opt} checked={answers[q.id] === opt} onChange={() => setAnswers({ ...answers, [q.id]: opt })} className="text-primary-500" />
                    <span className="text-sm">{opt}</span>
                  </label>
                ))}
              </div>
            )}

            {q.type === 'CHECKBOX' && (
              <div className="space-y-2">
                {(q.options || []).map((opt, j) => (
                  <label key={j} className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" value={opt} checked={(answers[q.id] || []).includes(opt)} onChange={e => {
                      const current = answers[q.id] || [];
                      setAnswers({ ...answers, [q.id]: e.target.checked ? [...current, opt] : current.filter((v: string) => v !== opt) });
                    }} className="rounded" />
                    <span className="text-sm">{opt}</span>
                  </label>
                ))}
              </div>
            )}

            {q.type === 'SHORT_TEXT' && (
              <Input value={answers[q.id] || ''} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder="Your answer" />
            )}

            {q.type === 'LONG_TEXT' && (
              <textarea value={answers[q.id] || ''} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder="Your answer" className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 min-h-[100px]" />
            )}

            {q.type === 'RATING' && (
              <div className="flex gap-2">
                {Array.from({ length: q.maxRating || 5 }).map((_, j) => (
                  <button key={j} type="button" onClick={() => setAnswers({ ...answers, [q.id]: j + 1 })} className="p-1">
                    <Star size={24} className={j < (answers[q.id] || 0) ? 'text-amber-400 fill-amber-400' : 'text-gray-300'} />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={submitMutation.isLoading} className="gap-2">
          <Send size={16} /> Submit
        </Button>
      </div>
    </div>
  );
}

// ─── Survey Results ───
function SurveyResults({ surveyId, onClose }: { surveyId: string; onClose: () => void }) {
  const { data, isLoading } = trpc.surveys.getResults.useQuery({ surveyId });

  if (isLoading) return <div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-lg" />)}</div>;
  if (!data) return <p>Results not found.</p>;

  const { survey, responses, totalResponses } = data;
  const questions = survey.questions as Question[];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold">{survey.title} — Results</h1>
          <p className="text-sm text-gray-500 dark:text-gray-300">{totalResponses} response{totalResponses !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {questions.map((q, qIdx) => {
        const qAnswers = responses.map((r: any) => r.answers[q.id]).filter(Boolean);

        return (
          <Card key={q.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{qIdx + 1}. {q.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {(q.type === 'MULTIPLE_CHOICE' || q.type === 'CHECKBOX') && (() => {
                const counts: Record<string, number> = {};
                for (const a of qAnswers) {
                  const vals = Array.isArray(a) ? a : [a];
                  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
                }
                return (
                  <div className="space-y-2">
                    {(q.options || []).map(opt => {
                      const count = counts[opt] || 0;
                      const pct = totalResponses > 0 ? Math.round((count / totalResponses) * 100) : 0;
                      return (
                        <div key={opt} className="flex items-center gap-3">
                          <span className="text-sm w-32 truncate">{opt}</span>
                          <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-6 bg-primary-500 rounded-full flex items-center pl-2" style={{ width: `${Math.max(pct, 2)}%` }}>
                              {pct > 10 && <span className="text-xs text-white font-medium">{pct}%</span>}
                            </div>
                          </div>
                          <span className="text-sm text-gray-500 dark:text-gray-300 w-16 text-right">{count} ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {q.type === 'RATING' && (() => {
                const nums = qAnswers.map(Number).filter(n => !isNaN(n));
                const avg = nums.length > 0 ? (nums.reduce((a: number, b: number) => a + b, 0) / nums.length).toFixed(1) : '—';
                return (
                  <div className="flex items-center gap-4">
                    <span className="text-3xl font-bold text-amber-500">{avg}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-300">/ {q.maxRating || 5} average from {nums.length} responses</span>
                  </div>
                );
              })()}

              {(q.type === 'SHORT_TEXT' || q.type === 'LONG_TEXT') && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {qAnswers.length === 0 ? <p className="text-sm text-gray-400">No responses</p> : qAnswers.map((a: string, i: number) => (
                    <div key={i} className="text-sm bg-gray-50 dark:bg-gray-800 rounded-md px-3 py-2">{a}</div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Individual Responses — for non-anonymous surveys */}
      {!survey.anonymous && responses.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Individual Responses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-500 dark:text-gray-300">
                    <th className="text-left p-2 font-medium">Employee</th>
                    {questions.map((q: any, i: number) => (
                      <th key={q.id} className="text-left p-2 font-medium">{i + 1}. {q.title}</th>
                    ))}
                    <th className="text-left p-2 font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {responses.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="p-2 font-medium whitespace-nowrap">
                        {r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : 'Unknown'}
                      </td>
                      {questions.map((q: any) => (
                        <td key={q.id} className="p-2 text-gray-600 dark:text-gray-300 max-w-[200px] truncate">
                          {Array.isArray(r.answers[q.id]) ? r.answers[q.id].join(', ') : String(r.answers[q.id] ?? '—')}
                        </td>
                      ))}
                      <td className="p-2 text-gray-400 text-xs whitespace-nowrap">
                        {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {survey.anonymous && (
        <p className="text-xs text-gray-400 text-center">This survey is anonymous — individual responses are not linked to employees.</p>
      )}
    </div>
  );
}

// ─── Main Page ───
export default function SurveysPage() {
  const [view, setView] = useState<View>('list');
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const [editSurvey, setEditSurvey] = useState<any>(null);
  const { data: session } = useSession();

  const utils = trpc.useUtils();
  const { data: surveys, isLoading } = trpc.surveys.list.useQuery();
  const publishMutation = trpc.surveys.publish.useMutation({ onSuccess: () => utils.surveys.list.invalidate() });
  const closeMutation = trpc.surveys.close.useMutation({ onSuccess: () => utils.surveys.list.invalidate() });
  const deleteMutation = trpc.surveys.delete.useMutation({ onSuccess: () => utils.surveys.list.invalidate() });

  if (view === 'create') {
    return <div className="max-w-3xl mx-auto"><SurveyBuilder onClose={() => { setView('list'); setEditSurvey(null); }} editSurvey={editSurvey} /></div>;
  }

  if (view === 'fill' && selectedSurveyId) {
    return <div className="max-w-2xl mx-auto"><SurveyFillForm surveyId={selectedSurveyId} onClose={() => { setView('list'); setSelectedSurveyId(null); }} /></div>;
  }

  if (view === 'results' && selectedSurveyId) {
    return <div className="max-w-3xl mx-auto"><SurveyResults surveyId={selectedSurveyId} onClose={() => { setView('list'); setSelectedSurveyId(null); }} /></div>;
  }

  const statusVariant = (s: string) => s === 'ACTIVE' ? 'success' : s === 'COMPLETED' ? 'secondary' : 'outline';
  const canManageSurveys = session?.user?.role === 'SUPER_ADMIN' || session?.user?.role === 'ADMIN' || session?.user?.role === 'HR' || session?.user?.role === 'IT';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Surveys</h1>
        {canManageSurveys && (
          <Button onClick={() => { setEditSurvey(null); setView('create'); }} className="gap-2">
            <Plus size={16} /> Create Survey
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />)}
        </div>
      )}

      {!isLoading && (!surveys || surveys.length === 0) && (
        <div className="text-center py-16 text-gray-500 dark:text-gray-300">
          <BarChart3 size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No surveys yet.</p>
          <p className="text-sm mt-1">Create your first survey to start collecting feedback.</p>
        </div>
      )}

      {!isLoading && surveys && (
        <div className="space-y-3">
          {surveys.map((survey: any) => {
            const questions = JSON.parse(survey.questions || '[]');
            return (
              <Card key={survey.id} className="group">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold truncate">{survey.title}</h3>
                        <Badge variant={statusVariant(survey.status)}>{survey.status}</Badge>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-300 mt-1">
                        {questions.length} question{questions.length !== 1 ? 's' : ''} · {survey._count.responses} response{survey._count.responses !== 1 ? 's' : ''}
                        {survey.creator && ` · by ${survey.creator.firstName} ${survey.creator.lastName}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {survey.status === 'ACTIVE' && (
                        <Button size="sm" variant="outline" onClick={() => { setSelectedSurveyId(survey.id); setView('fill'); }} className="gap-1">
                          <Send size={14} /> Fill
                        </Button>
                      )}
                      {survey.status !== 'DRAFT' && canManageSurveys && (
                        <Button size="sm" variant="outline" onClick={() => { setSelectedSurveyId(survey.id); setView('results'); }} className="gap-1">
                          <BarChart3 size={14} /> Results
                        </Button>
                      )}
                      {survey.status === 'DRAFT' && canManageSurveys && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => { setEditSurvey({ ...survey, questions }); setView('create'); }} className="gap-1">
                            <Eye size={14} /> Edit
                          </Button>
                          <Button size="sm" onClick={() => publishMutation.mutate({ id: survey.id })} className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                            Publish
                          </Button>
                        </>
                      )}
                      {survey.status === 'ACTIVE' && canManageSurveys && (
                        <Button size="sm" variant="outline" onClick={() => closeMutation.mutate({ id: survey.id })}>
                          Close
                        </Button>
                      )}
                      {canManageSurveys && (
                        <Button size="sm" variant="outline" onClick={() => { if (confirm('Delete this survey?')) deleteMutation.mutate({ id: survey.id }); }} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </div>
                  </div>

                  {survey.status !== 'DRAFT' && survey._count.responses > 0 && (
                    <div className="mt-3 h-2 bg-gray-100 dark:bg-gray-800 rounded-full">
                      <div className="h-2 bg-primary-500 rounded-full transition-all" style={{ width: `${Math.min(survey._count.responses * 3, 100)}%` }} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
