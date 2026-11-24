import assert from "node:assert/strict";
import test from "node:test";
import { communityPostId, communityPostUrl } from "../src/lib/community-post-link";
import { highlightHashtags } from "../src/lib/community-hashtags";
import { contentShareRoute, contentShareUrl } from "../src/lib/content-share-link";

test("shared post links round-trip on the same site and reject invalid IDs", () => {
  const id = "a0000000-0000-4000-8000-000000000001";
  const url = new URL(communityPostUrl("https://www.gg-o.net", id));
  assert.equal(url.origin, "https://www.gg-o.net");
  assert.equal(communityPostId(url.hash), id);
  assert.equal(communityPostId("#community?id=invalid"), null);
  assert.equal(communityPostId(`#news?id=${id}`), null);
});

test("committed hashtags turn blue and removing a separator returns them to editing", () => {
  const completed = (input: string, offset: number | null = null) =>
    highlightHashtags(input, offset).filter(part => part.complete).map(part => part.text);
  assert.deepEqual(completed("#여행 #맛집,서울"), ["#여행", "#맛집"]);
  assert.deepEqual(completed("#여행 #맛집"), ["#여행"]);
  assert.deepEqual(completed("#여행 #맛집,", 7), ["#여행"]);
  assert.deepEqual(completed("# "), []);
});

test("all five share URLs retain their detail route without a fragment", () => {
  for (const section of ["community", "polls", "journal", "news", "events"] as const) {
    const url = new URL(contentShareUrl("https://www.gg-o.net", section, "sample-1"));
    assert.equal(url.hash, "");
    assert.equal(contentShareRoute(url), `#${section}?id=sample-1`);
    url.hash = "#home";
    assert.equal(contentShareRoute(url), "#home");
  }
});
