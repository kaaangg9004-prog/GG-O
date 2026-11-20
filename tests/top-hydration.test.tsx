import "./dom-setup";
import test from "node:test";
import assert from "node:assert/strict";
import { act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import {
  RankingClockProvider,
  useRankingClock,
} from "../src/components/ranking-clock";
import { TopPosts } from "../src/components/top-posts";
import { topScore, defaultSiteSettings } from "../src/lib/community";
test("cached HTML hydrates without a time/score mismatch and then advances to the current rolling score", async (t) => {
  const initial = Date.parse("2026-11-16T00:00:00Z"),
    later = initial + 24 * 3600000;
  function Preview() {
    const now = useRankingClock();
    return (
      <><output aria-label="검증용 순위 점수">{topScore(100, 0, new Date(initial).toISOString(), defaultSiteSettings, now).toFixed(1)}</output><TopPosts
        posts={[
          {
            id: "example",
            title: "시간에 따라 바뀌는 순위",
            topic: "자유",
            views: 100,
            comments: 0,
            score: topScore(
              100,
              0,
              new Date(initial).toISOString(),
              defaultSiteSettings,
              now,
            ),
          },
        ]}
        onOpen={() => {}}
        updatedAt={now}
      /></>
    );
  }
  const ui = (
      <RankingClockProvider initialNow={initial}>
        <Preview />
      </RankingClockProvider>
    ),
    container = document.createElement("div");
  container.innerHTML = renderToString(ui);
  document.body.append(container);
  assert.match(container.textContent ?? "", /100\.0/);
  const errors: unknown[] = [];
  t.mock.method(Date, "now", () => later);
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(container, ui, {
        onRecoverableError: (error) => errors.push(error),
      });
    });
    assert.deepEqual(errors, []);
    assert.match(container.textContent ?? "", /50\.0/);
  } finally {
    await act(async () => root?.unmount());
    container.remove();
  }
});
