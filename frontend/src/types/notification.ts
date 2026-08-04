export type NotificationCategory =
  | "medication"
  | "appointment"
  | "chat"
  | "triage"
  | "case_review";

export interface NotificationItem {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  deep_link: string | null;
  is_read: boolean;
  created_at: string;
}
