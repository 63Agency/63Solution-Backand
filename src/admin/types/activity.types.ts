export type ActivityType =
  | 'meeting_created'
  | 'lead_upserted'
  | 'broadcast_job';

export type ActivityItem = {
  type: ActivityType;
  at: string;
  title: string;
  href: string;
  meta: Record<string, unknown>;
};

export type ActivityFeedResponse = {
  items: ActivityItem[];
};
