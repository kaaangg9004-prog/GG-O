"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { anonymousGateway } from "@/lib/anonymous-service";
import { loadCommunityBoards, manageCommunityBoard, moveCommunityBoard } from "@/lib/community-boards";
import type { CommunityBoard } from "@/lib/community-boards";
import type { AnonymousPost } from "@/lib/anonymous-types";
import { CommunityPostTitle } from "./member-board";

type BoardAction = (action: string, data: Record<string, unknown>) => Promise<void>;
const message = (error: unknown) => error instanceof Error ? error.message : "게시판 요청에 실패했습니다.";
const titleColors = [
  ["딸기 우유", "#f2a5b7"],
  ["살구", "#f5ad85"],
  ["레몬 크림", "#f1d383"],
  ["민트", "#97d4b3"],
  ["하늘", "#9fcaf5"],
  ["페리윙클", "#a6b1ed"],
  ["라벤더", "#c9a9eb"],
  ["아쿠아", "#8dd1d4"],
  ["연회색", "#c3c7d3"],
  ["검정", "#161616"],
];

function TitleColorPalette({ color, label }: { color: string; label: string }) {
  const current = color.toLowerCase();
  const colors = titleColors.some(([, value]) => value === current)
    ? titleColors
    : [["기존 색상", current], ...titleColors];
  return <fieldset className="title-color-palette">
    <legend>{label}</legend>
    <div className="title-color-swatches">
      {colors.map(([name, value]) => <label key={value} title={name}>
        <input type="radio" name="color" value={value} defaultChecked={value === current} aria-label={name} />
        <span style={{ backgroundColor: value }} aria-hidden="true" />
      </label>)}
    </div>
  </fieldset>;
}

export function CommunityBoardAdmin() {
  const gateway = useMemo(anonymousGateway, []);
  const [boards, setBoards] = useState<CommunityBoard[]>([]);
  const [selected, setSelected] = useState("");
  const [posts, setPosts] = useState<AnonymousPost[]>([]);
  const [query, setQuery] = useState("");
  const [revision, refresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const board = boards.find(item => item.name === selected);
  const boardIndex = boards.findIndex(item => item.name === selected);

  useEffect(() => {
    let active = true;
    void loadCommunityBoards(true).then(items => {
      if (!active) return;
      setBoards(items);
      setSelected(current => items.some(item => item.name === current) ? current : items[0]?.name ?? "");
    }).catch(reason => { if (active) setError(message(reason)); });
    return () => { active = false; };
  }, [revision]);

  useEffect(() => {
    setPosts([]);
    if (!board?.active || !gateway?.highlights) return;
    let active = true;
    void gateway.highlights(board.name)
      .then(rows => {
        if (!active) return;
        const matches = query.trim().toLocaleLowerCase();
        setPosts(rows.filter(post => post.notice && post.title.toLocaleLowerCase().includes(matches)));
      })
      .catch(reason => { if (active) setError(message(reason)); });
    return () => { active = false; };
  }, [board, gateway, query, revision]);

  const save = async (task: () => Promise<void>, success: string) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setResult("");
    try {
      await task();
      refresh(value => value + 1);
      setResult(success);
    } catch (reason) {
      setError(message(reason));
      throw reason;
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  const act: BoardAction = (action, data) => save(async () => {
    await manageCommunityBoard(action, data);
    if (action === "board.create" && typeof data.board === "string") setSelected(data.board);
  }, "저장했습니다.");
  const submit = (action: string, data: Record<string, unknown>) => { void act(action, data).catch(() => {}); };
  const move = (step: -1 | 1) => {
    if (!board) return;
    void save(async () => {
      await moveCommunityBoard(board.name, step);
      setBoards(await loadCommunityBoards(true));
    }, "게시판 순서를 변경했습니다.").catch(() => {});
  };

  return <section className="standard-form" aria-label="게시판 관리">
    <h2>게시판 관리</h2>
    {error && <p role="alert">{error}</p>}
    {result && <p role="status">{result}</p>}
    <div className="board-management-layout">
    <aside className="standard-form board-management-sidebar" aria-label="게시판 목록과 설정">
    <ul className="board-management-list" aria-label="게시판 목록">
      {boards.map(item => <li key={item.name}>
        <button type="button" aria-pressed={selected === item.name} disabled={busy}
          onClick={() => { setSelected(item.name); setQuery(""); }}>{item.name}</button>
      </li>)}
    </ul>
    <form className="standard-form" onSubmit={event => {
      event.preventDefault();
      const form = event.currentTarget;
      const name = String(new FormData(form).get("board") ?? "").trim();
      if (name) void act("board.create", { board: name }).then(() => form.reset()).catch(() => {});
    }}>
      <label>새 게시판 이름<input name="board" maxLength={30} required /></label>
      <button className="button button-dark" disabled={busy}>게시판 추가</button>
    </form>

    {board && <div className="standard-form">
      <div className="board-admin-prefix" role="group" aria-label="게시판 순서 변경">
        <button type="button" className="button button-light" disabled={busy || boardIndex <= 0} onClick={() => move(-1)}>↑ 위로</button>
        <button type="button" className="button button-light" disabled={busy || boardIndex >= boards.length - 1} onClick={() => move(1)}>↓ 아래로</button>
      </div>
      <button className="button button-light" disabled={busy} onClick={() => {
        if (!board.active || window.confirm("게시판을 숨길까요? 기존 글과 댓글은 보관되며 다시 표시할 수 있습니다.")) {
          submit("board.update", { board: board.name, active: !board.active });
        }
      }}>{board.active ? "게시판 삭제(숨김)" : "게시판 다시 표시"}</button>
    </div>}
    </aside>
    <div className="standard-form board-management-content" aria-label="공지와 말머리 관리">
      {board && <h3>{board.name}</h3>}
      {board && !board.active && <p>숨김 상태입니다. 게시판을 다시 표시하면 공지와 말머리를 관리할 수 있습니다.</p>}
      {board?.active && <>
        <h3>말머리 관리</h3>
        <form key={board.name} className="standard-form" onSubmit={event => {
          event.preventDefault();
          const form = event.currentTarget;
          const fields = new FormData(form);
          const label = String(fields.get("label") ?? "").trim();
          if (label) void act("prefix.save", { board: board.name, label, color: fields.get("color") })
            .then(() => form.reset()).catch(() => {});
        }}>
          <label>새 말머리<input name="label" maxLength={24} required /></label>
          <TitleColorPalette color="#9fcaf5" label="말머리 색상" />
          <button className="button button-dark" disabled={busy}>말머리 추가</button>
        </form>
        {board.prefixes.filter(prefix => prefix.label !== "공지").map(prefix => <form
          key={prefix.id + prefix.color + prefix.active}
          className="board-admin-prefix"
          onSubmit={event => {
            event.preventDefault();
            submit("prefix.save", { board: board.name, label: prefix.label, color: new FormData(event.currentTarget).get("color") });
          }}
        >
          <span><span className="community-title-prefix" style={{ color: `color-mix(in srgb, ${prefix.color} 60%, #161616)` }}>[{prefix.label}]</span>글제목{prefix.active ? "" : " (사용 중지)"}</span>
          <TitleColorPalette color={prefix.color} label={prefix.label + " 말머리 색상"} />
          <button className="button button-light" disabled={busy}>{prefix.active ? "색상 저장" : "다시 사용"}</button>
          {prefix.active && <button type="button" className="button button-light" disabled={busy} onClick={() => {
            if (window.confirm("말머리를 삭제할까요? 기존 글의 말머리는 유지됩니다.")) {
              submit("prefix.archive", { board: board.name, id: prefix.id });
            }
          }}>말머리 삭제</button>}
        </form>)}

        <h3>게시판 공지</h3>
        <form key={board.name + board.notice_color} className="board-admin-prefix" onSubmit={event => {
          event.preventDefault();
          submit("board.update", { board: board.name, notice_color: new FormData(event.currentTarget).get("color") });
        }}>
          <TitleColorPalette color={board.notice_color ?? "#c23147"} label="[공지] 말머리 색상" />
          <button className="button button-light" disabled={busy}>공지 색상 저장</button>
        </form>
        <NoticeForm key={board.name} busy={busy} save={(title, body) => act("notice.create", { board: board.name, title, body })} />

        <h3>게시판 공지 관리</h3>
        <form key={board.name} className="board-admin-prefix" onSubmit={event => {
          event.preventDefault();
          setQuery(String(new FormData(event.currentTarget).get("query") ?? "").trim());
        }}>
          <label>공지 제목 검색<input name="query" maxLength={100} /></label>
          <button className="button button-light">검색</button>
        </form>
        {posts.length === 0 && <p>표시할 공지가 없습니다.</p>}
        {posts.map(post => <details key={post.id} className="board-admin-post">
          <summary><CommunityPostTitle post={post} /></summary>
          <NoticeForm key={post.updated_at} post={post} busy={busy} save={(title, body) => act("notice.update", { board: board.name, id: post.id, title, body })} />
          <button className="button button-light" disabled={busy} onClick={() => {
            if (window.confirm("이 공지를 게시판에서 내릴까요?")) submit("notice.archive", { board: board.name, id: post.id });
          }}>공지 삭제</button>
        </details>)}
      </>}
    </div>
    </div>
  </section>;
}

function NoticeForm({ post, busy, save }: {
  post?: AnonymousPost;
  busy: boolean;
  save: (title: string, body: string) => Promise<void>;
}) {
  return <form className="standard-form" onSubmit={event => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    void save(String(fields.get("title") ?? "").trim(), String(fields.get("body") ?? "").trim())
      .then(() => { if (!post) form.reset(); }).catch(() => {});
  }}>
    <label>공지 제목<input name="title" minLength={2} maxLength={100} defaultValue={post?.title} required /></label>
    <label>공지 내용<textarea name="body" minLength={3} maxLength={3000} rows={4} defaultValue={post?.body} required /></label>
    <button className="button button-dark" disabled={busy}>{post ? "공지 수정" : "공지 올리기"}</button>
  </form>;
}
