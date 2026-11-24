"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
  CommunityPostImage,
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
import { siteAdminGateway, type ManagedMember } from "@/lib/site-admin";
import { getPostImageUrls, isVideoAttachment, maxCommunityImages, maxCommunityVideoBytes, splitPostBody, uploadPostImage } from "@/lib/community-post-images";
import { splitYouTubeLinks } from "@/lib/community-youtube";
import { ContentShare } from "./content-share";
import { highlightHashtags } from "@/lib/community-hashtags";
import { readProductPhoto } from "@/lib/product-images";
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
export function AnonymousLabel({ label, admin = false }: { label: string; admin?: boolean }) {
  const { locale } = useLocalized(),
    author = label === "Ẩn danh (Tác giả)",
    number = label.match(/^Ẩn danh (\d+)$/)?.[1];
  if (admin) return <span className="anonymous-label is-author" translate="no">
    {{ ko: "운영자", vi: "Quản trị viên", en: "Administrator" }[locale]}
  </span>;
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
  onManageAuthor,
  sharedPostId,
}: {
  gateway?: AnonymousGateway;
  authenticated?: boolean;
  onRequireAuth?: (resume?: () => void) => void;
  compact?: boolean;
  initialFilter?: CommunityFilter;
  onManageAuthor?: (postId: string) => void;
  sharedPostId?: string | null;
}) {
  const localize = useLocalized(),
    gateway = useMemo(() => injected ?? anonymousGateway(), [injected]);
  const [rows, setRows] = useState<AnonymousPost[]>([]),
    [access, setAccess] = useState(guest),
    [selected, setSelected] = useState<AnonymousPost | null>(null),
    [managed, setManaged] = useState<AnonymousPost | null>(null),
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
  const canManagePosts = !compact && authenticated && access.is_admin;
  const editorOpen = editing !== undefined;
  const categories = gateway?.boards
    ? catalog?.map(board => board.name) ?? []
    : boardCategories.slice(1);
  const boardLabel = (name: string) => catalog?.find(board => board.name === name)?.labels?.[localize.locale] ?? localize.text(name);
  const translatedPost = (post: AnonymousPost): AnonymousPost => {
    const translation = localize.locale === "ko" ? undefined : post.notice_translations?.[localize.locale];
    return translation ? { ...post, ...translation } : post;
  };
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
    setManaged(null);
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
      if (authenticated) void gateway.access().then(current => {
        if (active) setAccess(current);
      }).catch(() => {});
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
    setPendingRead(sharedPostId ?? null);
    if (!sharedPostId) setSelected(null);
  }, [sharedPostId]);
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
  const submitManagement = async (action: "pin" | "hide" | "delete" | "category", value?: number | string | null) => {
    if (!canManagePosts || !managed) return;
    if (action === "pin") {
      await manageCommunityBoard("post.pin", { board: managed.topic, id: managed.id, rank: value });
    } else {
      const adminGateway = siteAdminGateway();
      if (!adminGateway) throw new Error("게시판 서버가 연결되지 않았습니다.");
      await adminGateway.post(managed.id, action, typeof value === "string" ? value : undefined);
      setRows(current => current.filter(post => post.id !== managed.id));
      setHighlights(current => current && { ...current, posts: current.posts.filter(post => post.id !== managed.id) });
    }
    setManaged(null);
    setPinRevision(value => value + 1);
    void refresh().catch(reason => setError(failure(reason)));
  };
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
      (p.title + " " + p.body + " " + (p.prefix?.label ?? "") + " " + p.tags.map(displayHashtag).join(" "))
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
          categoryLabel={boardLabel}
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
            disabled={categories.length === 0}
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
            title: translatedPost(p).title,
            prefix: communityTitlePrefix(p, localize.locale),
            prefixColor: communityTitleColor(p) ? prefixInk(communityTitleColor(p)!) : undefined,
            topic: boardLabel(p.topic),
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
          onManage={canManagePosts ? id => setManaged(shown.find(post => post.id === id) ?? null) : undefined}
          updatedAt={updatedAt}
        />
      ) : (
        <div className="board-list">
          {(compact ? shown.slice(0, 5) : shown).map((p) => (
            <div className={canManagePosts ? "managed-board-row" : undefined} key={p.id}>
            {canManagePosts && <button type="button" className="board-row-manage" aria-label={`${p.title} 관리`} onClick={() => setManaged(p)}>관리</button>}
            <button
              className="board-row"
              onClick={() => openPost(p.id)}
            >
              <span className="board-row-main">
                <span className="board-category" translate="no">{boardLabel(p.topic)}</span>
                <span className="board-title" translate="no">
                  <CommunityPostTitle post={translatedPost(p)} />
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
                <AnonymousLabel label={p.author_label} admin={p.is_admin_author} />
              </span>
              <time className="board-date">{dateLabel(p.created_at)}</time>
            </button>
            </div>
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
            <p className="eyebrow" translate="no">{boardLabel(selected.topic)}</p>
            <h1 translate="no"><CommunityPostTitle post={translatedPost(selected)} /></h1>
            <div className="board-detail-meta">
              <AnonymousLabel label={selected.author_label} admin={selected.is_admin_author} />
              <time>{dateLabel(selected.created_at)}</time>
              <span>조회 {selected.views ?? 0}</span>
            </div>
            <ContentShare key={`share-${selected.id}`} section="community" id={selected.id} title={translatedPost(selected).title} />
            <CommunityPostBody key={`body-${selected.id}`} post={translatedPost(selected)} />
            {selected.tags.length > 0 && <ul className="community-post-hashtags" aria-label="해시태그">
              {selected.tags.map((tag, index) => <li key={index} translate="no">{displayHashtag(tag)}</li>)}
            </ul>}
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
            onSave={(title, body, topic, prefix, size, color, images, hashtags) =>
              run(async () => {
                const result = await gateway.write(
                  editing ? "post.update" : "post.create",
                  {
                    ...(editing ? { id: editing.id } : {}),
                    title,
                    body,
                    topic,
                    body_size: size,
                    body_color: color,
                    images,
                    ...(hashtags !== undefined ? { hashtags } : {}),
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
      {managed && canManagePosts && (
        <BoardPostManagement post={managed} boards={catalog?.map(board => board.name) ?? []}
          close={() => setManaged(null)} save={submitManagement}
          openAuthor={onManageAuthor ? () => onManageAuthor(managed.id) : undefined}
          open={() => { setManaged(null); openPost(managed.id); }} />
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
  const prefix = communityTitlePrefix(post, useLocalized().locale);
  return <span translate="no">
    {prefix && <span className="community-title-prefix" style={color ? { color: prefixInk(color) } : undefined}>[{prefix}]</span>}{post.title}
  </span>;
}
function BoardPostManagement({ post, boards, close, save, open, openAuthor }: {
  post: AnonymousPost;
  boards: string[];
  close: () => void;
  save: (action: "pin" | "hide" | "delete" | "category", value?: number | string | null) => Promise<void>;
  open: () => void;
  openAuthor?: () => void;
}) {
  const [selection, select] = useState<"rank" | "category" | "hide" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [author, setAuthor] = useState<ManagedMember | null | undefined>();
  const [authorError, setAuthorError] = useState("");
  useEffect(() => {
    const adminGateway = siteAdminGateway();
    if (!adminGateway) return;
    let active = true;
    void adminGateway.postAuthor(post.id)
      .then(account => { if (active) setAuthor(account); })
      .catch(error => { if (active) setAuthorError(failure(error)); });
    return () => { active = false; };
  }, [post.id]);
  const pinned = post.pin_rank != null;
  const destinations = boards.filter(board => board !== post.topic);
  const perform = async (task: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await task();
    } catch (error) {
      setMessage(failure(error));
    } finally {
      setBusy(false);
    }
  };
  return <Modal title="게시글 관리" close={() => { if (!busy) close(); }}>
    <p><CommunityPostTitle post={post} /></p>
    <p>작성자 계정{" "}
      {author ? <button type="button" className="text-link" translate="no" disabled={busy || !openAuthor}
        onClick={openAuthor}>{author.email ?? author.handle}</button>
        : authorError || (author === null ? "연결된 계정 없음" : "불러오는 중…")}
    </p>
    <div className="board-post-actions">
      <button className="button button-light" disabled={busy || pinned || post.notice} onClick={() => void perform(() => save("pin", 1))}>상단 고정</button>
      <button className="button button-light" disabled={busy || !pinned || post.notice} onClick={() => void perform(() => save("pin", null))}>상단 고정 해제</button>
      <button className="button button-light" disabled={busy} onClick={() => select("hide")}>숨김</button>
      <button className="button button-light" disabled={busy} onClick={() => select("delete")}>삭제</button>
      <button className="button button-light" disabled={busy || !pinned || post.notice} onClick={() => select("rank")}>고정 순서 변경</button>
      <button className="button button-light" disabled={busy || !destinations.length} onClick={() => select("category")}>게시판 이동</button>
      <button className="button button-light" disabled={busy} onClick={open}>글 보기</button>
      <button className="button button-light" disabled={busy} onClick={() => void perform(async () => {
        await navigator.clipboard.writeText(communityTitle(post));
        setMessage("제목을 복사했습니다.");
      })}>제목 복사</button>
    </div>
    {post.notice && <p>공지는 게시판 상단에 자동으로 표시됩니다.</p>}
    {message && <p role="status">{message}</p>}
    {selection && <form key={selection} className="standard-form" onSubmit={event => {
      event.preventDefault();
      const value = new FormData(event.currentTarget).get("value");
      void perform(() => selection === "rank" ? save("pin", Number(value))
        : selection === "category" ? save("category", String(value)) : save(selection));
    }}>
      {selection === "rank" && <label>고정 순서<input name="value" type="number" min={1} max={10000} defaultValue={post.pin_rank ?? 1} required /></label>}
      {selection === "category" && <label>이동할 게시판<select name="value" required defaultValue="">
        <option value="" disabled>게시판 선택</option>
        {destinations.map(board => <option key={board}>{board}</option>)}
      </select>기존 말머리와 고정은 이동할 때 해제됩니다.</label>}
      {selection === "hide" && <p>이 글을 게시판에서 숨길까요?</p>}
      {selection === "delete" && <p>이 글을 삭제할까요? 사이트 관리에서 복구할 수 있습니다.</p>}
      <div className="board-post-actions">
        <button className="button button-dark" disabled={busy}>확인</button>
        <button type="button" className="button button-light" disabled={busy} onClick={() => select(null)}>취소</button>
      </div>
    </form>}
  </Modal>;
}
function communityTitle(post: AnonymousPost) {
  const label = communityTitlePrefix(post);
  return label ? `[${label}]${post.title}` : post.title;
}
function communityTitlePrefix(post: AnonymousPost, locale: "ko" | "vi" | "en" = "ko") {
  if (post.notice || post.prefix?.label === "공지") {
    return { ko: "공지", vi: "Thông báo", en: "Notice" }[locale];
  }
  return post.prefix?.label;
}
function communityTitleColor(post: AnonymousPost) {
  return post.notice ? post.notice_color ?? "#c23147" : post.prefix?.color;
}
function prefixInk(color: string) {
  return `color-mix(in srgb, ${color} 60%, #161616)`;
}
type BodySize = NonNullable<AnonymousPost["body_size"]>;
const bodySizes: Record<BodySize, string | undefined> = {
  small: "0.875rem", normal: undefined, large: "1.25rem", "extra-large": "1.5rem",
};
function bodyStyle(size?: BodySize | null, color?: string | null) {
  return { fontSize: size ? bodySizes[size] : undefined, color: color ?? undefined };
}
const noPostImages: CommunityPostImage[] = [];
function CommunityPostBody({ post }: { post: AnonymousPost }) {
  const images = post.images ?? noPostImages;
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    void getPostImageUrls(images.map(image => image.path)).then(result => {
      if (active) setUrls(result);
    }).catch(() => {});
    return () => { active = false; };
  }, [images]);
  return <div className="board-body">
    {splitPostBody(post.body, images).map((part, index) => {
      const image = images[index];
      return <Fragment key={index}>
        {splitYouTubeLinks(part).map((content, position) => content.embed
          ? <iframe key={position} className="community-youtube-player" src={content.embed}
              title="YouTube 동영상" loading="lazy" allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              allow="encrypted-media; picture-in-picture; fullscreen" />
          : <p key={position} translate="no" style={bodyStyle(post.body_size, post.body_color)}>{content.text}</p>)}
        {image && urls[image.path] && <PostAttachment source={urls[image.path]} video={isVideoAttachment(image.path)} width={image.width} index={index} />}
      </Fragment>;
    })}
  </div>;
}

function PostAttachment({ source, video, width, index }: { source: string; video: boolean; width: number; index: number }) {
  const style = { width: `${width}%` };
  return video
    ? <video className="community-inline-image" src={source} controls playsInline preload="metadata" aria-label={`첨부 영상 ${index + 1}`} style={style} />
    : <img className="community-inline-image" src={source} alt={`첨부 사진 ${index + 1}`} style={style} />;
}

interface DraftPostImage {
  key: string;
  path?: string;
  source?: string;
  file?: File;
  width: number;
}
const displayHashtag = (tag: string) => "#" + tag.replace(/^#+/, "");
function HashtagInput({ value, invalid, change }: { value: string; invalid: boolean; change: (value: string) => void }) {
  const localize = useLocalized();
  const mirror = useRef<HTMLDivElement>(null);
  const [editingOffset, setEditingOffset] = useState<number | null>(null);
  const syncScroll = (input: HTMLInputElement) => {
    if (mirror.current) mirror.current.scrollLeft = input.scrollLeft;
  };
  return <label>
    {localize.text("해시태그")}
    <div className="community-hashtag-input">
      <div className="community-hashtag-mirror" ref={mirror} aria-hidden="true">
        {highlightHashtags(value, editingOffset).map((part, index) =>
          <span className={part.complete ? "completed-hashtag" : undefined} key={index}>{part.text}</span>)}
      </div>
      <input value={value} placeholder="#여행 #맛집" maxLength={200} aria-invalid={invalid}
        onScroll={event => syncScroll(event.currentTarget)}
        onSelect={event => syncScroll(event.currentTarget)}
        onBlur={() => setEditingOffset(null)}
        onChange={event => {
          const input = event.currentTarget;
          const native = event.nativeEvent as InputEvent;
          setEditingOffset(native.inputType?.startsWith("delete") ||
            (editingOffset !== null && !/[\s,]/.test(native.data ?? "")) ? input.selectionStart : null);
          change(input.value);
          syncScroll(input);
        }} />
    </div>
    <small>{localize.text(invalid ? "해시태그는 최대 6개, 각 24자까지 입력할 수 있습니다." : "띄어쓰기나 쉼표로 구분해 최대 6개까지 추가할 수 있습니다.")}</small>
  </label>;
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
  onSave: (title: string, body: string, topic: string, prefix: string | null | undefined, size: BodySize | null, color: string | null, images: CommunityPostImage[], hashtags?: string) => Promise<void>;
}) {
  const localize = useLocalized(),
    [title, setTitle] = useState(post?.title ?? ""),
    [segments, setSegments] = useState(() => splitPostBody(post?.body ?? "", post?.images ?? noPostImages)),
    [images, setImages] = useState<DraftPostImage[]>(() => (post?.images ?? []).map((image, index) => ({ ...image, key: `${image.path}-${index}` }))),
    [topic, setTopic] = useState(post?.topic ?? initialBoard ?? ""),
    [prefix, setPrefix] = useState(post?.prefix?.id ?? ""),
    [size, setSize] = useState<BodySize>(post?.body_size ?? "normal"),
    [color, setColor] = useState(post?.body_color ?? null),
    [hashtags, setHashtags] = useState(post?.tags.length ? post.tags.map(displayHashtag).join(" ") + " " : ""),
    [hashtagsChanged, setHashtagsChanged] = useState(false);
  const tags = Array.from(new Set(hashtags.split(/[\s,#]+/).filter(Boolean).map(tag => tag.toLowerCase())));
  const invalidHashtags = hashtagsChanged && (tags.length > 6 || tags.some(tag => [...tag].length > 24));
  const [working, setWorking] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [savedUrls, setSavedUrls] = useState<Record<string, string>>({});
  const uploaded = useRef(new Map<string, string>());
  const previews = useRef(new Set<string>());
  const input = useRef<HTMLInputElement>(null);
  const location = useRef({ segment: 0, offset: segments[0].length });
  const rawBody = segments.join("");
  const body = rawBody.trim();
  useEffect(() => {
    const urls = previews.current;
    return () => { urls.forEach(url => URL.revokeObjectURL(url)); };
  }, []);
  useEffect(() => {
    let active = true;
    void getPostImageUrls((post?.images ?? []).map(image => image.path)).then(urls => {
      if (active) setSavedUrls(urls);
    }).catch(() => {});
    return () => { active = false; };
  }, [post?.images]);
  const insertImage = async (file: File) => {
    if (images.length >= maxCommunityImages) return;
    const { segment, offset } = location.current;
    setWorking(true);
    setPhotoError("");
    try {
      const video = ["video/mp4", "video/webm"].includes(file.type);
      if (video && file.size > maxCommunityVideoBytes) throw new Error("영상은 파일당 20MB 이하로 선택해 주세요.");
      const source = video ? URL.createObjectURL(file) : await readProductPhoto(file);
      if (video) previews.current.add(source);
      const text = segments[segment];
      setSegments([...segments.slice(0, segment), text.slice(0, offset), text.slice(offset), ...segments.slice(segment + 1)]);
      setImages([...images.slice(0, segment), { key: crypto.randomUUID(), source, file: video ? file : undefined, width: 100 }, ...images.slice(segment)]);
      location.current = { segment: segment + 1, offset: 0 };
    } catch (reason) {
      setPhotoError(failure(reason));
    } finally {
      setWorking(false);
    }
  };
  const removeImage = (index: number) => {
    const source = images[index].source;
    if (source && previews.current.delete(source)) URL.revokeObjectURL(source);
    setImages(images.filter((_, i) => i !== index));
    setSegments([...segments.slice(0, index), segments[index] + segments[index + 1], ...segments.slice(index + 2)]);
    location.current = { segment: index, offset: segments[index].length };
  };
  const moveImageAcrossText = (index: number, direction: "up" | "down") => {
    const combined = segments[index] + segments[index + 1];
    setSegments(current => current.map((part, position) => {
      if (position === index) return direction === "up" ? "" : combined;
      if (position === index + 1) return direction === "up" ? combined : "";
      return part;
    }));
    location.current = { segment: index + 1, offset: 0 };
  };
  const submitPost = async () => {
    if (working || busy) return;
    setPhotoError("");
    setWorking(true);
    try {
      const placements = [];
      const leading = Array.from(rawBody).length - Array.from(rawBody.trimStart()).length;
      let offset = -leading;
      for (const [index, image] of images.entries()) {
        offset += Array.from(segments[index]).length;
        let path = image.path ?? uploaded.current.get(image.key);
        if (!path && image.source) {
          path = await uploadPostImage(image.file ?? image.source);
          uploaded.current.set(image.key, path);
        }
        if (!path) throw new Error("첨부 사진을 저장하지 못했습니다.");
        placements.push({ path, offset: Math.max(0, Math.min(offset, Array.from(body).length)), width: image.width });
      }
      await onSave(title.trim(), body, topic, prefix || (post?.prefix ? null : undefined), size === "normal" ? null : size, color, placements, hashtagsChanged ? hashtags : undefined);
    } catch (reason) {
      setPhotoError(failure(reason));
    } finally {
      setWorking(false);
    }
  };
  const prefixes = boards.find(board => board.name === topic)?.prefixes ?? [];
  const originalPrefix = topic === post?.topic ? post.prefix : null;
  const choices = originalPrefix && !prefixes.some(item => item.id === originalPrefix.id)
    ? [...prefixes, originalPrefix] : prefixes;
  return localize(
    <form
      className="standard-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submitPost();
      }}
    >
      <label>
        게시판 분류
        <select value={topic} onChange={(e) => { setTopic(e.target.value); setPrefix(""); }} required>
          {boards.map((board) => (
            <option key={board.name} value={board.name} translate="no">
              {board.labels?.[localize.locale] ?? localize.text(board.name)}
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
      <HashtagInput value={hashtags} invalid={invalidHashtags} change={value => { setHashtagsChanged(true); setHashtags(value); }} />
      <div className="post-format-toolbar" role="group" aria-label="본문 꾸미기">
        <label>본문 글자 크기
          <select value={size} onChange={event => setSize(event.target.value as BodySize)}>
            <option value="small">작게</option><option value="normal">기본</option>
            <option value="large">크게</option><option value="extra-large">아주 크게</option>
          </select>
        </label>
        <label>본문 글자색<input type="color" value={color ?? "#161616"} onChange={event => setColor(event.target.value)} /></label>
        <button type="button" className="button button-light" onClick={() => { setSize("normal"); setColor(null); }}>기본 서식</button>
      </div>
      <div className="community-body-editor">
        <div className="post-format-toolbar">
          <button type="button" className="button button-light" disabled={busy || working || images.length >= maxCommunityImages}
            onClick={() => input.current?.click()}>사진·영상 추가</button>
          <input hidden ref={input} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,.mp4,.webm"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void insertImage(file);
            }} />
          <span>본문에 커서를 놓고 첨부하세요. 영상은 MP4·WebM, 파일당 20MB까지입니다. {images.length}/{maxCommunityImages}</span>
        </div>
        {segments.map((part, index) => {
          const image = images[index];
          const source = image?.source ?? (image?.path ? savedUrls[image.path] : undefined);
          const video = !!image?.file || (!!image?.path && isVideoAttachment(image.path));
          const mediaLabel = video ? "영상" : "사진";
          return <Fragment key={image?.key ?? "last"}>
            <label>{images.length ? (index === 0 ? "첨부 위에 쓸 내용" : "첨부 아래에 쓸 내용") : "내용"}
              <textarea value={part} style={bodyStyle(size, color)} disabled={busy || working}
                placeholder={index === 0 ? "유튜브 링크를 넣으면 게시글에서 바로 재생됩니다." : undefined}
                onFocus={event => { location.current = { segment: index, offset: event.target.selectionStart }; }}
                onSelect={event => { location.current = { segment: index, offset: event.currentTarget.selectionStart }; }}
                onChange={event => {
                  location.current = { segment: index, offset: event.target.selectionStart };
                  const text = event.target.value;
                  setSegments(current => current.map((value, i) => i === index ? text : value));
                }}
                maxLength={Math.max(part.length, 3000 - (rawBody.length - part.length))} rows={images.length ? 4 : 10} />
            </label>
            {image && <div className="community-editor-image">
              {source && <PostAttachment source={source} video={video} width={image.width} index={index} />}
              <div className="post-format-toolbar">
                <label>{mediaLabel} 너비 {image.width}%
                  <input type="range" min={25} max={100} step={5} value={image.width} disabled={busy || working}
                    onChange={event => {
                      const width = Number(event.target.value);
                      setImages(current => current.map((item, i) => i === index ? { ...item, width } : item));
                    }} />
                </label>
                <button className="button button-light" type="button" disabled={busy || working || !part}
                  onClick={() => moveImageAcrossText(index, "up")}>{mediaLabel} 위로</button>
                <button className="button button-light" type="button" disabled={busy || working || !segments[index + 1]}
                  onClick={() => moveImageAcrossText(index, "down")}>{mediaLabel} 아래로</button>
                <button className="button button-light" type="button" disabled={busy || working} onClick={() => removeImage(index)}>{mediaLabel} 삭제</button>
              </div>
            </div>}
          </Fragment>;
        })}
      </div>
      {photoError && <p role="alert">{photoError}</p>}
      <button
        className="button button-dark"
        disabled={busy || working || invalidHashtags || !topic || title.trim().length < 2 || (!images.length && body.length < 3)}
      >
        {busy || working ? "처리 중" : "저장하기"}
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
            <AnonymousLabel label={c.author_label} admin={c.is_admin_author} />
            <time>{dateLabel(c.created_at)}</time>
          </div>
          {c.parent_id && (
            <p className="anonymous-reply-to">
              <span>답글</span> ·{" "}
              <AnonymousLabel
                admin={comments.find((p) => p.id === c.parent_id)?.is_admin_author}
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
                <AnonymousLabel label={reply.author_label} admin={reply.is_admin_author} />
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
