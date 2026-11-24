import {backendConfig} from './backend-config';
import { parseSiteSettings } from "./community";
import { getSupabase } from "./supabase-service";
import { loadCommunityBoards } from "./community-boards";
import type {
  AnonymousComment,
  AnonymousGateway,
  AnonymousPost,
} from "./anonymous-types";
const errors: Record<string, string> = {
  GGO_RATE_LIMIT: "작성 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  GGO_AUTH_REQUIRED: "로그인 후 이용해 주세요.",
  GGO_GOOGLE_REQUIRED: "Google 계정으로 로그인한 회원만 작성할 수 있습니다.",
  GGO_MEMBER_RESTRICTED:
    "정지 또는 차단된 계정은 작성·수정·삭제할 수 없습니다.",
  GGO_ADMIN_REQUIRED: "운영자 권한이 필요합니다.",
  GGO_PROTECTED_ADMIN: "운영자 계정은 이 화면에서 제재할 수 없습니다.",
  GGO_VOTE_REQUIRED: "투표에 참여한 뒤 익명 댓글을 남길 수 있습니다.",
  GGO_NOT_FOUND: "게시글 또는 댓글을 찾을 수 없습니다.",
  GGO_ALREADY_REPORTED: "이미 접수한 신고입니다.",
  GGO_INVALID_INPUT: "입력 내용을 확인해 주세요.",
};
export const anonymousError = (error: unknown) =>
  new Error(
    errors[
      typeof error === "string"
        ? error
        : ((error as { message?: string })?.message ?? "")
    ] ?? "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
function postDTO(value: unknown): AnonymousPost {
  const v = value as AnonymousPost;
  if (
    !v ||
    typeof v.id !== "string" ||
    typeof v.title !== "string" ||
    typeof v.body !== "string" ||
    typeof v.is_mine !== "boolean" ||
    typeof v.author_label !== "string" ||
    !Number.isInteger(v.comment_count)
  )
    throw anonymousError("invalid");
  return {
    id: v.id,
    title: v.title,
    body: v.body,
    image_path: v.image_path ?? "",
    topic: v.topic,
    prefix: v.prefix && /^#[0-9a-f]{6}$/i.test(v.prefix.color) ? v.prefix : null,
    notice: v.notice === true,
    notice_color: v.notice_color && /^#[0-9a-f]{6}$/i.test(v.notice_color) ? v.notice_color : null,
    pin_rank: v.pin_rank ?? null,
    tags: Array.isArray(v.tags)
      ? v.tags.filter((t) => typeof t === "string")
      : [],
    created_at: v.created_at,
    updated_at: v.updated_at,
    score: Number.isFinite(v.score) ? Number(v.score) : undefined,
    views:
      Number.isSafeInteger(v.views) && Number(v.views) >= 0
        ? Number(v.views)
        : 0,
    is_hot: v.is_hot === true,
    comment_count: v.comment_count,
    is_mine: v.is_mine,
    author_label: v.author_label,
  };
}
export function commentDTO(value: unknown): AnonymousComment {
  const v = value as AnonymousComment;
  if (
    !v ||
    typeof v.id !== "string" ||
    typeof v.body !== "string" ||
    typeof v.is_mine !== "boolean" ||
    typeof v.author_label !== "string"
  )
    throw anonymousError("invalid");
  return {
    id: v.id,
    body: v.body,
    parent_id: v.parent_id ?? null,
    created_at: v.created_at,
    updated_at: v.updated_at,
    is_mine: v.is_mine,
    author_label: v.author_label,
  };
}
export function anonymousGateway(): AnonymousGateway | null {
  const client = getSupabase();
  if (!client) return null;
  const rpc = async (name: string, args?: Record<string, unknown>) => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw anonymousError(error);
    return data;
  };
  return {
    access: () => rpc("anonymous_access"),
    boards: () => loadCommunityBoards(),
    highlights: async (board) => {
      const rows = await rpc("community_board_highlights", { p_board: board });
      if (!Array.isArray(rows)) throw anonymousError("invalid");
      return rows.map(postDTO);
    },
    settings: async () => {
      const settings = parseSiteSettings(await rpc("community_settings"));
      if (!settings) throw anonymousError("invalid");
      return settings;
    },
    feed: async (filter, before, query = "") => {
      const rows = await rpc("anonymous_feed", {
        p_filter: filter,
        p_limit: 30,
        p_before: before?.created_at ?? null,
        p_before_id: before?.id ?? null,
        p_query: query,
      });
      if (!Array.isArray(rows)) throw anonymousError("invalid");
      return rows.map(postDTO);
    },
    posts: async (before) => {
      const rows = await rpc("anonymous_posts", {
        p_limit: 30,
        p_before: before?.created_at ?? null,
        p_before_id: before?.id ?? null,
      });
      if (!Array.isArray(rows)) throw anonymousError("invalid");
      return rows.map(postDTO);
    },
    post: async (id) => {
      const post = postDTO(await rpc("anonymous_post", { p_id: id }));
      const endpoint = process.env.NEXT_PUBLIC_ANONYMOUS_API_URL ?? backendConfig.writer;
      if (endpoint && /^https:\/\//.test(endpoint))
        try {
          const response = await fetch(endpoint.replace(/\/$/, "") + "/view", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${(await client.auth.getSession()).data.session?.access_token??''}` },
            body: JSON.stringify({ post_id: id }),
            cache: "no-store",
          });
          if (response.ok) {
            const data = await response.json();
            if (Number.isSafeInteger(data.views) && data.views >= 0)
              post.views = data.views;
          }
        } catch {}
      return post;
    },
    comments: async (kind, thread, offset = 0) => {
      const rows = await rpc("anonymous_comments", {
        p_kind: kind,
        p_thread: thread,
        p_limit: 50,
        p_offset: offset,
      });
      if (!Array.isArray(rows)) throw anonymousError("invalid");
      return rows.map(commentDTO);
    },
    write: async (action, data) => {
      const endpoint = process.env.NEXT_PUBLIC_ANONYMOUS_API_URL ?? backendConfig.writer;
      if (!endpoint || !/^https:\/\//.test(endpoint))
        throw new Error("익명 게시판 작성 서버가 아직 연결되지 않았습니다.");
      const { data: session, error } = await client.auth.getSession();
      if (error || !session.session) throw anonymousError("GGO_AUTH_REQUIRED");
      const response = await fetch(endpoint.replace(/\/$/, "") + "/write", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, data }),
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw anonymousError(result.error);
      if (typeof result.id !== "string") throw anonymousError("invalid");
      return { id: result.id };
    },
    report: async (kind, id, reason) => {
      await rpc("anonymous_report", {
        p_kind: kind,
        p_id: id,
        p_reason: reason,
      });
    },
    reports: (offset = 0) =>
      rpc("anonymous_admin_reports", { p_limit: 50, p_offset: offset }),
    moderate: async (id, action, remove) => {
      await rpc("anonymous_admin_action", {
        p_report_id: id,
        p_action: action,
        p_delete_content: remove,
      });
    },
  };
}
