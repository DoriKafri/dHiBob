"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { trpc } from "@/lib/trpc";
import { Search, Send } from "lucide-react";

interface ShoutoutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShoutoutModal({ isOpen, onClose }: ShoutoutModalProps) {
  const [content, setContent] = useState("");
  const [search, setSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<{ id: string; firstName: string; lastName: string; avatar: string | null } | null>(null);

  const utils = trpc.useUtils();

  const { data: employeesData, isLoading: isEmployeesLoading } = trpc.employee.list.useQuery(
    { search, limit: 5 },
    { enabled: search.length > 0 }
  );

  const createShoutout = trpc.home.createShoutout.useMutation({
    onSuccess: () => {
      utils.home.getFeed.invalidate();
      setContent("");
      setSelectedEmployee(null);
      setSearch("");
      onClose();
    },
  });

  const handlePost = () => {
    if (!selectedEmployee || !content.trim()) return;
    createShoutout.mutate({
      content,
      targetId: selectedEmployee.id,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Give a Shoutout</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Who are you recognizing?</label>
            {selectedEmployee ? (
              <div className="flex items-center justify-between p-2 border rounded-md bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={selectedEmployee.avatar || undefined} />
                    <AvatarFallback>{selectedEmployee.firstName[0]}{selectedEmployee.lastName[0]}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{selectedEmployee.firstName} {selectedEmployee.lastName}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedEmployee(null)}>Change</Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search for an employee..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
                {search.length > 0 && employeesData?.employees && (
                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-charcoal-800 border rounded-md shadow-lg max-h-[200px] overflow-y-auto">
                    {employeesData.employees.map((employee) => (
                      <button
                        key={employee.id}
                        className="flex items-center gap-2 w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-charcoal-700 text-left"
                        onClick={() => {
                          setSelectedEmployee(employee);
                          setSearch("");
                        }}
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={employee.avatar || undefined} />
                          <AvatarFallback>{employee.firstName[0]}{employee.lastName[0]}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{employee.firstName} {employee.lastName}</span>
                      </button>
                    ))}
                  </div>
                )}
                {search.length > 0 && !isEmployeesLoading && employeesData?.employees.length === 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-charcoal-800 border rounded-md shadow-lg p-4 text-center text-sm text-gray-500">
                    No employees found
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">What would you like to say?</label>
            <Textarea
              placeholder="e.g., Amazing work on the project! Thanks for going above and beyond."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            onClick={handlePost} 
            disabled={!selectedEmployee || !content.trim() || createShoutout.isLoading}
            className="bg-primary-600 hover:bg-primary-700 text-white gap-2"
          >
            {createShoutout.isLoading ? "Posting..." : (
              <>
                <Send className="h-4 w-4" />
                Post Shoutout
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
