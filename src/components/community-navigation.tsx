"use client";
import { Flame } from "lucide-react";
import { boardCategories } from "@/lib/types";
import { HOT_TITLE } from "@/lib/community";
import type { CommunityFilter, SiteSettings } from "@/lib/community";
import { useLocalized } from "./locale-provider";
export function CommunityNavigation({
  value,
  onChange,
  settings,
}: {
  value: CommunityFilter;
  onChange: (value: CommunityFilter) => void;
  settings: SiteSettings;
  hotCount?: number;
}) {
  const localize = useLocalized();
  return localize(
    <div className="community-navigation">
      <div
        className="board-category-tabs"
        role="group"
        aria-label="게시판 분류"
      >
        <button
          aria-pressed={value === "hot"}
          className={value === "hot" ? "selected tab-hot" : "tab-hot"}
          onClick={() => onChange("hot")}
        >
          <Flame size={14} />
          {HOT_TITLE}
        </button>
        {boardCategories.map((category) => (
          <button
            key={category}
            aria-pressed={value === category}
            className={value === category ? "selected" : ""}
            onClick={() => onChange(category)}
          >
            {category}
          </button>
        ))}
      </div>
      {value === "hot" && (
        <details className="hot-criteria"><summary>선정 기준</summary><p>
          {settings.topMinScore}점 이상 · 댓글 가중치 {settings.commentWeight} ·{" "}
          {settings.halfLifeHours}시간마다 시간 가중치 절반 · 실시간 순위
        </p></details>
      )}
    </div>,
  );
}
