import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { Heart } from "lucide-react";

interface ShoutoutCardProps {
  data: {
    id: string;
    content: string;
    createdAt: Date;
    author: {
      firstName: string;
      lastName: string;
      avatar?: string | null;
    };
    target?: {
      firstName: string;
      lastName: string;
      avatar?: string | null;
    } | null;
  };
}

export function ShoutoutCard({ data }: ShoutoutCardProps) {
  const { author, target, content, createdAt } = data;

  return (
    <Card className="p-6 border-none shadow-sm bg-white dark:bg-charcoal-800 transition-all hover:shadow-md">
      <div className="flex items-start gap-4">
        <div className="flex -space-x-3 shrink-0">
          <Avatar className="h-12 w-12 border-2 border-white dark:border-charcoal-800 ring-2 ring-orange/10">
            <AvatarImage src={author.avatar || undefined} alt={`${author.firstName} ${author.lastName}`} />
            <AvatarFallback className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 font-bold">
              {author.firstName[0]}{author.lastName[0]}
            </AvatarFallback>
          </Avatar>
          {target && (
            <Avatar className="h-12 w-12 border-2 border-white dark:border-charcoal-800 ring-2 ring-orange/10">
              <AvatarImage src={target.avatar || undefined} alt={`${target.firstName} ${target.lastName}`} />
              <AvatarFallback className="bg-cherry-100 text-cherry-700 dark:bg-cherry-900/30 dark:text-cherry-400 font-bold">
                {target.firstName[0]}{target.lastName[0]}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium text-charcoal-900 dark:text-white truncate">
              <span className="font-bold">{author.firstName} {author.lastName}</span>
              {target ? (
                <> shouted out <span className="font-bold">{target.firstName} {target.lastName}</span></>
              ) : (
                <> shared a shoutout</>
              )}
            </div>
            <span className="text-xs text-charcoal-500 whitespace-nowrap">
              {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
            </span>
          </div>
          <div className="mt-3 p-4 bg-orange/5 dark:bg-orange/10 rounded-xl border-l-4 border-orange">
            <p className="text-sm text-charcoal-700 dark:text-charcoal-200 leading-relaxed italic">
              &quot;{content}&quot;
            </p>
          </div>
          <div className="mt-4 flex items-center gap-4 text-charcoal-500 dark:text-charcoal-400">
             <button className="flex items-center gap-1.5 hover:text-cherry transition-colors text-xs font-medium group">
               <Heart className="h-4 w-4 group-hover:fill-cherry group-hover:text-cherry" />
               Reactions
             </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
