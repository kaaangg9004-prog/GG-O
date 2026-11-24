"use client";
import { Flame } from "lucide-react";
import { boardCategories } from "@/lib/types";
import { HOT_TITLE } from "@/lib/community";
import type { CommunityFilter, SiteSettings } from "@/lib/community";
import { useLocalized } from "./locale-provider";
export function CommunityNavigation<T extends string = CommunityFilter>({
  value,
  onChange,
  settings,
  categories = boardCategories as unknown as readonly T[],
  categoryLabel,
}: {
  value: T | "hot";
  onChange: (value: T | "hot") => void;
  categories?: readonly T[];
  categoryLabel?: (category: T) => string;
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
        {categories.map((category) => (
          <button
            key={category}
            aria-pressed={value === category}
            className={value === category ? "selected" : ""}
            onClick={() => onChange(category)}
          >
            {categoryLabel ? <span translate="no">{categoryLabel(category)}</span> : category}
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
