"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Flag,
  MessageSquare,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { anonymousGateway } from "@/lib/anonymous-service";
import type {
  AdminAction,
  AnonymousAccess,
  AnonymousComment,
  AnonymousGateway,
  AnonymousPost,
  AnonymousReport,
  AnonymousTarget,
} from "@/lib/anonymous-types";
import { TopPosts, useRankingClock } from "./top-posts";
import { CommunityNavigation } from "./community-navigation";
import {
  defaultSiteSettings,
  hotEligible,
  topScore,
  HOT_TITLE,
  type CommunityFilter,
} from "@/lib/community";
import { boardCategories } from "@/lib/types";
import { manageCommunityBoard, type CommunityBoard } from "@/lib/community-boards";
import { dateLabel } from "@/lib/data";
import { useLocalized } from "./locale-provider";
import { EmptyState, Modal } from "./ui";
const guest: AnonymousAccess = {
  signed_in: false,
  can_write: false,
  is_admin: false,
  status: "guest",
  suspended_until: null,
};
const failure = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
export function AnonymousLabel({ label }: { label: string }) {
  const { locale } = useLocalized(),
    author = label === "Ẩn danh (Tác giả)",
    number = label.match(/^Ẩn danh (\d+)$/)?.[1];
  return (
    <span
      className={author ? "anonymous-label is-author" : "anonymous-label"}
      translate="no"
    >
      {locale === "vi"
        ? label
        : locale === "ko"
          ? author
            ? "익명(글쓴이)"
            : `익명${number ? " " + number : ""}`
          : author
            ? "Anonymous (Author)"
            : `Anonymous${number ? " " + number : ""}`}
    </span>
  );
}
export function MemberBoard({
  gateway: injected,
  authenticated = false,
  onRequireAuth = () => {},
  compact = false,
  initialFilter = "hot",
}: {
  gateway?: AnonymousGateway;
  authenticated?: boolean;
  onRequireAuth?: (resume?: () => void) => void;
  compact?: boolean;
  initialFilter?: CommunityFilter;
}) {
  const localize = useLocalized(),
    gateway = useMemo(() => injected ?? anonymousGateway(), [injected]);
  const [rows, setRows] = useState<AnonymousPost[]>([]),
    [access, setAccess] = useState(guest),
    [selected, setSelected] = useState<AnonymousPost | null>(null),
    [pendingRead, setPendingRead] = useState<string | null>(null),
    [editing, setEditing] = useState<AnonymousPost | null | undefined>(),
    [admin, setAdmin] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [more, setMore] = useState(false),
    [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>(initialFilter),
    [settings, setSettings] = useState(defaultSiteSettings);
  const [catalog, setCatalog] = useState<CommunityBoard[] | null>(null);
  const [highlights, setHighlights] = useState<{ board: string; posts: AnonymousPost[] } | null>(null);
  const [pinRevision, setPinRevision] = useState(0);
  const editorOpen = editing !== undefined;
  const categories = catalog?.map(board => board.name) ?? boardCategories.slice(1);
  useEffect(() => {
    let active = true;
    void gateway?.boards?.().then(boards => { if (active) setCatalog(boards); }).catch(() => {});
    return () => { active = false; };
  }, [gateway, editorOpen]);
  useEffect(() => {
    if (compact || !catalog?.some(board => board.name === filter)) return;
    let active = true;
    void gateway?.highlights?.(filter).then(posts => { if (active) setHighlights({ board: filter, posts }); }).catch(() => {});
    return () => { active = false; };
  }, [catalog, compact, filter, gateway, pinRevision]);
  const fetchPosts = (before?: { created_at: string; id: string }) =>
    gateway!.feed
      ? gateway!.feed(filter, before, query)
      : gateway!.posts(before);
  const now = useRankingClock(),
    [updatedAt, setUpdatedAt] = useState(Date.now);
  const epoch = useRef(0),
    feedVersion = useRef(0);
  useEffect(() => {
    const generation = ++epoch.current,
      feedToken = ++feedVersion.current;
    setRows([]);
    setAccess(guest);
    setSelected(null);
    setEditing(undefined);
    setAdmin(false);
    setLoading(true);
    if (!gateway) {
      setError("회원 게시판 서버가 아직 연결되지 않았습니다.");
      setLoading(false);
      return;
    }
    Promise.all([
      fetchPosts(),
      gateway.access(),
      gateway.settings
        ? gateway.settings()
        : Promise.resolve(defaultSiteSettings),
    ])
      .then(([posts, current, settings]) => {
        if (epoch.current === generation) {
          if (feedToken === feedVersion.current) {
            setRows(posts);
            setUpdatedAt(Date.now());
            setMore(posts.length === 30);
          }
          setAccess(current);
          setSettings(settings);
          setError("");
        }
      })
      .catch((e) => {
        if (epoch.current === generation) setError(failure(e));
      })
      .finally(() => {
        if (epoch.current === generation) setLoading(false);
      });
    return () => {
      epoch.current++;
      feedVersion.current++;
    };
  }, [gateway, authenticated, filter, query]);
  useEffect(() => {
    if (!gateway) return;
    let active = true;
    const sync = () => {
      if (document.hidden) return;
      const token = ++feedVersion.current;
      fetchPosts()
        .then((rows) => {
          if (active && token === feedVersion.current) {
            setRows(rows);
            setMore(rows.length === 30);
            setUpdatedAt(Date.now());
          }
        })
        .catch(() => {});
    };
    const timer = setInterval(sync, 15000);
    document.addEventListener("visibilitychange", sync);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [gateway, filter, query, authenticated]);
  const canWrite = () => {
    if (!authenticated || !access.signed_in) {
      onRequireAuth();
      return false;
    }
    if (!access.can_write) {
      setError(
        access.writing_enabled === false
          ? "게시글·댓글 작성이 잠시 중단되었습니다."
          : access.status === "active"
            ? "Google 계정으로 로그인한 회원만 작성할 수 있습니다."
            : "정지 또는 차단된 계정은 작성·수정·삭제할 수 없습니다.",
      );
      return false;
    }
    return true;
  };
  const run = async (action: () => Promise<void>) => {
    if (busy || !gateway) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    if (gateway) {
      const generation = epoch.current,
        token = ++feedVersion.current;
      const posts = await fetchPosts();
      if (generation !== epoch.current || token !== feedVersion.current) return;
      setRows(posts);
      setUpdatedAt(Date.now());
      setMore(posts.length === 30);
      setAccess(await gateway.access());
    }
  };
  const openPost = (id: string) => {
    setPendingRead(id);
  };
  useEffect(() => {
    if (!pendingRead || !gateway) return;
    const generation = epoch.current;
    setPendingRead(null);
    void run(async () => {
      const opened = await gateway.post(pendingRead);
      if (generation !== epoch.current) return;
      setSelected(opened);
      await refresh();
    });
  }, [pendingRead, authenticated, access.signed_in, gateway]);
  const updatePin = (post: AnonymousPost, rank: number | null) => run(async () => {
    await manageCommunityBoard("post.pin", { board: post.topic, id: post.id, rank });
    setSelected(current => current?.id === post.id ? { ...current, pin_rank: rank } : current);
    setPinRevision(value => value + 1);
    await refresh();
  });
  const promoted = !query.trim() && highlights?.board === filter ? highlights.posts : [];
  const shown = [...promoted, ...rows.filter(post => !promoted.some(pin => pin.id === post.id))]
    .filter(
      (p) =>
        gateway?.feed ||
        filter === "전체" ||
        (filter === "hot" &&
          hotEligible(
            p.views ?? 0,
            p.comment_count,
            p.created_at,
            settings,
            now,
          )) ||
        p.topic === filter,
    )
    .filter((p) =>
      (p.title + " " + p.body + " " + (p.prefix?.label ?? ""))
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
    );
  return localize(
    <section className="member-board anonymous-board">
      {!compact&&<div className="board-notice">
        <ShieldCheck size={20} />
        <div>
          <strong>닉네임 없이, 편하게 이야기해요.</strong>
          <p>
            편하게 이야기하되, 서로를 존중해 주세요. 욕설·비방·음란물 등 다른 사람에게 불편을 주는 내용은 삼가 주세요.
          </p>
        </div>
        {access.is_admin && (
          <button onClick={() => setAdmin(true)}>
            신고 관리
            <Flag size={15} />
          </button>
        )}
      </div>}
      {!compact && (
        <CommunityNavigation
          value={filter}
          onChange={setFilter}
          settings={settings}
          categories={["전체", ...categories]}
        />
      )}
      {!compact && (
        <div className="board-toolbar">
          <label className="search-field">
            <input
              aria-label="게시판 검색"
              maxLength={100}
              placeholder="제목·내용 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button
            className="button button-dark"
            onClick={() => {
              if (canWrite()) setEditing(null);
            }}
          >
            <Plus size={16} />
            글쓰기
          </button>
        </div>
      )}
      {loading && <p role="status">게시글을 불러오고 있습니다.</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {filter === "hot" ? (
        <TopPosts
          posts={(compact ? shown.slice(0, 5) : shown).map((p) => ({
            id: p.id,
            title: communityTitle(p),
            titleColor: communityTitleColor(p),
            topic: p.topic,
            views: p.views ?? 0,
            comments: p.comment_count,
            score:
              p.score ??
              topScore(
                p.views ?? 0,
                p.comment_count,
                p.created_at,
                settings,
                now,
              ),
          }))}
          onOpen={openPost}
          updatedAt={updatedAt}
        />
      ) : (
        <div className="board-list">
          {(compact ? shown.slice(0, 5) : shown).map((p) => (
            <button
              className="board-row"
              key={p.id}
              onClick={() => openPost(p.id)}
            >
              <span className="board-row-main">
                <span className="board-category">{p.topic}</span>
                <span className="board-title" translate="no">
                  <CommunityPostTitle post={p} />
                </span>
                <span className="board-comment-number">
                  [{p.comment_count}]
                </span>
                {hotEligible(
                  p.views ?? 0,
                  p.comment_count,
                  p.created_at,
                  settings,
                  now,
                ) && (
                  <span
                    className="hot-label"
                    aria-label={localize.text(HOT_TITLE)}
                  >
                    🔥
                  </span>
                )}
                <small className="member-post-views">조회 {p.views ?? 0}</small>
              </span>
              <span className="board-author">
                <AnonymousLabel label={p.author_label} />
              </span>
              <time className="board-date">{dateLabel(p.created_at)}</time>
            </button>
          ))}
        </div>
      )}
      {filter !== "hot" && !loading && !shown.length && (
        <EmptyState
          title="표시할 글이 없어요."
          text="새로운 이야기를 남겨 보세요."
        />
      )}
      {more && !compact && filter !== "hot" && (
        <button
          className="button button-light"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const next = await fetchPosts(rows.at(-1));
              setRows((old) => [
                ...old,
                ...next.filter((p) => !old.some((row) => row.id === p.id)),
              ]);
              setMore(next.length === 30);
            })
          }
        >
          더 보기
        </button>
      )}
      {selected && gateway && (
        <Modal title="게시글" wide close={() => setSelected(null)}>
          <article className="board-detail">
            <p className="eyebrow">{selected.topic} 게시판</p>
            <h1 translate="no"><CommunityPostTitle post={selected} /></h1>
            <div className="board-detail-meta">
              <AnonymousLabel label={selected.author_label} />
              <time>{dateLabel(selected.created_at)}</time>
              <span>조회 {selected.views ?? 0}</span>
            </div>
            <div className="board-body">
              <p translate="no">{selected.body}</p>
            </div>
            {!compact && authenticated && access.is_admin && !selected.notice && (
              <form key={selected.id} className="board-admin-prefix" onSubmit={event => {
                event.preventDefault();
                void updatePin(selected, Number(new FormData(event.currentTarget).get("rank")));
              }}>
                <label>고정 순서<input name="rank" type="number" min={1} max={10000} required defaultValue={selected.pin_rank ?? 1} /></label>
                <button className="button button-light" disabled={busy}>{selected.pin_rank ? "고정 순서 저장" : "상단 고정"}</button>
                {selected.pin_rank != null && <button type="button" className="button button-light" disabled={busy}
                  onClick={() => void updatePin(selected, null)}>고정 해제</button>}
              </form>
            )}
            {selected.is_mine && access.can_write && !selected.notice && (
              <div className="anonymous-owner-actions">
                <button onClick={() => setEditing(selected)}>
                  <Pencil size={15} />글 수정
                </button>
                <DeleteButton
                  disabled={busy}
                  onDelete={() =>
                    run(async () => {
                      await gateway.write("post.delete", { id: selected.id });
                      setSelected(null);
                      await refresh();
                    })
                  }
                />
              </div>
            )}
            <AnonymousReportButton
              gateway={gateway}
              access={access}
              kind="post"
              id={selected.id}
              onRequireAuth={onRequireAuth}
            />
            <AnonymousThread
              onActivity={() => void refresh().catch(() => {})}
              key={selected.id}
              gateway={gateway}
              kind="post"
              thread={selected.id}
              access={access}
              onRequireAuth={onRequireAuth}
            />
          </article>
        </Modal>
      )}
      {editing !== undefined && gateway && (
        <Modal
          title={editing ? "글 수정" : "글쓰기"}
          wide
          close={() => !busy && setEditing(undefined)}
        >
          <PostEditor
            key={editing?.id ?? "new"}
            post={editing ?? undefined}
            busy={busy}
            boards={catalog ?? categories.map(name => ({ name, position: 0, active: true, prefixes: [] }))}
            initialBoard={categories.includes(filter) ? filter : categories[0]}
            onSave={(title, body, topic, prefix) =>
              run(async () => {
                const result = await gateway.write(
                  editing ? "post.update" : "post.create",
                  {
                    ...(editing ? { id: editing.id } : {}),
                    title,
                    body,
                    topic,
                    ...(prefix !== undefined ? { prefix_id: prefix } : {}),
                  },
                );
                setEditing(undefined);
                await refresh();
                setSelected(await gateway.post(result.id));
              })
            }
          />
        </Modal>
      )}
      {admin && gateway && access.is_admin && (
        <Modal title="신고 관리" wide close={() => setAdmin(false)}>
          <AnonymousAdmin gateway={gateway} />
        </Modal>
      )}
    </section>,
  );
}
export function CommunityPostTitle({ post }: { post: AnonymousPost }) {
  const color = communityTitleColor(post);
  return <span translate="no" style={color ? { color } : undefined}>
    {communityTitle(post)}
  </span>;
}
function communityTitle(post: AnonymousPost) {
  const label = post.notice ? "공지" : post.prefix?.label;
  return label ? `[${label}]${post.title}` : post.title;
}
function communityTitleColor(post: AnonymousPost) {
  return post.notice ? post.notice_color ?? "#a22f37" : post.prefix?.color;
}
function PostEditor({
  post,
  busy,
  boards,
  initialBoard,
  onSave,
}: {
  post?: AnonymousPost;
  busy: boolean;
  boards: CommunityBoard[];
  initialBoard?: string;
  onSave: (title: string, body: string, topic: string, prefix?: string | null) => Promise<void>;
}) {
  const localize = useLocalized(),
    [title, setTitle] = useState(post?.title ?? ""),
    [body, setBody] = useState(post?.body ?? ""),
    [topic, setTopic] = useState(post?.topic ?? initialBoard ?? ""),
    [prefix, setPrefix] = useState(post?.prefix?.id ?? "");
  const prefixes = boards.find(board => board.name === topic)?.prefixes ?? [];
  const originalPrefix = topic === post?.topic ? post.prefix : null;
  const choices = originalPrefix && !prefixes.some(item => item.id === originalPrefix.id)
    ? [...prefixes, originalPrefix] : prefixes;
  return localize(
    <form
      className="standard-form"
      onSubmit={(e) => {
        e.preventDefault();
        const hadPrefix = !!post?.prefix;
        void onSave(title.trim(), body.trim(), topic, prefix || (hadPrefix ? null : undefined));
      }}
    >
      <label>
        게시판 분류
        <select value={topic} onChange={(e) => { setTopic(e.target.value); setPrefix(""); }} required>
          {boards.map((board) => (
            <option key={board.name} value={board.name}>
              {board.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        말머리
        <select value={prefix} onChange={event => setPrefix(event.target.value)}>
          <option value="">말머리 없음</option>
          {choices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label>
        제목
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          minLength={2}
          maxLength={100}
          required
        />
      </label>
      <label>
        내용
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          minLength={3}
          maxLength={3000}
          rows={12}
          required
        />
      </label>
      <button
        className="button button-dark"
        disabled={busy || !topic || title.trim().length < 2 || body.trim().length < 3}
      >
        {busy ? "저장 중" : "저장하기"}
      </button>
    </form>,
  );
}
function DeleteButton({
  onDelete,
  disabled = false,
}: {
  onDelete: () => Promise<void>;
  disabled?: boolean;
}) {
  const localize = useLocalized(),
    [confirm, setConfirm] = useState(false);
  return localize(
    <span className="anonymous-delete">
      {confirm ? (
        <>
          <span>삭제하시겠어요?</span>
          <button disabled={disabled} onClick={() => void onDelete()}>
            삭제 확인
          </button>
          <button disabled={disabled} onClick={() => setConfirm(false)}>
            취소
          </button>
        </>
      ) : (
        <button disabled={disabled} onClick={() => setConfirm(true)}>
          <Trash2 size={14} />
          삭제
        </button>
      )}
    </span>,
  );
}
export function AnonymousThread({
  gateway,
  kind,
  thread,
  access,
  onRequireAuth,
  canParticipate = true,
  onActivity,
}: {
  gateway: AnonymousGateway;
  kind: "post" | "poll";
  thread: string;
  access: AnonymousAccess;
  onRequireAuth: () => void;
  canParticipate?: boolean;
  onActivity?: () => void;
}) {
  const localize = useLocalized(),
    [comments, setComments] = useState<AnonymousComment[]>([]),
    [body, setBody] = useState(""),
    [reply, setReply] = useState<AnonymousComment | null>(null),
    [editing, setEditing] = useState<AnonymousComment | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [more, setMore] = useState(false);
  const version = useRef(0);
  const load = async () => {
    const rows = await gateway.comments(kind, thread);
    setComments(rows);
    setMore(rows.length === 50);
    onActivity?.();
  };
  useEffect(() => {
    const current = ++version.current;
    setComments([]);
    setError("");
    setMore(false);
    if (!access.signed_in) {
      setBody("");
      setReply(null);
      setEditing(null);
    }
    gateway
      .comments(kind, thread)
      .then((rows) => {
        if (version.current === current) {
          setComments(rows);
          setMore(rows.length === 50);
        }
      })
      .catch((e) => {
        if (version.current === current) setError(failure(e));
      });
    return () => {
      version.current++;
    };
  }, [gateway, kind, thread, access.signed_in]);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  };
  return localize(
    <section className="board-comments member-comments" aria-label="익명 댓글">
      <h2>
        <MessageSquare size={19} />
        익명 댓글
      </h2>
      {comments.map((c) => (
        <article key={c.id} className="board-comment">
          <div className="board-comment-meta">
            <AnonymousLabel label={c.author_label} />
            <time>{dateLabel(c.created_at)}</time>
          </div>
          {c.parent_id && (
            <p className="anonymous-reply-to">
              <span>답글</span> ·{" "}
              <AnonymousLabel
                label={
                  comments.find((p) => p.id === c.parent_id)?.author_label ??
                  "Ẩn danh"
                }
              />
            </p>
          )}
          {editing?.id === c.id ? (
            <form
              className="standard-form"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await gateway.write(
                    kind === "post" ? "comment.update" : "poll_comment.update",
                    { id: c.id, body: body.trim() },
                  );
                  setEditing(null);
                  setBody("");
                  await load();
                });
              }}
            >
              <label>
                댓글 수정
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  maxLength={kind === "post" ? 500 : 1000}
                />
              </label>
              <button
                className="button button-dark"
                disabled={busy || !body.trim()}
              >
                수정 내용 저장
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setBody("");
                }}
              >
                취소
              </button>
            </form>
          ) : (
            <p translate="no">{c.body}</p>
          )}
          <div className="anonymous-owner-actions">
            {access.can_write && canParticipate && (
              <button
                onClick={() => {
                  setEditing(null);
                  setBody("");
                  setReply(c);
                }}
              >
                답글
              </button>
            )}
            {c.is_mine && access.can_write && (
              <>
                <button
                  onClick={() => {
                    setReply(null);
                    setBody(c.body);
                    setEditing(c);
                  }}
                >
                  댓글 수정
                </button>
                <DeleteButton
                  disabled={busy}
                  onDelete={() =>
                    run(async () => {
                      await gateway.write(
                        kind === "post"
                          ? "comment.delete"
                          : "poll_comment.delete",
                        { id: c.id },
                      );
                      await load();
                    })
                  }
                />
              </>
            )}
            <AnonymousReportButton
              gateway={gateway}
              access={access}
              kind={kind === "post" ? "comment" : "poll_comment"}
              id={c.id}
              onRequireAuth={onRequireAuth}
            />
          </div>
        </article>
      ))}
      {more && (
        <button
          className="button button-light"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const rows = await gateway.comments(
                kind,
                thread,
                comments.length,
              );
              setComments((old) => [
                ...old,
                ...rows.filter((c) => !old.some((item) => item.id === c.id)),
              ]);
              setMore(rows.length === 50);
            })
          }
        >
          댓글 더 보기
        </button>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!editing &&
        (access.can_write && canParticipate ? (
          <form
            className="anonymous-comment-form standard-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await gateway.write(
                  kind === "post" ? "comment.create" : "poll_comment.create",
                  {
                    [kind === "post" ? "post_id" : "poll_id"]: thread,
                    body: body.trim(),
                    parent_id: reply?.id ?? null,
                  },
                );
                setBody("");
                setReply(null);
                await load();
              });
            }}
          >
            {reply && (
              <div className="anonymous-reply-to">
                <AnonymousLabel label={reply.author_label} />
                <span>에게 답글</span>
                <button type="button" onClick={() => setReply(null)}>
                  취소
                </button>
              </div>
            )}
            <label>
              익명으로 댓글 쓰기
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={kind === "post" ? 500 : 1000}
                rows={3}
                required
              />
            </label>
            <p>익명 번호는 이 게시글 안에서만 유지됩니다.</p>
            <button
              className="button button-dark"
              disabled={busy || !body.trim()}
            >
              댓글 등록
            </button>
          </form>
        ) : (
          <p className="privacy-note">
            {!access.signed_in ? (
              <button onClick={onRequireAuth}>
                로그인 후 댓글을 작성할 수 있습니다.
              </button>
            ) : !canParticipate ? (
              "투표에 참여한 뒤 익명 댓글을 남길 수 있습니다."
            ) : access.writing_enabled === false ? (
              "게시글·댓글 작성이 잠시 중단되었습니다."
            ) : access.status === "active" ? (
              "Google 계정으로 로그인한 회원만 작성할 수 있습니다."
            ) : (
              "정지 또는 차단된 계정은 작성·수정·삭제할 수 없습니다."
            )}
          </p>
        ))}
    </section>,
  );
}
export function AnonymousReportButton({
  gateway,
  access,
  kind,
  id,
  onRequireAuth,
}: {
  gateway: AnonymousGateway;
  access: AnonymousAccess;
  kind: AnonymousTarget;
  id: string;
  onRequireAuth: () => void;
}) {
  const localize = useLocalized(),
    [open, setOpen] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [error, setError] = useState(""),
    form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (open) {
      form.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
      form.current?.querySelector("textarea")?.focus({ preventScroll: true });
    }
  }, [open]);
  return localize(
    <div className="member-report">
      <button
        disabled={sent}
        onClick={() => {
          if (!access.signed_in) {
            onRequireAuth();
            return;
          }
          setOpen(true);
        }}
      >
        <Flag size={13} />
        {sent ? "신고 완료" : "신고하기"}
      </button>
      {open && (
        <form
          ref={form}
          className="standard-form report-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              await gateway.report(kind, id, reason);
              setSent(true);
              setOpen(false);
            } catch (e) {
              setError(failure(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            신고 사유
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={3}
              maxLength={1000}
              required
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button
            className="button button-dark"
            disabled={busy || reason.trim().length < 3}
          >
            신고 접수
          </button>
          <button type="button" onClick={() => setOpen(false)}>
            취소
          </button>
        </form>
      )}
    </div>,
  );
}
export function AnonymousAdmin({ gateway }: { gateway: AnonymousGateway }) {
  const localize = useLocalized(),
    [rows, setRows] = useState<AnonymousReport[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [remove, setRemove] = useState<Record<string, boolean>>({}),
    [selected, setSelected] = useState<{
      id: string;
      action: AdminAction;
    } | null>(null),
    [more, setMore] = useState(false);
  useEffect(() => {
    let active = true;
    setRows([]);
    gateway
      .reports()
      .then((value) => {
        if (active) {
          setRows(value);
          setMore(value.length === 50);
        }
      })
      .catch((e) => {
        if (active) setError(failure(e));
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [gateway]);
  return localize(
    <section className="anonymous-admin">
      <p className="privacy-note">
        운영자 전용 · 작성자 정보 조회와 조치 기록은 서버에 남습니다.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!ready && <p role="status">신고를 불러오고 있습니다.</p>}
      {rows.map((r) => (
        <article className="report-ticket" key={r.id}>
          <h3 translate="no">{r.reason}</h3>
          <blockquote translate="no">{r.body ?? "—"}</blockquote>
          <dl className="anonymous-admin-identity">
            <dt>회원 ID</dt>
            <dd translate="no">{r.user_id ?? "—"}</dd>
            <dt>이메일</dt>
            <dd translate="no">{r.email ?? "—"}</dd>
            <dt>작성 IP</dt>
            <dd translate="no">
              {r.ip_address ?? localize.text("IP 미수집")}
            </dd>
            <dt>회원 상태</dt>
            <dd translate="no">
              {r.member_status ?? "—"}
              {r.suspended_until &&
                ` · ${new Date(r.suspended_until).toLocaleString(localize.locale)}`}
            </dd>
          </dl>
          {r.resolved_at ? (
            <p>처리가 완료된 신고입니다.</p>
          ) : (
            <>
              <label className="admin-delete-consent">
                <input
                  type="checkbox"
                  checked={!!remove[r.id]}
                  onChange={(e) =>
                    setRemove((old) => ({ ...old, [r.id]: e.target.checked }))
                  }
                />
                제재와 함께 해당 콘텐츠 삭제
              </label>
              <div className="report-ticket-actions">
                {(
                  [
                    ["suspend_7d", "7일 정지"],
                    ["ban", "영구 차단"],
                    ["delete", "콘텐츠 삭제"],
                    ["dismiss", "신고 기각"],
                  ] as const
                ).map(([action, label]) => (
                  <button
                    className="button button-light"
                    key={action}
                    disabled={busy}
                    onClick={() => setSelected({ id: r.id, action })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </article>
      ))}
      {ready && !rows.length && !error && <p>처리 대기 중인 신고가 없어요.</p>}
      {more && (
        <button
          className="button button-light"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const page = await gateway.reports(rows.length);
              setRows((old) => [...old, ...page]);
              setMore(page.length === 50);
            } catch (e) {
              setError(failure(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          더 보기
        </button>
      )}
      {selected && (
        <div
          className="anonymous-action-confirm"
          role="group"
          aria-label="운영자 조치 확인"
        >
          <p>선택한 조치를 적용하시겠어요?</p>
          <button
            className="button button-dark"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await gateway.moderate(
                  selected.id,
                  selected.action,
                  !!remove[selected.id],
                );
                setSelected(null);
                const next = await gateway.reports();
                setRows(next);
                setMore(next.length === 50);
              } catch (e) {
                setError(failure(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            조치 적용
          </button>
          <button
            className="button button-light"
            disabled={busy}
            onClick={() => setSelected(null)}
          >
            취소
          </button>
        </div>
      )}
    </section>,
  );
}
