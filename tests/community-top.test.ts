import test from "node:test";
import assert from "node:assert/strict";
import { boardCategories } from "../src/lib/types";
import {
  defaultSiteSettings,
  hotEligible,
  normalizeBoardCategory,
  parseSiteSettings,
  recordPostView,
  topScore,
} from "../src/lib/community";
import { readState } from "../src/lib/store";
import { seedPosts } from "../src/lib/data";
import { manageLocalPost, postIsHot } from "../src/lib/site-admin";
const now = Date.parse("2026-11-16T06:00:00Z"),
  fresh = new Date(now).toISOString();
test("the seven requested categories restore old categories without dropping posts", () => {
  assert.deepEqual(boardCategories, [
    "전체",
    "자유",
    "밈",
    "연예인",
    "취미",
    "패션",
    "음악",
    "애니메이션",
  ]);
  assert.equal(normalizeBoardCategory("뷰티"), "패션");
  assert.equal(normalizeBoardCategory("케이팝"), "음악");
  assert.equal(normalizeBoardCategory("정보"), "자유");
  const state = readState(
    JSON.stringify({
      ...readState(null),
      posts: [{ ...seedPosts[0], id: "legacy", topic: "케이팝" }],
    }),
  );
  assert.equal(state.posts[0].topic, "음악");
});
test("TOP combines only reads/comments with continuous decay and exact eligibility boundaries", () => {
  const settings = { ...defaultSiteSettings, topMinScore: 50 };
  assert.equal(topScore(20, 2, fresh, settings, now), 50);
  assert.equal(hotEligible(20, 2, fresh, settings, now), true);
  assert.equal(hotEligible(19, 2, fresh, settings, now), false);
  assert.equal(topScore(100, 0, fresh, settings, now + 24 * 3600000), 50);
  assert.equal(topScore(100, 0, fresh, settings, now + 48 * 3600000), 25);
  const beforeMidnight = Date.parse("2026-11-16T23:59:59Z"),
    afterMidnight = beforeMidnight + 2000;
  assert.ok(
    Math.abs(
      topScore(100, 3, fresh, settings, beforeMidnight) -
        topScore(100, 3, fresh, settings, afterMidnight),
    ) < 0.01,
    "no daily reset",
  );
  assert.equal(hotEligible(1000000, 10000, fresh, settings, now - 1), false);
  assert.equal(
    hotEligible(1000000, 10000, fresh, settings, now + 8 * 86400000),
    false,
  );
});
test("daily demo view deduplication does not reset scores and hidden/deleted posts cannot collect views", () => {
  let state = readState(null),
    post = { ...seedPosts[0], views: 0, createdAt: fresh };
  state.posts = [post];
  state = recordPostView(state, post, now);
  assert.equal(state.posts[0].views, 1);
  assert.equal(recordPostView(state, state.posts[0], now + 10), state);
  state = recordPostView(state, state.posts[0], now + 86400000);
  assert.equal(state.posts[0].views, 2);
  state = manageLocalPost(state, state.posts[0], "hide");
  assert.equal(
    recordPostView(state, state.posts[0], now + 2 * 86400000),
    state,
  );
  state = manageLocalPost(state, state.posts[0], "delete");
  assert.equal(postIsHot(state.posts[0], state), false);
});
test("site settings validate score, comment weight, decay and public notices without dropping zero/decimal errors", () => {
  assert.ok(parseSiteSettings(defaultSiteSettings));
  assert.ok(parseSiteSettings({ ...defaultSiteSettings, topMinScore: 0.5 }));
  for (const patch of [
    { topMinScore: 0 },
    { topMinScore: Infinity },
    { commentWeight: 0 },
    { commentWeight: 2.5 },
    { halfLifeHours: 0 },
    { halfLifeHours: 169 },
    { topDays: 31 },
    { notice: { ko: "", vi: "" } },
  ])
    assert.equal(parseSiteSettings({ ...defaultSiteSettings, ...patch }), null);
});
