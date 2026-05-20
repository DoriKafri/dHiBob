"use client";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-charcoal-900 transition-colors duration-200">
      <Sidebar />
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 overflow-auto"><div className="p-4 md:p-8">{children}</div></main>
      </div>
    </div>
  );
}
