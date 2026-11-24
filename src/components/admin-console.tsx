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
import { loadCommunityBoards } from "@/lib/community-boards";
import type { LocalState } from "@/lib/types";
import { HOT_TITLE, hotEligible, parseSiteSettings } from "@/lib/community";
import type { SiteSettings } from "@/lib/community";
import type {
  ContentSection,
  ManagedComment,
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
  | "boards"
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
  ["boards", "게시판 관리"],
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
  authorPostId,
  currentMemberId,
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
  authorPostId?: string;
  currentMemberId?: string;
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
    [section, setSection] = useState<AdminSection>(authorPostId ? "members" : "overview"),
    [focusedPost, setFocusedPost] = useState(authorPostId),
    [memberQuery, setMemberQuery] = useState(""),
    [remoteStats, setStats] = useState<Record<string, number> | null>(null),
    [remotePosts, setPosts] = useState<ManagedPost[]>([]),
    [remoteComments, setComments] = useState<ManagedComment[]>([]),
    [contentSection, setContentSection] = useState<ContentSection>("posts"),
    [remoteMembers, setMembers] = useState<ManagedMember[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [more, setMore] = useState(false),
    [confirm, setConfirm] = useState<{
      kind: "post" | "member" | "role";
      id: string;
      action: string;
      label: string;
    } | null>(null);
  const [categories, setCategories] = useState<string[]>(demo ? boardCategories.slice(1) : []);
  const showsComments = contentSection === "comments" || contentSection === "deleted_comments";
  useEffect(() => {
    if (!authorized || demo || section !== "posts") return;
    let active = true;
    void loadCommunityBoards().then(boards => {
      if (active) setCategories(boards.map(board => board.name));
    }).catch(() => {});
    return () => { active = false; };
  }, [authorized, demo, section]);
  useEffect(() => {
    let active = true;
    setError("");
    setStats(null);
    setPosts([]);
    setComments([]);
    setMembers([]);
    setMore(false);
    if (!authorized || demo || !gateway) return;
    setBusy(true);
    const request =
      section === "posts"
        ? gateway.communityContent?.(contentSection) ?? gateway.content()
        : section === "members"
          ? focusedPost ? gateway.postAuthor(focusedPost).then(member => member ? [member] : [])
            : memberQuery ? gateway.searchMembers(memberQuery) : gateway.members()
          : gateway.overview();
    request
      .then((value) => {
        if (!active) return;
        if (section === "posts") {
          if (showsComments) setComments(value as ManagedComment[]);
          else setPosts(value as ManagedPost[]);
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
  }, [authorized, demo, gateway, section, refresh, focusedPost, memberQuery, contentSection, showsComments]);
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
    rows = demo || !gateway?.communityContent
      ? (demo ? posts : remotePosts).filter(post => post.deleted === (contentSection === "deleted_posts"))
      : remotePosts,
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
              <div className="board-admin-prefix" role="group" aria-label="게시글·댓글 분류">
                {([["posts","게시글"],["deleted_posts","삭제된 게시글"],["comments","댓글"],["deleted_comments","삭제된 댓글"]] as const).map(([value,label]) =>
                  <button key={value} type="button" className={`button ${contentSection===value ? "button-dark" : "button-light"}`}
                    aria-pressed={contentSection===value} disabled={busy} onClick={() => setContentSection(value)}>{label}</button>
                )}
              </div>
              {showsComments ? <>
                {remoteComments.map(c => <article className="admin-post" key={c.id}>
                  <h3 translate="no">{c.post_title}</h3>
                  <p translate="no">{c.body}</p>
                  <span>{c.deleted ? "삭제됨" : c.hidden || c.post_deleted ? "숨김" : "공개"}</span>
                  <button type="button" className="button button-light" disabled={busy || c.post_deleted}
                    onClick={() => void run(() => onComment(c.id,c.deleted || c.hidden ? "restore" : "hide"))}>
                    {c.deleted || c.hidden ? "댓글 복원" : "댓글 숨김"}
                  </button>
                </article>)}
                {!busy && !remoteComments.length && <p>표시할 댓글이 없어요.</p>}
              </> : rows.length
                ? rows.map((p) => (
                    <ManagedPostRow
                      key={p.id}
                      post={p}
                      busy={busy}
                      categories={categories}
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
              {focusedPost && <button className="button button-light" onClick={() => setFocusedPost(undefined)}>전체 회원 보기</button>}
              {!demo && !focusedPost && <form className="board-admin-prefix" onSubmit={event => {
                event.preventDefault();
                const query = String(new FormData(event.currentTarget).get("member_query") ?? "").trim();
                setMemberQuery(query);
              }}>
                <label>회원 검색<input type="search" name="member_query" maxLength={200} placeholder="이름, 이메일 또는 회원 ID" /></label>
                <button className="button button-light" disabled={busy}>검색</button>
                {memberQuery && <button className="button button-light" type="reset" disabled={busy} onClick={() => setMemberQuery("")}>검색 초기화</button>}
              </form>}
              {focusedPost && !busy && !error && !people.length && <p>연결된 계정이 없습니다.</p>}
              {memberQuery && !busy && !error && !people.length && <p>검색 조건에 맞는 회원이 없습니다.</p>}
              <p className="member-activity-note">댓글은 게시판 댓글과 투표 의견을 합산합니다. 받은 신고는 처리 상태와 관계없이 집계하며 위반 확정 횟수가 아닙니다.</p>
              {people.map((member) => (
                <article key={member.id}>
                  <div>
                    <strong translate="no">{member.handle}</strong>
                    <span>
                      {member.role === "admin" ? "운영자" : "일반 사용자"}
                    </span>
                    <div className="admin-member-basics">
                      <small translate="no">{member.email ?? member.id}</small>
                      <dl>
                        <div><dt>이름</dt><dd translate="no">{member.name || localize.text("미제공")}</dd></div>
                        <div><dt>성별</dt><dd>{member.gender ? { male: "남성", female: "여성", nonbinary: "논바이너리", other: "기타" }[member.gender] : "미제공"}</dd></div>
                        <div><dt>가입일</dt><dd translate="no">{Number.isFinite(Date.parse(member.created_at))
                          ? <time dateTime={member.created_at}>{new Intl.DateTimeFormat(localize.locale, { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(member.created_at))}</time>
                          : localize.text("미제공")}</dd></div>
                      </dl>
                    </div>
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
                    {!demo && gateway && member.id !== currentMemberId && (member.role === "admin" || member.status === "active") &&
                      <button disabled={busy} onClick={() => setConfirm({
                        kind: "role", id: member.id, action: member.role === "admin" ? "user" : "admin",
                        label: member.email ?? member.handle,
                      })}>{member.role === "admin" ? "일반회원으로 변경" : "관리자로 지정"}</button>}
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
                    const page = gateway.communityContent
                      ? await gateway.communityContent(contentSection, showsComments ? remoteComments.length : remotePosts.length)
                      : await gateway.content(remotePosts.length);
                    if (showsComments) setComments(old => [...old, ...page as ManagedComment[]]);
                    else setPosts(old => [...old, ...page as ManagedPost[]]);
                    setMore(page.length === 50);
                  } else {
                    const page = memberQuery ? await gateway.searchMembers(memberQuery, remoteMembers.length) : await gateway.members(remoteMembers.length);
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
          {["polls", "events", "journal", "support", "emergency", "boards"].includes(
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
              : confirm.kind === "role"
                ? confirm.action === "admin"
                  ? "이 회원에게 회원 정보 조회, 역할 변경을 포함한 모든 관리자 권한을 부여할까요?"
                  : "이 회원의 관리자 권한을 모두 해제할까요?"
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
                  else if (confirm.kind === "role" && gateway)
                    await gateway.changeMemberRole(confirm.id, confirm.action === "admin" ? "admin" : "user");
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
  categories,
  onAction,
  onComment,
}: {
  post: ManagedPost;
  busy: boolean;
  categories: string[];
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
          조회 {post.views}회 · 댓글 {post.comment_count ?? post.comments.length}개
        </p>
      </div>
      <div className="admin-post-actions">
        <label>
          <span className="sr-only">게시글 분류</span>
          <select value={topic} onChange={(e) => setTopic(e.target.value)}>
            {!categories.includes(post.topic) && <option value={post.topic}>{post.topic || "원래 게시판"} (복원할 게시판 선택)</option>}
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        {!post.deleted && <button
          disabled={busy || topic === post.topic}
          onClick={() => onAction("category", topic)}
        >
          분류 저장
        </button>}
        <button
          disabled={busy || (post.deleted && !categories.includes(topic))}
          onClick={() =>
            onAction(
              post.status === "published" && !post.deleted ? "hide" : "restore",
              post.deleted ? topic : undefined,
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
      {post.comments.length > 0 && <details>
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
      </details>}
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
