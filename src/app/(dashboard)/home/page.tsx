"use client";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import { FeedCard } from "@/components/home/feed-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Users, CheckSquare, Calendar, ClipboardList, Cake, Trophy, UserPlus, Bell } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

export default function HomePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [greeting, setGreeting] = useState("Good morning");
  const { data: feed, isLoading: feedLoading } = trpc.home.getFeed.useQuery();
  const { data: stats } = trpc.home.getStats.useQuery();
  const { data: upcomingEvents } = trpc.home.getUpcomingEvents.useQuery();
  const { data: todayAbsences } = trpc.home.getTodayAbsences.useQuery();

  const userName = session?.user?.name?.split(' ')[0] || 'there';

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 12 && hour < 17) setGreeting("Good afternoon");
    else if (hour >= 17) setGreeting("Good evening");
  }, []);

  // Split feed into categories
  const newJoiners = (feed || []).filter((f: any) => f.type === 'NEW_JOINER');
  const announcements = (feed || []).filter((f: any) => f.type === 'HR_ANNOUNCEMENT');
  const birthdays = (upcomingEvents || []).filter((e: any) => e.type === 'BIRTHDAY');
  const anniversaries = (upcomingEvents || []).filter((e: any) => e.type === 'ANNIVERSARY');

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
          {greeting}, {userName}!
        </h1>
        <p className="text-gray-500 dark:text-gray-300 font-medium">
          Here&apos;s what is happening in your company today.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-none shadow-sm bg-white dark:bg-charcoal-900 cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/people')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30"><Users size={18} className="text-blue-600" /></div>
            <div><p className="text-2xl font-bold">{stats?.headcount ?? '—'}</p><p className="text-[11px] text-gray-500 dark:text-gray-300">Employees</p></div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-charcoal-900 cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/onboarding')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30"><CheckSquare size={18} className="text-amber-600" /></div>
            <div><p className="text-2xl font-bold">{stats?.myTasks ?? '—'}</p><p className="text-[11px] text-gray-500 dark:text-gray-300">My Tasks</p></div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-charcoal-900 cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/time-off')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30"><Calendar size={18} className="text-orange-600" /></div>
            <div><p className="text-2xl font-bold">{stats?.pendingTimeOff ?? '—'}</p><p className="text-[11px] text-gray-500 dark:text-gray-300">Pending Leave</p></div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-charcoal-900 cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/surveys')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30"><ClipboardList size={18} className="text-purple-600" /></div>
            <div><p className="text-2xl font-bold">{stats?.activeSurveys ?? '—'}</p><p className="text-[11px] text-gray-500 dark:text-gray-300">Active Surveys</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Who's Out Today — prominent at the top */}
      <Card className="border-none shadow-sm bg-white dark:bg-charcoal-900">
        <CardHeader className="pb-2 px-5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calendar size={18} className="text-orange-500" />
            Who&apos;s Out Today
            {todayAbsences && todayAbsences.length > 0 && (
              <span className="ml-1 px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 text-xs rounded-full font-bold">{todayAbsences.length}</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {!todayAbsences || todayAbsences.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-2">Everyone&apos;s in today!</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {todayAbsences.map((a: any) => (
                <div key={a.employeeId} className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-charcoal-800 rounded-lg cursor-pointer hover:shadow-sm" onClick={() => router.push(`/people/${a.employeeId}`)}>
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.color || '#6b7280' }} />
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="text-[10px] font-bold">{a.name.split(' ').map((n: string) => n[0]).join('')}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-xs font-medium">{a.name}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">{a.leaveType} · {format(new Date(a.endDate), 'MMM d')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Content — 50/50 split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left: Announcements + New Employees */}
        <div className="space-y-6">
          {/* Welcome New Employees (last 7 days) */}
          {newJoiners.length > 0 && (
            <Card className="border-none shadow-sm bg-white dark:bg-charcoal-900">
              <CardHeader className="pb-2 px-5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <UserPlus size={18} className="text-emerald-500" />
                  Welcome New Employees
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <div className="space-y-3">
                  {newJoiners.map((j: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-charcoal-800 rounded-lg px-2 py-2 -mx-2" onClick={() => router.push(`/people/${j.data.id}`)}>
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className="bg-emerald-100 text-emerald-600 font-bold text-sm">
                          {j.data.firstName?.[0]}{j.data.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-semibold">{j.data.firstName} {j.data.lastName}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-300">{j.data.department?.name || ''} · Joined {format(new Date(j.date), 'MMM d')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* HR Announcements / Notifications */}
          <Card className="border-none shadow-sm bg-white dark:bg-charcoal-900">
            <CardHeader className="pb-2 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Bell size={18} className="text-blue-500" />
                Announcements
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              {feedLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
                  <Loader2 className="animate-spin" size={20} />
                  <span className="text-sm">Loading...</span>
                </div>
              ) : announcements.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">No announcements yet.</p>
              ) : (
                <div className="space-y-3">
                  {announcements.slice(0, 8).map((item: any, i: number) => (
                    <FeedCard key={i} item={item} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Birthdays + Anniversaries (bigger, more prominent) */}
        <div className="space-y-6">
          {/* Birthdays */}
          <Card className="border-none shadow-sm bg-white dark:bg-charcoal-900">
            <CardHeader className="pb-3 px-5 border-b border-gray-50 dark:border-charcoal-800">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <div className="p-2 rounded-lg bg-pink-100 dark:bg-pink-900/30">
                  <Cake size={22} className="text-pink-500" />
                </div>
                Upcoming Birthdays
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 px-5 pb-4">
              {birthdays.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No upcoming birthdays</p>
              ) : (
                <div className="space-y-3">
                  {birthdays.slice(0, 8).map((event: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-pink-50/50 dark:bg-pink-900/10 rounded-lg">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className="bg-pink-100 text-pink-600 font-bold text-sm">
                          {event.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{event.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-300">{format(new Date(event.date), 'EEEE, MMMM d')}</p>
                      </div>
                      <span className="text-2xl">🎂</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Anniversaries */}
          <Card className="border-none shadow-sm bg-white dark:bg-charcoal-900">
            <CardHeader className="pb-3 px-5 border-b border-gray-50 dark:border-charcoal-800">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                  <Trophy size={22} className="text-amber-500" />
                </div>
                Work Anniversaries
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 px-5 pb-4">
              {anniversaries.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No upcoming anniversaries</p>
              ) : (
                <div className="space-y-3">
                  {anniversaries.slice(0, 8).map((event: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-amber-50/50 dark:bg-amber-900/10 rounded-lg">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className="bg-amber-100 text-amber-600 font-bold text-sm">
                          {event.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{event.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-300">{event.detail} · {format(new Date(event.date), 'EEEE, MMMM d')}</p>
                      </div>
                      <span className="text-2xl">🏆</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
