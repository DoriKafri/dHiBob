import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Cake, Sparkles, Trophy } from "lucide-react";

interface CelebrationCardProps {
  type: 'BIRTHDAY' | 'ANNIVERSARY';
  data: {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string | null;
    years?: number;
  };
}

export function CelebrationCard({ type, data }: CelebrationCardProps) {
  const isBirthday = type === 'BIRTHDAY';

  return (
    <Card className="p-6 border-none shadow-sm overflow-hidden relative group hover:shadow-md transition-all bg-white dark:bg-charcoal-800">
      {/* Festive Background elements */}
      <div className="absolute top-0 right-0 p-1 pointer-events-none opacity-5 dark:opacity-10 transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform">
        {isBirthday ? <Cake className="h-32 w-32 text-cherry" /> : <Trophy className="h-32 w-32 text-orange" />}
      </div>
      
      <div className="flex items-center gap-4 relative z-10">
        <Avatar className="h-16 w-16 border-4 border-white dark:border-charcoal-800 shadow-sm ring-2 ring-primary-100 dark:ring-primary-900/20">
          <AvatarImage src={data.avatar || undefined} />
          <AvatarFallback className="text-lg bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-400 font-bold">
            {data.firstName[0]}{data.lastName[0]}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-lg font-bold text-charcoal-900 dark:text-white truncate">
              {data.firstName} {data.lastName}
            </h4>
            {isBirthday ? (
               <Cake className="h-5 w-5 text-cherry animate-bounce" />
            ) : (
               <Trophy className="h-5 w-5 text-orange animate-pulse" />
            )}
          </div>
          <div className="text-sm text-charcoal-600 dark:text-charcoal-400 flex items-center gap-1.5 mt-0.5">
            <Sparkles className="h-3.5 w-3.5 text-orange shrink-0" />
            <span className="truncate">
              {isBirthday ? (
                "Is celebrating a birthday!"
              ) : (
                `Is celebrating ${data.years} ${data.years === 1 ? 'year' : 'years'} at the company!`
              )}
            </span>
          </div>
          <button className="mt-3 text-xs font-semibold text-cherry dark:text-cherry-400 hover:underline">
            Say happy {isBirthday ? 'birthday' : 'anniversary'}
          </button>
        </div>
      </div>
    </Card>
  );
}
