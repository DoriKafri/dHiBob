import { ShoutoutCard } from "./shoutout-card";
import { CelebrationCard } from "./celebration-card";
import { NewJoinerCard } from "./new-joiner-card";

export type FeedItemType = 'SHOUTOUT' | 'BIRTHDAY' | 'ANNIVERSARY' | 'NEW_JOINER';

export interface FeedItem {
  type: FeedItemType;
  date: Date | string;
  data: any;
}

interface FeedCardProps {
  item: FeedItem;
}

export function FeedCard({ item }: FeedCardProps) {
  const date = typeof item.date === 'string' ? new Date(item.date) : item.date;

  switch (item.type) {
    case 'SHOUTOUT':
      return <ShoutoutCard data={{ ...item.data, createdAt: date }} />;
    case 'BIRTHDAY':
    case 'ANNIVERSARY':
      return <CelebrationCard type={item.type} data={item.data} />;
    case 'NEW_JOINER':
      return <NewJoinerCard data={{ ...item.data, startDate: date }} />;
    default:
      return null;
  }
}
