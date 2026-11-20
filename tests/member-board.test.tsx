import "./dom-setup";
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  cleanup,
  act,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import {
  MemberBoard,
  AnonymousAdmin,
  AnonymousThread,
} from "../src/components/member-board";
import type {
  AnonymousGateway,
  AnonymousPost,
  AnonymousComment,
} from "../src/lib/anonymous-types";
afterEach(() => {
  cleanup();
  localStorage.clear();
});
const date = "2026-11-16T05:00:00Z";
const post: AnonymousPost = {
  id: "post-id",
  title: "서버에서 읽는 익명 글",
  body: "로그인한 회원만 읽는 본문",
  image_path: "",
  topic: "자유",
  tags: [],
  created_at: date,
  updated_at: date,
  comment_count: 2,
  views: 500,
  is_mine: false,
  author_label: "Ẩn danh (Tác giả)",
};
const comments: AnonymousComment[] = [
  {
    id: "c1",
    body: "내 댓글",
    parent_id: null,
    created_at: date,
    updated_at: date,
    is_mine: true,
    author_label: "Ẩn danh 1",
  },
  {
    id: "c2",
    body: "다른 회원의 댓글",
    parent_id: "c1",
    created_at: date,
    updated_at: date,
    is_mine: false,
    author_label: "Ẩn danh 2",
  },
];
const guest = {
  signed_in: false,
  can_write: false,
  is_admin: false,
  status: "guest" as const,
  suspended_until: null,
};
function gateway(): AnonymousGateway {
  return {
    access: async () => guest,
    posts: async () => [post],
    post: async () => post,
    comments: async () => comments,
    write: async () => ({ id: "new" }),
    report: async () => {},
    reports: async () => [],
    moderate: async () => {},
  };
}
test("guests read ordinary and TOP post bodies and comments while writing requires login", async () => {
 for(const filter of ["전체","hot"] as const){
  cleanup();const api=gateway();let prompts=0;
  const ui=render(<MemberBoard gateway={api} initialFilter={filter} onRequireAuth={()=>{prompts++;}}/>);
  fireEvent.click(await ui.findByRole("button",{name:/서버에서 읽는 익명 글/}));
  assert.ok(await ui.findByText(post.body));
  assert.ok(await ui.findByText("다른 회원의 댓글"));
  assert.equal(prompts,0);
  assert.equal(ui.queryByLabelText("익명으로 댓글 쓰기"),null);
  fireEvent.click(ui.getByRole("button",{name:"로그인 후 댓글을 작성할 수 있습니다."}));
  assert.equal(prompts,1);
 }
});
test("a standalone anonymous thread displays public comments but offers no guest write form", async () => {
  const api = gateway();
  let calls = 0;
  api.comments = async () => {
    calls++;
    return comments;
  };
  const ui = render(
    <AnonymousThread
      gateway={api}
      kind="post"
      thread={post.id}
      access={guest}
      onRequireAuth={() => {}}
    />,
  );
  assert.ok(await ui.findByText("다른 회원의 댓글"));
  assert.equal(calls, 1);
  assert.equal(ui.queryByLabelText("익명으로 댓글 쓰기"),null);
  assert.ok(
    ui.getByRole("button", { name: "로그인 후 댓글을 작성할 수 있습니다." }),
  );
});
test("owner controls use is_mine, replies reuse parent IDs, and nonowners have no edit/delete controls", async () => {
  const api = gateway(),
    writes: unknown[] = [];
  api.write = async (action, data) => {
    writes.push({ action, data });
    return { id: "new" };
  };
  const access = {
    ...guest,
    signed_in: true,
    can_write: true,
    status: "active" as const,
  };
  const ui = render(
    <AnonymousThread
      gateway={api}
      kind="post"
      thread={post.id}
      access={access}
      onRequireAuth={() => {}}
    />,
  );
  await ui.findByText("다른 회원의 댓글");
  assert.equal(ui.getAllByRole("button", { name: "댓글 수정" }).length, 1);
  assert.equal(ui.getAllByRole("button", { name: "삭제" }).length, 1);
  const other = ui.getByText("다른 회원의 댓글").closest("article")!;
  fireEvent.click(within(other).getByRole("button", { name: "답글" }));
  fireEvent.change(ui.getByLabelText("익명으로 댓글 쓰기"), {
    target: { value: "대화 이어가기" },
  });
  fireEvent.click(ui.getByRole("button", { name: "댓글 등록" }));
  await waitFor(() =>
    assert.deepEqual(writes, [
      {
        action: "comment.create",
        data: { post_id: "post-id", body: "대화 이어가기", parent_id: "c2" },
      },
    ]),
  );
});
test("suspended members may read but cannot compose or expose owner controls", async () => {
  const api = gateway(),
    access = { ...guest, signed_in: true, status: "suspended" as const };
  api.access = async () => access;
  const ui = render(
    <AnonymousThread
      gateway={api}
      kind="post"
      thread={post.id}
      access={access}
      onRequireAuth={() => {}}
    />,
  );
  await ui.findByText("내 댓글");
  assert.equal(ui.queryByRole("textbox"), null);
  assert.equal(ui.queryByRole("button", { name: "댓글 수정" }), null);
  assert.ok(
    ui.getByText("정지 또는 차단된 계정은 작성·수정·삭제할 수 없습니다."),
  );
});
test("administrator identities are loaded only in the separate view and sanctions require explicit confirmation", async () => {
  const api = gateway(),
    actions: unknown[] = [];
  api.reports = async () => [
    {
      id: "report",
      target_kind: "comment",
      target_id: "c1",
      reason: "관리자 확인 요청",
      created_at: date,
      resolved_at: null,
      action: null,
      user_id: "private-member-id",
      email: "private@example.test",
      ip_address: "203.0.113.22",
      body: "신고된 댓글",
      member_status: "active",
      suspended_until: null,
    },
  ];
  api.moderate = async (...args) => {
    actions.push(args);
  };
  const ui = render(<AnonymousAdmin gateway={api} />);
  await ui.findByText("private@example.test");
  assert.ok(ui.getByText("203.0.113.22"));
  fireEvent.click(ui.getByRole("checkbox"));
  fireEvent.click(ui.getByRole("button", { name: "7일 정지" }));
  assert.equal(actions.length, 0);
  fireEvent.click(ui.getByRole("button", { name: "조치 적용" }));
  await waitFor(() =>
    assert.deepEqual(actions, [["report", "suspend_7d", true]]),
  );
  assert.equal(localStorage.length, 0);
});
