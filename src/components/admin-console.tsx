"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Check,
  Flame,
  LayoutDashboard,
  RefreshCw,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { boardCategories } from "@/lib/types";
import type { LocalState } from "@/lib/types";
import { HOT_TITLE, hotEligible, parseSiteSettings } from "@/lib/community";
import type { SiteSettings } from "@/lib/community";
import type {
  ManagedPost,
  ManagedMember,
  MemberAction,
  SiteAdminGateway,
} from "@/lib/site-admin";
import { useLocalized } from "./locale-provider";
import { AnonymousLabel } from "./member-board";
import { EmptyState, Modal } from "./ui";
export type AdminSection =
  | "overview"
  | "posts"
  | "reports"
  | "polls"
  | "events"
  | "journal"
  | "support"
  | "emergency"
  | "members"
  | "settings";
const sections: [AdminSection, string][] = [
  ["overview", "운영 현황"],
  ["posts", "게시글·댓글"],
  ["reports", "신고 처리"],
  ["polls", "투표 관리"],
  ["events", "이벤트 관리"],
  ["journal", "매거진 관리"],
  ["support", "고객지원"],
  ["emergency", "긴급 요청함"],
  ["members", "회원 관리"],
  ["settings", "사이트 설정"],
];
const failure = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
export function AdminConsole({
  authorized,
  demo,
  settings,
  stats,
  posts,
  members,
  gateway,
  panels,
  onSettings,
  onPost,
  onComment,
  onMember,
}: {
  authorized: boolean;
  demo: boolean;
  settings: SiteSettings;
  stats: Record<string, number>;
  posts: ManagedPost[];
  members: ManagedMember[];
  gateway: SiteAdminGateway | null;
  panels: Partial<Record<AdminSection, ReactNode>>;
  onSettings: (value: SiteSettings) => Promise<void>;
  onPost: (
    id: string,
    action: "hide" | "restore" | "delete" | "category",
    topic?: string,
  ) => Promise<void>;
  onComment: (id: string, action: "hide" | "restore") => Promise<void>;
  onMember: (id: string, action: MemberAction) => Promise<void>;
}) {
  const localize = useLocalized(),
    [section, setSection] = useState<AdminSection>("overview"),
    [remoteStats, setStats] = useState<Record<string, number> | null>(null),
    [remotePosts, setPosts] = useState<ManagedPost[]>([]),
    [remoteMembers, setMembers] = useState<ManagedMember[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [more, setMore] = useState(false),
    [confirm, setConfirm] = useState<{
      kind: "post" | "member";
      id: string;
      action: string;
      label: string;
    } | null>(null);
  useEffect(() => {
    let active = true;
    setError("");
    setStats(null);
    setPosts([]);
    setMembers([]);
    setMore(false);
    if (!authorized || demo || !gateway) return;
    setBusy(true);
    const request =
      section === "posts"
        ? gateway.content()
        : section === "members"
          ? gateway.members()
          : gateway.overview();
    request
      .then((value) => {
        if (!active) return;
        if (section === "posts") {
          setPosts(value as ManagedPost[]);
          setMore((value as unknown[]).length === 50);
        } else if (section === "members") {
          setMembers(value as ManagedMember[]);
          setMore((value as unknown[]).length === 50);
        } else setStats(value as Record<string, number>);
      })
      .catch((e) => {
        if (active) setError(failure(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [authorized, demo, gateway, section, refresh]);
  if (!authorized)
    return localize(
      <EmptyState
        title="운영자 권한이 필요합니다."
        text="운영자만 이 화면을 이용할 수 있습니다."
      />,
    );
  const run = async (fn: () => Promise<void>, reload = true) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      if (reload) setRefresh((n) => n + 1);
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  };
  const counts = demo
      ? {
          ...stats,
          hot: posts.filter(
            (p) =>
              !p.deleted &&
              p.status === "published" &&
              hotEligible(
                p.views,
                p.comments.filter((c) => !c.hidden).length,
                p.created_at,
                settings,
              ),
          ).length,
        }
      : (remoteStats ?? {}),
    rows = demo ? posts : remotePosts,
    people = demo ? members : remoteMembers;
  return localize(
    <section className="shell section admin-console">
      <header className="admin-console-heading">
        <div>
          <p className="eyebrow">
            <ShieldCheck size={15} />
            GG-O CONTROL ROOM
          </p>
          <h1>사이트 관리.</h1>
          <p>흩어진 운영 업무를 한곳에서.</p>
        </div>
        <span className="admin-role-badge">
          {demo ? "운영 화면 미리보기" : "인증된 운영자"}
        </span>
      </header>
      <div className="admin-layout">
        <nav className="admin-sidebar" aria-label="사이트 관리 메뉴">
          {sections.map(([id, label]) => (
            <button
              key={id}
              className={section === id ? "selected" : ""}
              aria-current={section === id ? "page" : undefined}
              onClick={() => {
                setSection(id);
                setConfirm(null);
              }}
            >
              {id === "overview" ? (
                <LayoutDashboard size={16} />
              ) : id === "settings" ? (
                <Settings size={16} />
              ) : (
                <span className="admin-menu-dot" />
              )}
              {label}
            </button>
          ))}
        </nav>
        <div className="admin-content">
          <div className="admin-content-title">
            <h2>{sections.find(([id]) => id === section)?.[1]}</h2>
            <button
              className="text-link"
              disabled={busy}
              onClick={() => setRefresh((n) => n + 1)}
            >
              <RefreshCw size={14} />
              새로고침
            </button>
          </div>
          {demo && (
            <p className="admin-mode-note">
              설정과 콘텐츠 변경은 이 브라우저에
              저장됩니다.
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {busy && !demo && (
            <p role="status">관리 데이터를 불러오고 있습니다.</p>
          )}
          {section === "overview" && (
            <>
              <div className="admin-stats">
                {[
                  ["posts", "게시글"],
                  ["hot", HOT_TITLE],
                  ["reports", "처리 대기 신고"],
                  ["members", "회원"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() =>
                      setSection(
                        id === "hot"
                          ? "posts"
                          : id === "posts"
                            ? "posts"
                            : id === "members"
                              ? "members"
                              : "reports",
                      )
                    }
                  >
                    <span>{label}</span>
                    <strong>{counts[id] ?? "—"}</strong>
                  </button>
                ))}
              </div>
              <div className="admin-quick-links">
                {sections
                  .filter(([id]) =>
                    [
                      "polls",
                      "events",
                      "journal",
                      "support",
                      "emergency",
                      "settings",
                    ].includes(id),
                  )
                  .map(([id, label]) => (
                    <button key={id} onClick={() => setSection(id)}>
                      {label}
                      <span>↗</span>
                    </button>
                  ))}
              </div>
              <div className="admin-current-policy">
                <Flame size={19} />
                <p>
                  TOP 글 기준: {settings.topMinScore}점 이상 · 댓글 가중치{" "}
                  {settings.commentWeight} · 반감기 {settings.halfLifeHours}시간
                </p>
                <button onClick={() => setSection("settings")}>
                  기준 변경
                </button>
              </div>
              {panels.reports}
            </>
          )}
          {section === "reports" && panels.reports}
          {section === "posts" && (
            <div className="admin-post-list">
              {rows.length
                ? rows.map((p) => (
                    <ManagedPostRow
                      key={p.id}
                      post={p}
                      busy={busy}
                      onAction={(action, topic) => {
                        if (action === "delete")
                          setConfirm({
                            kind: "post",
                            id: p.id,
                            action,
                            label: p.title,
                          });
                        else void run(() => onPost(p.id, action, topic));
                      }}
                      onComment={(id, action) =>
                        void run(() => onComment(id, action))
                      }
                    />
                  ))
                : !busy && (
                    <EmptyState
                      title="표시할 글이 없어요."
                      text="작성된 글과 댓글을 여기서 관리합니다."
                    />
                  )}
            </div>
          )}
          {section === "members" && (
            <div className="admin-member-list">
              <p className="member-activity-note">댓글은 게시판 댓글과 투표 의견을 합산합니다. 받은 신고는 처리 상태와 관계없이 집계하며 위반 확정 횟수가 아닙니다.</p>
              {people.map((member) => (
                <article key={member.id}>
                  <div>
                    <strong translate="no">{member.handle}</strong>
                    <span>
                      {member.role === "admin" ? "운영자" : "일반 사용자"}
                    </span>
                    <small translate="no">{member.email ?? member.id}</small>
                  </div>
                  <span className={`member-status ${member.status}`}>
                    {member.status === "active"
                      ? "정상"
                      : member.status === "suspended"
                        ? "7일 정지"
                        : "영구 차단"}
                  </span>
                  {member.suspended_until && (
                    <time>
                      {new Date(member.suspended_until).toLocaleString(
                        localize.locale,
                      )}
                    </time>
                  )}
                  <dl className="member-activity-stats">
                    {([['글 작성',member.post_count],['댓글 작성',member.comment_count],['투표 참여',member.poll_count],['누적 받은 신고',member.received_report_count]] as const).map(([label,count])=><div key={label}><dt>{label}</dt><dd>{count===undefined?'—':count.toLocaleString(localize.locale)}</dd></div>)}
                  </dl>
                  <div className="admin-member-actions">
                    {member.role === "admin" ? (
                      <span>운영자 보호</span>
                    ) : (
                      (
                        [
                          ["suspend_7d", "7일 정지"],
                          ["ban", "영구 차단"],
                          ["restore", "이용 제한 해제"],
                        ] as const
                      ).map(([action, label]) => (
                        <button
                          key={action}
                          disabled={
                            busy ||
                            (member.status === "banned" &&
                              action === "suspend_7d")
                          }
                          onClick={() =>
                            setConfirm({
                              kind: "member",
                              id: member.id,
                              action,
                              label: member.handle,
                            })
                          }
                        >
                          {label}
                        </button>
                      ))
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
          {more && ["posts", "members"].includes(section) && (
            <button
              className="button button-light"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (!gateway) return;
                  if (section === "posts") {
                    const page = await gateway.content(remotePosts.length);
                    setPosts((old) => [...old, ...page]);
                    setMore(page.length === 50);
                  } else {
                    const page = await gateway.members(remoteMembers.length);
                    setMembers((old) => [...old, ...page]);
                    setMore(page.length === 50);
                  }
                }, false)
              }
            >
              더 보기
            </button>
          )}
          {section === "settings" && (
            <SiteSettingsEditor
              key={JSON.stringify(settings)}
              settings={settings}
              busy={busy}
              onSave={async (value) => {
                if (busy) return;
                setBusy(true);
                setError("");
                try {
                  await onSettings(value);
                  setRefresh((n) => n + 1);
                } catch (e) {
                  setError(failure(e));
                  throw e;
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
          {["polls", "events", "journal", "support", "emergency"].includes(
            section,
          ) && panels[section]}
        </div>
      </div>
      {confirm && (
        <Modal title="운영자 조치 확인" close={() => !busy && setConfirm(null)}>
          <p translate="no">{confirm.label}</p>
          <p>
            {confirm.kind === "post"
              ? "이 게시글을 삭제하시겠어요?"
              : "선택한 회원 조치를 적용하시겠어요?"}
          </p>
          <div className="admin-confirm-actions">
            <button
              className="button button-light"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              취소
            </button>
            <button
              className="button button-dark"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (confirm.kind === "post")
                    await onPost(confirm.id, "delete");
                  else
                    await onMember(confirm.id, confirm.action as MemberAction);
                  setConfirm(null);
                })
              }
            >
              조치 적용
            </button>
          </div>
        </Modal>
      )}
    </section>,
  );
}
function ManagedPostRow({
  post,
  busy,
  onAction,
  onComment,
}: {
  post: ManagedPost;
  busy: boolean;
  onAction: (
    action: "hide" | "restore" | "delete" | "category",
    topic?: string,
  ) => void;
  onComment: (id: string, action: "hide" | "restore") => void;
}) {
  const localize = useLocalized(),
    [topic, setTopic] = useState(post.topic);
  useEffect(() => setTopic(post.topic), [post.topic]);
  return localize(
    <article className="admin-post">
      <div>
        <span className="admin-post-state">
          {post.deleted
            ? "삭제됨"
            : post.status === "published"
              ? "공개"
              : "숨김"}
        </span>
        <h3 translate="no">{post.title}</h3>
        <p>
          조회 {post.views}회 · 댓글 {post.comments.length}개
        </p>
      </div>
      <div className="admin-post-actions">
        <label>
          <span className="sr-only">게시글 분류</span>
          <select value={topic} onChange={(e) => setTopic(e.target.value)}>
            {boardCategories.slice(1).map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={busy || topic === post.topic}
          onClick={() => onAction("category", topic)}
        >
          분류 저장
        </button>
        <button
          disabled={busy}
          onClick={() =>
            onAction(
              post.status === "published" && !post.deleted ? "hide" : "restore",
            )
          }
        >
          {post.status === "published" && !post.deleted
            ? "게시글 숨김"
            : "게시글 복원"}
        </button>
        <button
          disabled={busy || post.deleted}
          onClick={() => onAction("delete")}
        >
          게시글 삭제
        </button>
      </div>
      <details>
        <summary>댓글 관리 ({post.comments.length})</summary>
        {post.comments.map((c) => (
          <div className="admin-comment" key={c.id}>
            <AnonymousLabel label={c.author_label} />
            <p translate="no">{c.body}</p>
            <span>{c.hidden ? "숨김" : "공개"}</span>
            <button
              disabled={busy}
              onClick={() => onComment(c.id, c.hidden ? "restore" : "hide")}
            >
              {c.hidden ? "댓글 복원" : "댓글 숨김"}
            </button>
          </div>
        ))}
      </details>
    </article>,
  );
}
function SiteSettingsEditor({
  settings,
  busy,
  onSave,
}: {
  settings: SiteSettings;
  busy: boolean;
  onSave: (settings: SiteSettings) => Promise<void>;
}) {
  const localize = useLocalized(),
    [draft, setDraft] = useState(settings),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  return localize(
    <form
      className="standard-form site-settings-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setSaved(false);
        const value = parseSiteSettings(draft);
        if (!value) {
          setError("입력 내용을 확인해 주세요.");
          return;
        }
        try {
          await onSave(value);
          setSaved(true);
        } catch (e) {
          setError(failure(e));
        }
      }}
    >
      <section>
        <h3>TOP 글 실시간 점수 설정</h3>
        <p>
          조회수·공개 댓글·최신성으로 점수를 계산하고 높은 순서로 자동
          표시합니다.
        </p>
        <div className="settings-numbers">
          <label>
            최소 선정 점수
            <input
              type="number"
              step="0.1"
              min={0.1}
              max={1000000}
              value={draft.topMinScore}
              onChange={(e) =>
                setDraft({ ...draft, topMinScore: Number(e.target.value) })
              }
              required
            />
          </label>
          <label>
            댓글 한 개의 가중치
            <input
              type="number"
              min={1}
              max={100}
              value={draft.commentWeight}
              onChange={(e) =>
                setDraft({ ...draft, commentWeight: Number(e.target.value) })
              }
              required
            />
          </label>
          <label>
            시간 가중치 반감기 (시간)
            <input
              type="number"
              min={1}
              max={168}
              value={draft.halfLifeHours}
              onChange={(e) =>
                setDraft({ ...draft, halfLifeHours: Number(e.target.value) })
              }
              required
            />
          </label>
          <label>
            대상 기간 (일)
            <input
              type="number"
              min={1}
              max={30}
              value={draft.topDays}
              onChange={(e) =>
                setDraft({ ...draft, topDays: Number(e.target.value) })
              }
              required
            />
          </label>
        </div>
      </section>
      <section>
        <h3>사이트 공지</h3>
        <p>비워 두면 공지 띠가 표시되지 않습니다.</p>
        {(
          [
            ["ko", "한국어 공지"],
            ["vi", "베트남어 공지"],
            ["en", "영어 공지"],
          ] as const
        ).map(([lang, label]) => (
          <label key={lang}>
            {label}
            <textarea
              lang={lang}
              value={draft.notice[lang]}
              maxLength={180}
              rows={2}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  notice: { ...draft.notice, [lang]: e.target.value },
                })
              }
            />
          </label>
        ))}
      </section>
      <label className="admin-write-toggle">
        <input
          type="checkbox"
          checked={draft.communityWritingEnabled}
          onChange={(e) =>
            setDraft({ ...draft, communityWritingEnabled: e.target.checked })
          }
        />
        게시글·익명댓글 작성 허용
      </label>
      <p>중단해도 글 읽기와 운영자 관리는 계속 이용할 수 있습니다.</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="settings-saved" role="status">
          <Check size={16} />
          설정을 저장했습니다.
        </p>
      )}
      <button className="button button-dark" disabled={busy}>
        사이트 설정 저장
      </button>
    </form>,
  );
}
