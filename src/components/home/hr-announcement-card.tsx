"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Megaphone, Link2, FileText, ExternalLink } from "lucide-react";
import { format } from "date-fns";

const TYPE_ICONS: Record<string, typeof Megaphone> = {
  LINK: Link2,
  ANNOUNCEMENT: Megaphone,
  FILE: FileText,
};

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  LINK: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400' },
  ANNOUNCEMENT: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-600 dark:text-orange-400' },
  FILE: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-600 dark:text-green-400' },
};

interface HrAnnouncementData {
  id: string;
  title: string;
  content?: string;
  itemType: string;
  section: string;
  url?: string;
  author?: { id: string; firstName: string; lastName: string; avatar?: string | null };
  createdAt: Date;
}

export function HrAnnouncementCard({ data }: { data: HrAnnouncementData }) {
  const Icon = TYPE_ICONS[data.itemType] || Megaphone;
  const colors = TYPE_COLORS[data.itemType] || TYPE_COLORS.ANNOUNCEMENT;
  const authorName = data.author ? `${data.author.firstName} ${data.author.lastName}` : 'HR';
  const initials = data.author ? `${data.author.firstName[0]}${data.author.lastName[0]}` : 'HR';

  return (
    <Card className="border-none shadow-sm bg-white dark:bg-charcoal-900 border-l-4 border-l-orange-400 dark:border-l-orange-500">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg shrink-0 ${colors.bg}`}>
            <Icon size={18} className={colors.text} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-500">HR Update</span>
              <span className="text-[10px] text-gray-400">· {data.section}</span>
            </div>
            <h3 className="font-semibold text-sm dark:text-white">{data.title}</h3>
            {data.content && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-3">{data.content}</p>
            )}
            {data.url && (
              <a href={data.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600 mt-2">
                Open link <ExternalLink size={12} />
              </a>
            )}
            <div className="flex items-center gap-2 mt-3">
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[8px] font-bold bg-orange-100 text-orange-600">{initials}</AvatarFallback>
              </Avatar>
              <span className="text-[11px] text-gray-400">{authorName} · {format(data.createdAt, 'MMM d, yyyy')}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
