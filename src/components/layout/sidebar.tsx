"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Menu, X, Home, Users, UserCheck, UserMinus, Calendar, TrendingUp, Briefcase, BarChart3, FileText, Settings, Network, ClipboardList, LayoutDashboard, Ticket, Monitor, Key } from "lucide-react";
import { Button } from "@/components/ui/button";

const HR_ONLY_HREFS = new Set(['/analytics', '/reports']);
const IT_ALLOWED_HREFS = new Set(['/onboarding', '/offboarding']);
const IT_SECTION_HREFS = new Set(['/it-assets', '/it-licenses']);

const navigationItems = [
  { label: "Home", href: "/home", icon: Home },
  { label: "People", href: "/people", icon: Users },
  { label: "Org Chart", href: "/org-chart", icon: Network },
  { label: "Onboarding", href: "/onboarding", icon: UserCheck },
  { label: "Offboarding", href: "/offboarding", icon: UserMinus },
  { label: "Time Off", href: "/time-off", icon: Calendar },
  { label: "Surveys", href: "/surveys", icon: BarChart3 },
  { label: "Analytics", href: "/analytics", icon: TrendingUp },
  { label: "Reports", href: "/reports", icon: ClipboardList },
  { label: "Expenses", href: "/expenses", icon: FileText },
  { label: "HR Portal", href: "/hr-portal", icon: LayoutDashboard },
  { label: "IT Tickets", href: "/it-tickets", icon: Ticket },
  { label: "IT Assets", href: "/it-assets", icon: Monitor },
  { label: "IT Licenses", href: "/it-licenses", icon: Key },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const role = session?.user?.role;
  const isHrOrAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'HR';
  const isOperator = role === 'OPERATOR';
  const isIT = role === 'IT';

  const visibleItems = navigationItems.filter(item => {
    if (HR_ONLY_HREFS.has(item.href)) return isHrOrAdmin;
    if (IT_ALLOWED_HREFS.has(item.href)) return isHrOrAdmin || isOperator || isIT;
    if (IT_SECTION_HREFS.has(item.href)) return isIT || role === 'SUPER_ADMIN';
    return true;
  });

  return (
    <>
      <div className="md:hidden fixed top-4 left-4 z-50">
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)} className="bg-white dark:bg-charcoal-900 text-charcoal-900 dark:text-white">
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </Button>
      </div>
      <aside className={`fixed left-0 top-0 h-full w-64 bg-charcoal-900 text-white flex flex-col transition-transform z-40 ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <div className="p-6 border-b border-charcoal-700">
          <Link href="/home" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-orange-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">DP</span>
            </div>
            <span className="font-bold text-lg">Dpeople</span>
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-2 px-3">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (<li key={item.href}><Link href={item.href}><Button variant={active ? "default" : "ghost"} className={`w-full justify-start gap-3 ${active ? "bg-primary-500 hover:bg-primary-600" : "hover:bg-charcoal-700"}`} onClick={() => setIsOpen(false)}><Icon size={18} /><span>{item.label}</span></Button></Link></li>);
            })}
          </ul>
        </nav>
      </aside>
    </>
  );
}
