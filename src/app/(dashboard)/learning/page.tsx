"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Plus, Clock, Award, Users, Play, ExternalLink, CheckCircle2, Circle, ArrowLeft, Trash2, BookOpen, Search, Video, Link2, FileText, X } from "lucide-react";

type LessonType = 'VIDEO' | 'LINK' | 'DOCUMENT' | 'ARTICLE';
type Lesson = { id: string; title: string; type: LessonType; url: string; duration?: string };
type View = 'catalog' | 'course' | 'create';

const CATEGORIES = ['Technical', 'Leadership', 'Compliance', 'Soft Skills', 'Product', 'Design', 'General'];

const CATEGORY_COLORS: Record<string, string> = {
  Technical: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  Leadership: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  Compliance: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'Soft Skills': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  Product: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  Design: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  General: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const LESSON_ICONS: Record<LessonType, typeof Video> = { VIDEO: Video, LINK: Link2, DOCUMENT: FileText, ARTICLE: BookOpen };

function genId() { return Math.random().toString(36).slice(2, 10); }

// ─── Course Builder ───
function CourseBuilder({ onClose, editCourse }: { onClose: () => void; editCourse?: any }) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState(editCourse?.title || '');
  const [description, setDescription] = useState(editCourse?.description || '');
  const [category, setCategory] = useState(editCourse?.category || 'General');
  const [duration, setDuration] = useState(editCourse?.duration || '');
  const [lessons, setLessons] = useState<Lesson[]>(editCourse?.lessons || []);

  const createMutation = trpc.learning.create.useMutation({ onSuccess: () => { utils.learning.list.invalidate(); onClose(); } });
  const updateMutation = trpc.learning.update.useMutation({ onSuccess: () => { utils.learning.list.invalidate(); onClose(); } });

  function addLesson() {
    setLessons([...lessons, { id: genId(), title: '', type: 'VIDEO', url: '', duration: '' }]);
  }

  function updateLesson(idx: number, updates: Partial<Lesson>) {
    setLessons(lessons.map((l, i) => i === idx ? { ...l, ...updates } : l));
  }

  function removeLesson(idx: number) {
    setLessons(lessons.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!title.trim()) return;
    const validLessons = lessons.filter(l => l.title.trim() && l.url.trim());
    if (editCourse) {
      await updateMutation.mutateAsync({ id: editCourse.id, title, description, category, duration, lessons: validLessons });
    } else {
      await createMutation.mutateAsync({ title, description, category, duration, lessons: validLessons });
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md"><ArrowLeft size={20} /></button>
        <h1 className="text-2xl font-bold">{editCourse ? 'Edit Course' : 'Create Course'}</h1>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Course title" className="text-lg font-semibold" />
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Course description..." className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 min-h-[60px]" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Duration</label>
              <Input value={duration} onChange={e => setDuration(e.target.value)} placeholder="e.g. 2 hours, 4 weeks" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-3">Lessons</h2>
        {lessons.map((lesson, idx) => (
          <Card key={lesson.id} className="mb-3">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <span className="text-sm font-bold text-gray-400 mt-2 w-6">{idx + 1}.</span>
                <div className="flex-1 space-y-3">
                  <div className="flex gap-3">
                    <Input value={lesson.title} onChange={e => updateLesson(idx, { title: e.target.value })} placeholder="Lesson title" className="flex-1" />
                    <select value={lesson.type} onChange={e => updateLesson(idx, { type: e.target.value as LessonType })} className="border rounded-md px-2 py-1.5 text-sm bg-white dark:bg-charcoal-800 dark:border-gray-700 w-32">
                      <option value="VIDEO">Video</option>
                      <option value="LINK">Link</option>
                      <option value="DOCUMENT">Document</option>
                      <option value="ARTICLE">Article</option>
                    </select>
                    <button onClick={() => removeLesson(idx)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-500"><Trash2 size={16} /></button>
                  </div>
                  <div className="flex gap-3">
                    <Input value={lesson.url} onChange={e => updateLesson(idx, { url: e.target.value })} placeholder="URL (YouTube, Google Drive, etc.)" className="flex-1" />
                    <Input value={lesson.duration || ''} onChange={e => updateLesson(idx, { duration: e.target.value })} placeholder="Duration" className="w-28" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        <button onClick={addLesson} className="flex items-center gap-2 text-sm text-primary-500 hover:text-primary-600 font-medium">
          <Plus size={14} /> Add lesson
        </button>
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={!title.trim() || createMutation.isLoading || updateMutation.isLoading}>
          {editCourse ? 'Save Changes' : 'Publish Course'}
        </Button>
      </div>
    </div>
  );
}

// ─── Course Detail View ───
function CourseDetail({ courseId, onBack }: { courseId: string; onBack: () => void }) {
  const utils = trpc.useUtils();
  const { data: course, isLoading } = trpc.learning.getById.useQuery({ id: courseId });
  const enrollMutation = trpc.learning.enroll.useMutation({ onSuccess: () => { utils.learning.getById.invalidate({ id: courseId }); utils.learning.list.invalidate(); } });
  const completeLessonMutation = trpc.learning.completeLesson.useMutation({ onSuccess: () => { utils.learning.getById.invalidate({ id: courseId }); utils.learning.list.invalidate(); } });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />)}</div>;
  if (!course) return <p>Course not found.</p>;

  const lessons = course.lessons as Lesson[];
  const enrollment = course.myEnrollment as any;
  const completedLessons: string[] = enrollment ? JSON.parse(enrollment.completedLessons || '[]') : [];
  const isEnrolled = !!enrollment;
  const progress = enrollment?.progress ?? 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300 hover:text-gray-700">
        <ArrowLeft size={16} /> Back to catalog
      </button>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <Badge className={CATEGORY_COLORS[course.category] || CATEGORY_COLORS.General}>{course.category}</Badge>
              <h1 className="text-2xl font-bold mt-2">{course.title}</h1>
              {course.description && <p className="text-gray-500 dark:text-gray-300 mt-2">{course.description}</p>}
              <div className="flex items-center gap-4 mt-3 text-sm text-gray-500 dark:text-gray-300">
                {course.duration && <span className="flex items-center gap-1"><Clock size={14} /> {course.duration}</span>}
                <span className="flex items-center gap-1"><Users size={14} /> {course.enrolledCount} enrolled</span>
                <span className="flex items-center gap-1"><BookOpen size={14} /> {lessons.length} lesson{lessons.length !== 1 ? 's' : ''}</span>
              </div>
              {course.creator && <p className="text-xs text-gray-400 mt-2">Created by {course.creator.firstName} {course.creator.lastName}</p>}
            </div>
            {!isEnrolled && (
              <Button onClick={() => enrollMutation.mutate({ courseId })} disabled={enrollMutation.isLoading}>
                Enroll
              </Button>
            )}
          </div>

          {isEnrolled && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium">{progress}% complete</span>
                {progress >= 100 && <span className="flex items-center gap-1 text-amber-500"><Award size={14} /> Completed!</span>}
              </div>
              <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full">
                <div className="h-2 bg-emerald-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lessons */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Lessons</h2>
        {lessons.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-300 text-sm py-4">No lessons added yet.</p>
        ) : lessons.map((lesson, idx) => {
          const isCompleted = completedLessons.includes(lesson.id);
          const LessonIcon = LESSON_ICONS[lesson.type] || Link2;

          return (
            <Card key={lesson.id} className={`transition-colors ${isCompleted ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}>
              <CardContent className="p-4 flex items-center gap-4">
                {isEnrolled ? (
                  <button
                    onClick={() => { if (!isCompleted) completeLessonMutation.mutate({ courseId, lessonId: lesson.id }); }}
                    className={`shrink-0 ${isCompleted ? 'text-emerald-500' : 'text-gray-300 hover:text-emerald-400'}`}
                    title={isCompleted ? 'Completed' : 'Mark as complete'}
                  >
                    {isCompleted ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                  </button>
                ) : (
                  <span className="text-gray-300 shrink-0"><Circle size={22} /></span>
                )}
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm ${isCompleted ? 'line-through text-gray-400' : ''}`}>
                    {idx + 1}. {lesson.title}
                  </p>
                  {lesson.duration && <p className="text-xs text-gray-500 dark:text-gray-300">{lesson.duration}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-xs gap-1">
                    <LessonIcon size={12} /> {lesson.type}
                  </Badge>
                  <a href={lesson.url} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-primary-500">
                    <ExternalLink size={16} />
                  </a>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ───
export default function LearningPage() {
  const [view, setView] = useState<View>('catalog');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [editCourse, setEditCourse] = useState<any>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');

  const utils = trpc.useUtils();
  const { data: courses, isLoading } = trpc.learning.list.useQuery(
    { category: categoryFilter || undefined, search: search || undefined }
  );
  const { data: categories } = trpc.learning.categories.useQuery();
  const deleteMutation = trpc.learning.delete.useMutation({ onSuccess: () => utils.learning.list.invalidate() });

  if (view === 'create') {
    return <CourseBuilder onClose={() => { setView('catalog'); setEditCourse(null); }} editCourse={editCourse} />;
  }

  if (view === 'course' && selectedCourseId) {
    return <CourseDetail courseId={selectedCourseId} onBack={() => { setView('catalog'); setSelectedCourseId(null); }} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Learning</h1>
        <Button onClick={() => { setEditCourse(null); setView('create'); }} className="gap-2">
          <Plus size={16} /> Create Course
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search courses..." className="pl-9" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setCategoryFilter('')} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${!categoryFilter ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200'}`}>
            All
          </button>
          {(categories || []).map((cat: string) => (
            <button key={cat} onClick={() => setCategoryFilter(cat)} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${categoryFilter === cat ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200'}`}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-48 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />)}
        </div>
      )}

      {!isLoading && (!courses || courses.length === 0) && (
        <div className="text-center py-16 text-gray-500 dark:text-gray-300">
          <BookOpen size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No courses found.</p>
          <p className="text-sm mt-1">{search || categoryFilter ? 'Try adjusting your filters.' : 'Create your first course to get started.'}</p>
        </div>
      )}

      {!isLoading && courses && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((course: any) => {
            const enrollment = course.myEnrollment;
            const progress = enrollment?.progress ?? 0;
            const isCompleted = enrollment?.status === 'COMPLETED';

            return (
              <Card key={course.id} className="group cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setSelectedCourseId(course.id); setView('course'); }}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <Badge className={CATEGORY_COLORS[course.category] || CATEGORY_COLORS.General}>{course.category}</Badge>
                    <div className="flex items-center gap-1">
                      {isCompleted && <Award size={18} className="text-amber-500" />}
                      <button
                        onClick={e => { e.stopPropagation(); if (confirm('Delete this course?')) deleteMutation.mutate({ id: course.id }); }}
                        className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-500 transition-opacity"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <h3 className="font-semibold mt-2">{course.title}</h3>
                  {course.description && <p className="text-sm text-gray-500 dark:text-gray-300 mt-1 line-clamp-2">{course.description}</p>}
                  <div className="flex items-center gap-3 mt-3 text-sm text-gray-500 dark:text-gray-300">
                    {course.duration && <span className="flex items-center gap-1"><Clock size={14} /> {course.duration}</span>}
                    <span className="flex items-center gap-1"><Users size={14} /> {course.enrolledCount}</span>
                    <span className="flex items-center gap-1"><BookOpen size={14} /> {course.lessons.length}</span>
                  </div>
                  {enrollment && (
                    <div className="mt-3">
                      <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full">
                        <div className="h-2 bg-emerald-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{progress}% complete</p>
                    </div>
                  )}
                  {!enrollment && (
                    <p className="text-xs text-primary-500 mt-3 font-medium">Click to enroll →</p>
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
