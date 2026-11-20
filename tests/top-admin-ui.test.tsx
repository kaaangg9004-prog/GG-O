import "./dom-setup";
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import Experience from "../src/components/experience";
import { MemberBoard } from "../src/components/member-board";
import { AdminConsole } from "../src/components/admin-console";
import { defaultSiteSettings } from "../src/lib/community";
import type { AnonymousGateway } from "../src/lib/anonymous-types";
import type { SiteAdminGateway } from "../src/lib/site-admin";
import { seedPosts } from "../src/lib/data";
import { readState, STORAGE_KEY } from "../src/lib/store";
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});
const adminNav = (ui: ReturnType<typeof render>) =>
  within(ui.getByRole("navigation", { name: "사이트 관리 메뉴" }));
const navigation = (ui: ReturnType<typeof render>) =>
  within(ui.getByRole("navigation", { name: "주 메뉴" }));
test("community exposes all seven spaces and TOP posts, with no post recommendation button", (t) => {
  t.mock.timers.enable({apis:["Date"],now:new Date(Math.max(...seedPosts.map(p=>Date.parse(p.createdAt)))+60000)});
  window.history.replaceState(null, "", "/#community");
  const ui = render(<Experience authenticated />),
    tabs = ui.getByRole("group", { name: "게시판 분류" });
  assert.deepEqual(
    within(tabs)
      .getAllByRole("button")
      .map((b) => b.textContent),
    ["TOP 글", "전체", "자유", "밈", "연예인", "취미", "패션", "음악", "애니메이션"],
  );
  assert.equal(within(tabs).getByRole("button", { name: "TOP 글" }).getAttribute("aria-pressed"), "true");
  assert.equal(ui.container.querySelector(".community-portals"), null);
  assert.ok(ui.getByText(/편하게 이야기하되, 서로를 존중해 주세요/));
  fireEvent.click(within(tabs).getByRole("button", { name: "밈" }));
  assert.ok(ui.getByText(seedPosts[5].title));
  assert.equal(ui.queryByText(seedPosts[0].title), null);
  fireEvent.click(within(tabs).getByRole("button", { name: "TOP 글" }));
  const ranking = ui.getByRole("region", { name: "TOP 글 실시간 순위" });
  assert.ok(within(ranking).getByText("인기 이야기"));
  fireEvent.click(within(ranking).getAllByRole("button")[0]);
  const detail = within(ui.getByRole("dialog"));
  assert.equal(detail.queryByRole("button", { name: /추천|좋아요/ }), null);
  assert.ok(detail.getByRole("button", { name: "글 저장" }));
});
test("the operator changes score/announcement settings and manages posts/comments from the central console", async () => {
  window.history.replaceState(null, "", "/#admin");
  const ui = render(<Experience authenticated accountLabel="BBBB" />);
  assert.ok(ui.getByRole("heading", { name: "사이트 관리." }));
  fireEvent.click(adminNav(ui).getByRole("button", { name: "사이트 설정" }));
  fireEvent.change(ui.getByLabelText("최소 선정 점수"), {
    target: { value: "1" },
  });
  fireEvent.change(ui.getByLabelText("한국어 공지"), {
    target: { value: "운영자가 등록한 사이트 공지" },
  });
  fireEvent.click(ui.getByRole("button", { name: "사이트 설정 저장" }));
  await waitFor(() =>
    assert.equal(
      readState(localStorage.getItem(STORAGE_KEY)).settings.topMinScore,
      1,
    ),
  );
  assert.equal(
    ui.container.querySelector(".site-notice")?.textContent,
    "운영자가 등록한 사이트 공지",
  );
  fireEvent.click(adminNav(ui).getByRole("button", { name: "게시글·댓글" }));
  const row = ui
    .getByRole("heading", { name: seedPosts[0].title })
    .closest("article")!;
  fireEvent.change(within(row).getByRole("combobox"), {
    target: { value: "음악" },
  });
  fireEvent.click(within(row).getByRole("button", { name: "분류 저장" }));
  await waitFor(() =>
    assert.equal(
      readState(localStorage.getItem(STORAGE_KEY)).posts.find(
        (p) => p.id === "post-1",
      )?.topic,
      "음악",
    "애니메이션",
    ),
  );
  fireEvent.click(within(row).getByText("댓글 관리 (1)"));
  fireEvent.click(within(row).getByRole("button", { name: "댓글 숨김" }));
  await waitFor(() =>
    assert.ok(
      readState(localStorage.getItem(STORAGE_KEY)).hiddenComments.includes(
        "c-1",
      ),
    ),
  );
  fireEvent.click(within(row).getByRole("button", { name: "게시글 숨김" }));
  await waitFor(() =>
    assert.ok(
      readState(localStorage.getItem(STORAGE_KEY)).hiddenPosts.includes(
        "post-1",
      ),
    ),
  );
  fireEvent.click(navigation(ui).getByRole("link", { name: "커뮤니티" }));
  assert.equal(ui.queryByText(seedPosts[0].title), null);
});
test("ordinary users cannot enter management or trigger private management fetches", () => {
  let calls = 0;
  const gateway = {
    overview: async () => {
      calls++;
      return {};
    },
  } as SiteAdminGateway;
  const ui = render(
    <AdminConsole
      authorized={false}
      demo={false}
      settings={defaultSiteSettings}
      stats={{}}
      posts={[]}
      members={[]}
      gateway={gateway}
      panels={{}}
      onSettings={async () => {}}
      onPost={async () => {}}
      onComment={async () => {}}
      onMember={async () => {}}
    />,
  );
  assert.ok(ui.getByRole("heading", { name: "운영자 권한이 필요합니다." }));
  assert.equal(calls, 0);
  assert.equal(
    ui.queryByRole("navigation", { name: "사이트 관리 메뉴" }),
    null,
  );
});
test("a safe live feed refresh immediately reorders TOP without closing a post or losing a comment draft", async () => {
  const date = new Date().toISOString(),
    base = {
      image_path: "",
      topic: "밈",
      tags: [],
      created_at: date,
      updated_at: date,
      is_mine: false,
      author_label: "Ẩn danh (Tác giả)",
      comment_count: 0,
    };
  let high = false,
    feeds = 0;
  const first = {
      ...base,
      id: "first",
      title: "첫 순위 글",
      body: "첫 번째 본문",
      views: 100,
      score: 100,
    },
    second = {
      ...base,
      id: "second",
      title: "둘째 순위 글",
      body: "두 번째 본문",
      views: 80,
      score: 80,
    };
  const api: AnonymousGateway = {
    access: async () => ({
      signed_in: true,
      can_write: true,
      is_admin: false,
      status: "active",
      suspended_until: null,
    }),
    settings: async () => defaultSiteSettings,
    posts: async () => [first, second],
    feed: async () => {
      feeds++;
      return high
        ? [{ ...second, views: 200, score: 200 }, first]
        : [first, second];
    },
    post: async (id) => (id === "first" ? first : second),
    comments: async () => [],
    write: async () => ({ id: "new" }),
    report: async () => {},
    reports: async () => [],
    moderate: async () => {},
  };
  const ui = render(
    <MemberBoard gateway={api} authenticated initialFilter="hot" />,
  );
  await ui.findByRole("button", { name: /첫 순위 글/ });
  fireEvent.click(ui.getByRole("button", { name: /첫 순위 글/ }));
  await ui.findByText("첫 번째 본문");
  const field = ui.getByLabelText("익명으로 댓글 쓰기") as HTMLTextAreaElement;
  fireEvent.change(field, { target: { value: "작성 중인 댓글" } });
  high = true;
  fireEvent(document, new Event("visibilitychange"));
  await waitFor(() =>
    assert.match(
      ui.container.querySelector(".top-ranking-list>li")?.textContent ?? "",
      /둘째 순위 글/,
    ),
  );
  assert.ok(
    ui.getByLabelText("익명으로 댓글 쓰기") === field,
    "the existing comment field must survive ranking refresh",
  );
  assert.equal(field.value, "작성 중인 댓글");
  assert.ok(feeds >= 3);
});
test("magazine registration in the console persists and appears on the public magazine screen", async () => {
  window.history.replaceState(null, "", "/#admin");
  const ui = render(<Experience authenticated accountLabel="BBBB" />);
  fireEvent.click(adminNav(ui).getByRole("button", { name: "매거진 관리" }));
  fireEvent.click(ui.getByRole("button", { name: "매거진 등록" }));
  fireEvent.change(ui.getByLabelText("매거진 제목"), {
    target: { value: "운영자가 등록한 새 매거진" },
  });
  fireEvent.change(ui.getByLabelText("매거진 분류"), {
    target: { value: "새 이야기" },
  });
  fireEvent.change(ui.getByLabelText("매거진 본문"), {
    target: { value: "직접 작성한 매거진의 본문입니다." },
  });
  fireEvent.click(ui.getByRole("button", { name: "매거진 저장" }));
  await waitFor(() => assert.ok(ui.queryByRole("dialog") === null));
  assert.ok(
    readState(localStorage.getItem(STORAGE_KEY)).articleEdits.some(
      (a) => a.title === "운영자가 등록한 새 매거진",
    ),
  );
  fireEvent.click(ui.getByRole("button", { name: "메뉴 열기" }));
  fireEvent.click(
    within(ui.getByRole("navigation", { name: "모바일 메뉴" })).getByRole(
      "button",
      { name: "매거진" },
    ),
  );
  assert.ok(ui.getByRole("heading", { name: "운영자가 등록한 새 매거진" }));
});

test("an older polling response cannot overwrite a newer read-triggered ranking", async () => {
  const date = new Date().toISOString(),
    base = {
      image_path: "",
      topic: "자유",
      tags: [],
      created_at: date,
      updated_at: date,
      is_mine: false,
      author_label: "Ẩn danh (Tác giả)",
      comment_count: 0,
    };
  const a = {
      ...base,
      id: "a",
      title: "먼저 읽은 글",
      body: "먼저 읽은 본문",
      views: 100,
      score: 100,
    },
    b = {
      ...base,
      id: "b",
      title: "새로 올라온 글",
      body: "새 본문",
      views: 200,
      score: 200,
    };
  let calls = 0,
    resolveOld: ((value: (typeof a)[]) => void) | undefined;
  const api: AnonymousGateway = {
    access: async () => ({
      signed_in: true,
      can_write: true,
      is_admin: false,
      status: "active",
      suspended_until: null,
    }),
    settings: async () => defaultSiteSettings,
    posts: async () => [a, b],
    feed: async () => {
      calls++;
      if (calls === 2)
        return new Promise((resolve) => {
          resolveOld = resolve;
        });
      return calls >= 3 ? [b, a] : [a, b];
    },
    post: async () => a,
    comments: async () => [],
    write: async () => ({ id: "new" }),
    report: async () => {},
    reports: async () => [],
    moderate: async () => {},
  };
  const ui = render(
    <MemberBoard gateway={api} authenticated initialFilter="hot" />,
  );
  await ui.findByRole("button", { name: /먼저 읽은 글/ });
  fireEvent(document, new Event("visibilitychange"));
  await waitFor(() => assert.ok(resolveOld));
  fireEvent.click(ui.getByRole("button", { name: /먼저 읽은 글/ }));
  await waitFor(() =>
    assert.match(
      ui.container.querySelector(".top-ranking-list>li")?.textContent ?? "",
      /새로 올라온 글/,
    ),
  );
  await act(async () => resolveOld!([a, b]));
  assert.match(
    ui.container.querySelector(".top-ranking-list>li")?.textContent ?? "",
    /새로 올라온 글/,
  );
});

test("the administrator can restrict and restore AAAA while BBBB remains protected", async () => {
  window.history.replaceState(null, "", "/#admin");
  let ui = render(<Experience authenticated accountLabel="BBBB" />);
  fireEvent.click(adminNav(ui).getByRole("button", { name: "회원 관리" }));
  assert.ok(ui.getByText("운영자 보호"));
  const member = ui
    .getByText("AAAA", { exact: true, selector: "strong" })
    .closest("article")!;
  fireEvent.click(within(member).getByRole("button", { name: "영구 차단" }));
  fireEvent.click(
    within(ui.getByRole("dialog")).getByRole("button", { name: "조치 적용" }),
  );
  await waitFor(() =>
    assert.equal(
      readState(localStorage.getItem(STORAGE_KEY)).demoMemberStatuses.AAAA
        .status,
      "banned",
    ),
  );
  cleanup();
  window.history.replaceState(null, "", "/#community");
  ui = render(<Experience authenticated accountLabel="AAAA" />);
  fireEvent.click(ui.getByRole("button", { name: "글쓰기" }));
  assert.ok(ui.queryByRole("dialog") === null);
  assert.ok(ui.getByText("게시글·댓글 작성이 잠시 중단되었습니다."));
  cleanup();
  window.history.replaceState(null, "", "/#admin");
  ui = render(<Experience authenticated accountLabel="BBBB" />);
  fireEvent.click(adminNav(ui).getByRole("button", { name: "회원 관리" }));
  const restricted = ui
    .getByText("AAAA", { exact: true, selector: "strong" })
    .closest("article")!;
  fireEvent.click(
    within(restricted).getByRole("button", { name: "이용 제한 해제" }),
  );
  fireEvent.click(
    within(ui.getByRole("dialog")).getByRole("button", { name: "조치 적용" }),
  );
  await waitFor(() =>
    assert.equal(
      readState(localStorage.getItem(STORAGE_KEY)).demoMemberStatuses.AAAA
        .status,
      "active",
    ),
  );
});
