import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import { PartyPopper, MapPin } from "lucide-react";

interface NewJoinerCardProps {
  data: {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string | null;
    department?: { name: string } | null;
    startDate: Date;
  };
}

export function NewJoinerCard({ data }: NewJoinerCardProps) {
  return (
    <Card className="p-0 border-none shadow-sm overflow-hidden bg-white dark:bg-charcoal-800 group hover:shadow-md transition-all">
      <div className="bg-primary-500 h-24 relative flex items-center justify-center overflow-hidden">
        {/* Decorative pattern */}
        <div className="absolute inset-0 opacity-20 flex flex-wrap gap-4 p-2 pointer-events-none">
          {Array.from({ length: 12 }).map((_, i) => (
             <PartyPopper key={i} className="h-8 w-8 text-white transform rotate-12" />
          ))}
        </div>
        <h3 className="text-2xl font-black text-white relative z-10 tracking-wider">WELCOME!</h3>
      </div>
      
      <div className="px-6 pb-6 -mt-10 relative z-10 flex flex-col items-center text-center">
        <Avatar className="h-20 w-20 border-4 border-white dark:border-charcoal-800 shadow-md mb-3">
          <AvatarImage src={data.avatar || undefined} alt={`${data.firstName} ${data.lastName}`} />
          <AvatarFallback className="text-xl font-bold bg-charcoal-100 dark:bg-charcoal-700 text-charcoal-600 dark:text-charcoal-300">
            {data.firstName[0]}{data.lastName[0]}
          </AvatarFallback>
        </Avatar>
        
        <h4 className="text-xl font-bold text-charcoal-900 dark:text-white">
          {data.firstName} {data.lastName}
        </h4>
        
        <div className="mt-2 space-y-1">
          {data.department && (
            <div className="text-sm font-medium text-charcoal-600 dark:text-charcoal-400 flex items-center justify-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-cherry" />
              <span>{data.department.name}</span>
            </div>
          )}
          <p className="text-xs text-charcoal-500">
            Joined on {format(new Date(data.startDate), "MMMM do, yyyy")}
          </p>
        </div>
        
        <button className="mt-5 w-full py-2 bg-charcoal-900 dark:bg-charcoal-700 text-white rounded-lg text-sm font-bold hover:bg-charcoal-800 dark:hover:bg-charcoal-600 transition-colors">
          Say Hello
        </button>
      </div>
    </Card>
  );
}
