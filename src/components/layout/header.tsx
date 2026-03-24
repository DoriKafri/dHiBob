"use client";
import { useState } from "react";
import { Search, Bell, User, LogOut, Settings, HelpCircle } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function Header() {
  const [notificationCount] = useState(3);
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 h-16 md:ml-64">
      <div className="h-full px-4 md:px-6 flex items-center justify-between gap-4">
        <div className="flex-1 max-w-md hidden md:flex items-center">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <Input placeholder="Search employees, documents..." className="pl-10 bg-gray-50 border-gray-200" />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Button variant="ghost" size="icon" className="relative">
              <Bell size={20} className="text-gray-700" />
              {notificationCount > 0 && <span className="absolute top-1 right-1 w-5 h-5 bg-primary text-white text-xs rounded-full flex items-center justify-center font-bold">{notificationCount}</span>}
            </Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2">
                <Avatar className="h-8 w-8"><AvatarFallback>JS</AvatarFallback></Avatar>
                <span className="hidden md:inline text-sm font-medium">Jane Smith</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Jane Smith</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem><User size={16} className="mr-2" />My Profile</DropdownMenuItem>
              <DropdownMenuItem><Settings size={16} className="mr-2" />Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600"><LogOut size={16} className="mr-2" />Sign Out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
