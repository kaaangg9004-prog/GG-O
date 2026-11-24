import assert from "node:assert/strict";
import test from "node:test";
import { splitYouTubeLinks, youtubeEmbedUrl } from "../src/lib/community-youtube";

test("recognized YouTube links become inline players while retaining surrounding text", () => {
  const id = "M7lc1UVf-VE";
  const embed = `https://www.youtube-nocookie.com/embed/${id}?playsinline=1`;
  for (const link of [
    `https://www.youtube.com/watch?v=${id}&feature=share`,
    `https://youtu.be/${id}?si=shared`,
    `https://m.youtube.com/shorts/${id}`,
    `youtube.com/live/${id}`,
  ]) assert.equal(youtubeEmbedUrl(link), embed);
  assert.deepEqual(splitYouTubeLinks(`앞 글\nhttps://youtu.be/${id}\n뒤 글`), [
    { text: "앞 글\n" }, { embed }, { text: "\n뒤 글" },
  ]);
  assert.equal(youtubeEmbedUrl(`https://youtu.be.example.test/${id}`), null);
  assert.equal(youtubeEmbedUrl("https://www.youtube.com/watch?v=bad"), null);
});
