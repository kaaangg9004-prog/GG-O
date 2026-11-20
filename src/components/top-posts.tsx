"use client";
export { useRankingClock } from "./ranking-clock";
import { MessageSquare, Eye, Radio } from "lucide-react";
import { useLocalized } from "./locale-provider";
export interface RankedArticle {
  id: string;
  title: string;
  topic: string;
  views: number;
  comments: number;
  score: number;
  translate?: "yes" | "no";
}
export function TopPosts({
  posts,
  onOpen,
  updatedAt,
}: {
  posts: RankedArticle[];
  onOpen: (id: string) => void;
  updatedAt: number;
}) {
  const localize = useLocalized();
  return localize(
    <section className="top-posts" aria-label="TOP 글 실시간 순위">
      <div className="top-ranking-header">
        <span>
          <Radio size={14} />
          인기 이야기
        </span>
        
      </div>
      <ol className="top-ranking-list">
        {posts.map((post, index) => (
          <li key={post.id}>
            <button
              className="top-ranking-item"
              onClick={() => onOpen(post.id)}
            >
              <strong className={`top-rank rank-${index + 1}`}>
                {String(index + 1).padStart(2, "0")}
              </strong>
              <div className="top-ranking-main">
                <span className="board-category">{post.topic}</span>
                <span
                  className="top-ranking-title"
                  translate={post.translate ?? "no"}
                >
                  {post.title}
                </span>
                <span className="top-ranking-metrics">
                  <span>
                    <Eye size={12} />
                    {post.views}
                  </span>
                  <span>
                    <MessageSquare size={12} />
                    {post.comments}
                  </span>
                </span>
              </div>
            </button>
          </li>
        ))}
      </ol>
      {!posts.length && (
        <p className="top-empty">
          아직 선정된 TOP 글이 없어요. 새로운 이야기를 기다리고 있습니다.
        </p>
      )}

    </section>,
  );
}
