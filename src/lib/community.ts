import { boardCategories } from "./types";
import type { BoardCategory, LocalState, Post } from "./types";
export const TOP_TITLE = "TOP 글";
export const HOT_TITLE = TOP_TITLE;
export type CommunityFilter = (typeof boardCategories)[number] | "hot";
export interface SiteSettings {
  topMinScore: number;
  commentWeight: number;
  halfLifeHours: number;
  topDays: number;
  communityWritingEnabled: boolean;
  notice: { ko: string; vi: string; en: string };
}
export const defaultSiteSettings: SiteSettings = {
  topMinScore: 50,
  commentWeight: 15,
  halfLifeHours: 24,
  topDays: 7,
  communityWritingEnabled: true,
  notice: { ko: "", vi: "", en: "" },
};
export function parseSiteSettings(value: unknown): SiteSettings | null {
  if (!value || typeof value !== "object") return null;
  const v = value as SiteSettings;
  if (
    !Number.isFinite(v.topMinScore) ||
    v.topMinScore < 0.1 ||
    v.topMinScore > 1000000 ||
    !Number.isInteger(v.commentWeight) ||
    v.commentWeight < 1 ||
    v.commentWeight > 100 ||
    !Number.isInteger(v.topDays) ||
    v.topDays < 1 ||
    v.topDays > 30 ||
    !Number.isInteger(v.halfLifeHours) ||
    v.halfLifeHours < 1 ||
    v.halfLifeHours > 168 ||
    typeof v.communityWritingEnabled !== "boolean" ||
    !v.notice ||
    (["ko", "vi", "en"] as const).some(
      (lang) =>
        typeof v.notice[lang] !== "string" || v.notice[lang].length > 180,
    )
  )
    return null;
  return {
    topMinScore: v.topMinScore,
    commentWeight: v.commentWeight,
    halfLifeHours: v.halfLifeHours,
    topDays: v.topDays,
    communityWritingEnabled: v.communityWritingEnabled,
    notice: { ko: v.notice.ko, vi: v.notice.vi, en: v.notice.en },
  };
}
export function normalizeBoardCategory(value: unknown): BoardCategory {
  const old: Record<string, BoardCategory> = {
    뷰티: "패션",
    케이팝: "음악",
    정보: "자유",
    Style: "패션",
    Beauty: "패션",
    Life: "자유",
  };
  return typeof value === "string" &&
    boardCategories.includes(value as never) &&
    value !== "전체"
    ? (value as BoardCategory)
    : (old[String(value)] ?? "자유");
}
export function topScore(
  views: number,
  comments: number,
  createdAt: string,
  settings: SiteSettings,
  now = Date.now(),
) {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created) || created > now) return 0;
  const ageHours = (now - created) / 3600000;
  return (
    (Math.max(0, views) + Math.max(0, comments) * settings.commentWeight) *
    Math.pow(0.5, ageHours / settings.halfLifeHours)
  );
}
export function hotEligible(
  views: number,
  comments: number,
  createdAt: string,
  settings: SiteSettings,
  now = Date.now(),
) {
  const created = Date.parse(createdAt);
  return (
    Number.isFinite(created) &&
    created <= now &&
    created >= now - settings.topDays * 86400000 &&
    topScore(views, comments, createdAt, settings, now) >= settings.topMinScore
  );
}
export function recordPostView(
  state: LocalState,
  post: Post,
  now = Date.now(),
): LocalState {
  if (
    state.hiddenPosts.includes(post.id) ||
    state.deletedPosts.includes(post.id)
  )
    return state;
  const previous = Date.parse(state.postViews[post.id] ?? "");
  if (Number.isFinite(previous) && now - previous < 86400000) return state;
  const updated = { ...post, views: post.views + 1 };
  return {
    ...state,
    posts: [...state.posts.filter((p) => p.id !== post.id), updated],
    postViews: { ...state.postViews, [post.id]: new Date(now).toISOString() },
  };
}
