import { demoOwnerKey } from './demo-login';
import { getSupabase } from "./supabase-service";
import { anonymousError } from "./anonymous-service";
import {
  normalizeBoardCategory,
  parseSiteSettings,
  hotEligible,
} from "./community";
import type { SiteSettings } from "./community";
import type { LocalState, Post } from "./types";
export type MemberAction = "suspend_7d" | "ban" | "restore";
export type DemoMemberState = {
  status: "active" | "suspended" | "banned";
  suspendedUntil: string | null;
};
export type ManagedMember = {
  id: string;
  handle: string;
  name?: string | null;
  gender?: "male" | "female" | "nonbinary" | "other" | null;
  email: string | null;
  role: "user" | "admin";
  status: "active" | "suspended" | "banned";
  suspended_until: string | null;
  created_at: string;
  post_count?: number;
  comment_count?: number;
  poll_count?: number;
  received_report_count?: number;
};
export type ManagedPost = {
  id: string;
  title: string;
  body: string;
  topic: string;
  views: number;
  created_at: string;
  status: string;
  deleted: boolean;
  comment_count?: number;
  comments: {
    id: string;
    body: string;
    hidden: boolean;
    author_label: string;
  }[];
};
export type ContentSection = "posts" | "deleted_posts" | "comments" | "deleted_comments";
export type ManagedComment = ManagedPost["comments"][number] & {
  post_title: string;
  deleted: boolean;
  post_deleted: boolean;
};
export interface SiteAdminGateway {
  overview(): Promise<Record<string, number>>;
  content(offset?: number): Promise<ManagedPost[]>;
  communityContent?(section: ContentSection, offset?: number): Promise<ManagedPost[] | ManagedComment[]>;
  settings(value: SiteSettings): Promise<void>;
  post(
    id: string,
    action: "hide" | "restore" | "delete" | "category",
    topic?: string,
  ): Promise<void>;
  comment(id: string, action: "hide" | "restore"): Promise<void>;
  members(offset?: number): Promise<ManagedMember[]>;
  searchMembers(query: string, offset?: number): Promise<ManagedMember[]>;
  changeMemberRole(id: string, role: ManagedMember["role"]): Promise<void>;
  postAuthor(postId: string): Promise<ManagedMember | null>;
  member(id: string, action: MemberAction): Promise<void>;
}
export function siteAdminGateway(): SiteAdminGateway | null {
  const client = getSupabase();
  if (!client) return null;
  const rpc = async (name: string, args?: Record<string, unknown>) => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw anonymousError(error);
    return data;
  };
  return {
    overview: () => rpc("site_admin_overview"),
    content: (offset = 0) =>
      rpc("site_admin_content", { p_limit: 50, p_offset: offset }),
    communityContent: (section, offset = 0) =>
      rpc("site_admin_community_content", { p_section: section, p_limit: 50, p_offset: offset }),
    settings: async (value) => {
      if (!parseSiteSettings(value)) throw anonymousError("GGO_INVALID_INPUT");
      await rpc("site_admin_settings", { p_settings: value });
    },
    post: async (id, action, topic) => {
      await rpc("site_admin_post_action", {
        p_id: id,
        p_action: action,
        p_topic: topic ?? null,
      });
    },
    comment: async (id, action) => {
      await rpc("site_admin_comment_action", { p_id: id, p_action: action });
    },
    members: (offset = 0) =>
      rpc("site_admin_members", { p_limit: 50, p_offset: offset }),
    searchMembers: (query, offset = 0) =>
      rpc("site_admin_search_members", { p_query: query, p_limit: 50, p_offset: offset }),
    changeMemberRole: async (id, role) => {
      await rpc("site_admin_change_member_role", { p_id: id, p_role: role });
    },
    postAuthor: postId => rpc("site_admin_post_author", { p_post_id: postId }),
    member: async (id, action) => {
      await rpc("site_admin_member_action", { p_id: id, p_action: action });
    },
  };
}
export function demoMemberCanWrite(
  state: LocalState,
  account: string,
  now = Date.now(),
) {
  const member = state.demoMemberStatuses[account.trim().toUpperCase()];
  return (
    !member ||
    member.status === "active" ||
    (member.status === "suspended" &&
      member.suspendedUntil !== null &&
      Date.parse(member.suspendedUntil) <= now)
  );
}
export function setDemoMemberState(
  state: LocalState,
  account: string,
  action: MemberAction,
): LocalState {
  if (account !== "AAAA")
    throw new Error("운영자 계정은 이 화면에서 제재할 수 없습니다.");
  if (
    state.demoMemberStatuses[account]?.status === "banned" &&
    action === "suspend_7d"
  )
    throw new Error("차단 해제 후 정지 기간을 설정해 주세요.");
  return {
    ...state,
    demoMemberStatuses: {
      ...state.demoMemberStatuses,
      [account]: {
        status:
          action === "ban"
            ? "banned"
            : action === "suspend_7d"
              ? "suspended"
              : "active",
        suspendedUntil:
          action === "suspend_7d"
            ? new Date(Date.now() + 7 * 86400000).toISOString()
            : null,
      },
    },
  };
}
export function manageLocalPost(
  state: LocalState,
  post: Post,
  action: "hide" | "restore" | "delete" | "category",
  topic?: string,
): LocalState {
  if (action === "category")
    return {
      ...state,
      posts: [
        ...state.posts.filter((p) => p.id !== post.id),
        { ...post, topic: normalizeBoardCategory(topic) },
      ],
    };
  return {
    ...state,
    hiddenPosts:
      action === "hide"
        ? Array.from(new Set([...state.hiddenPosts, post.id]))
        : state.hiddenPosts.filter((id) => id !== post.id),
    autoHiddenPosts: state.autoHiddenPosts.filter((id) => id !== post.id),
    deletedPosts:
      action === "delete"
        ? Array.from(new Set([...state.deletedPosts, post.id]))
        : state.deletedPosts.filter((id) => id !== post.id),
  };
}
export const postIsHot = (post: Post, state: LocalState) =>
  !state.hiddenPosts.includes(post.id) &&
  !state.deletedPosts.includes(post.id) &&
  hotEligible(
    post.views,
    post.comments.filter((c) => !state.hiddenComments.includes(c.id)).length,
    post.createdAt,
    state.settings,
  );

/** Counts retained demo records, including hidden/deleted records and resolved reports. */
export function demoMemberActivity(state: LocalState, account: string, posts: Post[]) {
  const owner=demoOwnerKey(account,state.deviceKey), userKey='demo:'+owner;
  const ownedPostIds=new Set(posts.filter(p=>p.ownerKey===owner).map(p=>p.id));
  const ownedCommentIds=new Set(posts.flatMap(p=>p.comments.filter(c=>c.ownerKey===owner).map(c=>c.id)));
  return {
    post_count:ownedPostIds.size,
    comment_count:ownedCommentIds.size+state.pollComments.filter(c=>c.userKey===userKey).length,
    poll_count:state.pollBallots.filter(b=>b.userKey===userKey).length,
    received_report_count:state.reports.filter(r=>r.target.commentId?ownedCommentIds.has(r.target.commentId):ownedPostIds.has(r.target.postId)).length,
  };
}
