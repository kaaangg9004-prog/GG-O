import type { SiteSettings } from "./community";
import type { CommunityBoard, CommunityPrefix } from "./community-boards";
export interface AnonymousAccess {
  writing_enabled?: boolean;
  signed_in: boolean;
  can_write: boolean;
  is_admin: boolean;
  status: "guest" | "active" | "suspended" | "banned";
  suspended_until: string | null;
}
export interface AnonymousPost {
  id: string;
  title: string;
  body: string;
  image_path: string;
  topic: string;
  prefix?: CommunityPrefix | null;
  notice?: boolean;
  notice_color?: string | null;
  pin_rank?: number | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  score?: number;
  views?: number;
  is_hot?: boolean;
  comment_count: number;
  is_mine: boolean;
  author_label: string;
}
export interface AnonymousComment {
  id: string;
  body: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  is_mine: boolean;
  author_label: string;
}
export type AnonymousTarget = "post" | "comment" | "poll_comment";
export interface AnonymousReport {
  id: string;
  target_kind: AnonymousTarget;
  target_id: string;
  reason: string;
  created_at: string;
  resolved_at: string | null;
  action: string | null;
  user_id: string | null;
  email: string | null;
  ip_address: string | null;
  body: string | null;
  member_status: string | null;
  suspended_until: string | null;
}
export type AdminAction = "suspend_7d" | "ban" | "delete" | "dismiss";
export interface AnonymousGateway {
  settings?(): Promise<SiteSettings>;
  boards?(): Promise<CommunityBoard[]>;
  highlights?(board: string): Promise<AnonymousPost[]>;
  feed?(
    filter: string,
    before?: { created_at: string; id: string },
    query?: string,
  ): Promise<AnonymousPost[]>;
  access(): Promise<AnonymousAccess>;
  posts(before?: { created_at: string; id: string }): Promise<AnonymousPost[]>;
  post(id: string): Promise<AnonymousPost>;
  comments(
    kind: "post" | "poll",
    thread: string,
    offset?: number,
  ): Promise<AnonymousComment[]>;
  write(
    action: string,
    data: Record<string, string | null>,
  ): Promise<{ id: string }>;
  report(kind: AnonymousTarget, id: string, reason: string): Promise<void>;
  reports(offset?: number): Promise<AnonymousReport[]>;
  moderate(id: string, action: AdminAction, remove: boolean): Promise<void>;
}
