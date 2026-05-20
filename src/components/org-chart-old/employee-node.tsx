"use client";
import { Handle, Position } from "reactflow";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface EmployeeNodeData {
  firstName: string;
  lastName: string;
  jobTitle?: string;
  avatar?: string;
}

export function EmployeeNode({ data }: { data: EmployeeNodeData }) {
  const name = `${data.firstName} ${data.lastName}`;
  const jobTitle = data.jobTitle || "No Title";

  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-white dark:bg-charcoal-800 border border-gray-200 dark:border-charcoal-700 min-w-[200px]">
      <Handle 
        type="target" 
        position={Position.Top} 
        className="w-2 h-2 !bg-primary-500" 
        aria-label="Parent connection"
      />
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          {data.avatar && <AvatarImage src={data.avatar} alt={name} />}
          <AvatarFallback>
            {data.firstName?.[0] || ""}{data.lastName?.[0] || ""}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate dark:text-white">{name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{jobTitle}</p>
        </div>
      </div>
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="w-2 h-2 !bg-primary-500" 
        aria-label="Child connection"
      />
    </div>
  );
}
