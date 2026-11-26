import "./dom-setup";
import assert from "node:assert/strict";
import test from "node:test";
import { fireEvent, render, within } from "@testing-library/react";
import { MemberBoard } from "../src/components/member-board";
import type { AnonymousGateway, AnonymousPost } from "../src/lib/anonymous-types";
import type { CommunityBoard } from "../src/lib/community-boards";

test("live navigation waits for the server before showing board names", async () => {
  let deliver!: (boards: CommunityBoard[]) => void;
  const catalog = new Promise<CommunityBoard[]>(resolve => { deliver = resolve; });
  const gateway = {
    boards: () => catalog,
    posts: async () => [],
    access: async () => ({ signed_in: false, can_write: false, is_admin: false, status: "guest", suspended_until: null }),
  } as unknown as AnonymousGateway;
  const ui = render(<MemberBoard gateway={gateway} />);
  try {
    assert.equal(ui.queryByRole("button", { name: "음악" }), null);
    assert.equal(ui.queryByRole("button", { name: "취미" }), null);
    deliver([{ name: "현재 게시판", position: 0, active: true, prefixes: [] }]);
    await ui.findByRole("button", { name: "현재 게시판" });
    assert.equal(ui.queryByRole("button", { name: "음악" }), null);
  } finally {
    ui.unmount();
  }
});

test("a shared post opens directly and its link can be copied", async () => {
  const id = "a0000000-0000-4000-8000-000000000001";
  const post: AnonymousPost = {
    id, title: "공유 시험 글", body: "공유 시험 본문", image_path: "", topic: "자유",
    tags: ["여행"], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    comment_count: 0, is_mine: false, author_label: "Ẩn danh (Tác giả)", is_admin_author: true,
  };
  const gateway = {
    posts: async () => [],
    post: async (requested: string) => { assert.equal(requested, id); return post; },
    comments: async () => [],
    access: async () => ({ signed_in: false, can_write: false, is_admin: false, status: "guest", suspended_until: null }),
  } as unknown as AnonymousGateway;
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  let copied = "";
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value: string) => { copied = value; } } });
  const ui = render(<MemberBoard gateway={gateway} sharedPostId={id} />);
  try {
    const detail = within(await ui.findByRole("region", { name: "게시글" }));
    assert.equal(ui.queryByRole("dialog"), null);
    assert.ok(detail.getByText("공유 시험 본문"));
    assert.ok(detail.getByText("운영자"));
    fireEvent.click(detail.getByRole("button", { name: "링크 복사" }));
    await detail.findByText("링크를 복사했습니다.");
    assert.equal(copied, `${window.location.origin}/?share=community&id=${id}`);
    assert.equal((detail.getByRole("textbox", { name: "게시글 주소" }) as HTMLInputElement).value, copied);
    fireEvent.click(detail.getByRole("button", { name: "공유하기" }));
    assert.ok(detail.getByRole("link", { name: "Facebook" }));
    assert.ok(detail.getByRole("link", { name: "X" }));
    for (const name of ["Facebook Messenger", "Instagram", "Instagram DM", "카카오톡", "Zalo"]) {
      assert.ok(detail.getByRole("button", { name }));
    }
  } finally {
    ui.unmount();
    if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});

test("a directly opened post shows nearby board titles and category click returns to the list", async () => {
  const posts = Array.from({length:5}, (_,i): AnonymousPost => ({
    id: `a0000000-0000-4000-8000-00000000000${i+1}`, title: `이웃 글 ${i+1}`, body: "본문",
    topic: "자유", image_path: "", tags: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    comment_count: 0, is_mine: false, author_label: "익명",
  }));
  const gateway = {
    boards: async () => [{name:"자유",position:0,active:true,prefixes:[]}],
    feed: async () => posts, post: async (id: string) => posts.find(post => post.id === id),
    comments: async () => [],
    access: async () => ({ signed_in: false, can_write: false, is_admin: false, status: "guest", suspended_until: null }),
  } as unknown as AnonymousGateway;
  const ui = render(<MemberBoard gateway={gateway} initialFilter="자유" sharedPostId={posts[2].id} />);
  try {
    const neighbors = within(await ui.findByRole("navigation", {name:"앞뒤 게시글"}));
    assert.deepEqual(neighbors.getAllByRole("link").map(link=>link.textContent), ["이웃 글 1","이웃 글 2","이웃 글 4","이웃 글 5"]);
    fireEvent.click(ui.getByRole("button",{name:"자유"}));
    assert.equal(ui.queryByRole("region",{name:"게시글"}),null);
    assert.ok(await ui.findByRole("button",{name:/이웃 글 3/}));
  } finally { ui.unmount(); window.history.replaceState(null,"","/"); }
});
