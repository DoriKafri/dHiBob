"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Home, Users, UserCheck, Calendar, DollarSign, TrendingUp, Gift, Briefcase, BookOpen, BarChart3, Users2, FileText, Settings, LogOut } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const navigationItems = [
  { label: "Home", href: "/home", icon: Home },
  { label: "People", href: "/people", icon: Users },
  { label: "Onboarding", href: "/onboarding", icon: UserCheck },
  { label: "Time Off", href: "/time-off", icon: Calendar },
  { label: "Payroll", href: "/payroll", icon: DollarSign },
  { label: "Performance", href: "/performance", icon: TrendingUp },
  { label: "Compensation", href: "/compensation", icon: Gift },
  { label: "Hiring", href: "/hiring", icon: Briefcase },
  { label: "Learning", href: "/learning", icon: BookOpen },
  { label: "Surveys", href: "/surveys", icon: BarChart3 },
  { label: "Analytics", href: "/analytics", icon: TrendingUp },
  { label: "Workforce Planning", href: "/workforce-planning", icon: Users2 },
  { label: "Documents", href: "/documents", icon: FileText },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <div className="md:hidden fixed top-4 left-4 z-50">
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)} className="bg-white">
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </Button>
      </div>
      <aside className={\x60fixed left-0 top-0 h-full w-64 bg-charcoal text-white flex flex-col transition-transform z-40 \x24{isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}\x60}>
        <div className="p-6 border-b border-gray-700">
          <Link href="/home" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary to-orange-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">DB</span>
            </div>
            <span className="font-bold text-lg">DHiBob</span>
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-2 px-3">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (<li key={item.href}><Link href={item.href}><Button variant={active ? "default" : "ghost"} className={\x60w-full justify-start gap-3 \x24{active ? "bg-primary hover:bg-primary" : "hover:bg-gray-700"}\x60} onClick={() => setIsOpen(false)}><Icon size={18} /><span>{item.label}</span></Button></Link></li>);
            })}
          </ul>
        </nav>
        <div className="p-4 border-t border-gray-700">
          <div className="flex items-center gap-3">
            <Avatar><AvatarFallback>JS</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">Jane Smith</p><p className="text-xs text-gray-400 truncate">HR Manager</p></div>
          </div>
          <Button variant="ghost" className="w-full justify-start gap-2 mt-4 text-red-400 hover:text-red-300"><LogOut size={16} /><span>Logout</span></Button>
        </div>
      </aside>
    </>
  );
}
