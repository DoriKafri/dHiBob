"use client";
import { useState, useEffect } from "react";
import { Search, User, LogOut, Settings } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TasksPopover } from "./tasks-popover";
import { NotificationsPopover } from "./notifications-popover";
import { ThemeToggle } from "./theme-toggle";
import { CommandPalette } from "./command-palette";

export default function Header() {
  const { data: session } = useSession();
  const router = useRouter();
  const userName = session?.user?.name || 'User';
  const initials = userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 bg-white dark:bg-charcoal-900 border-b border-gray-200 dark:border-charcoal-700 h-16 md:ml-64 transition-colors duration-200">
        <div className="h-full px-4 md:px-6 flex items-center justify-between gap-4">
          <div className="flex-1 max-w-md hidden md:flex items-center">
            <button
              onClick={() => setPaletteOpen(true)}
              className="relative w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 bg-gray-50 dark:bg-charcoal-800 border border-gray-200 dark:border-charcoal-700 rounded-md hover:border-gray-300 dark:hover:border-charcoal-600 transition-colors"
            >
              <Search size={16} />
              <span>Search employees, pages, tickets...</span>
              <kbd className="ml-auto hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-mono bg-gray-200/60 dark:bg-charcoal-700 rounded">⌘K</kbd>
            </button>
          </div>
          <div className="flex items-center gap-3">
            {/* Mobile search button */}
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setPaletteOpen(true)}>
              <Search size={18} />
            </Button>
            <ThemeToggle />
            <TasksPopover />
            <NotificationsPopover />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2">
                  <Avatar className="h-8 w-8"><AvatarFallback className="text-xs font-bold">{initials}</AvatarFallback></Avatar>
                  <span className="hidden md:inline text-sm font-medium">{userName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{userName}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { if (session?.user?.employeeId) router.push(`/people/${session.user.employeeId}`); }}>
                  <User size={16} className="mr-2" />My Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/settings')}>
                  <Settings size={16} className="mr-2" />Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600" onClick={() => signOut({ callbackUrl: '/login' })}>
                  <LogOut size={16} className="mr-2" />Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
