"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { MagazineArticle } from "@/lib/magazine";
import { parseMagazine } from "@/lib/magazine";
import { readProductPhoto } from "@/lib/product-images";
import { useLocalized } from "./locale-provider";
import { Modal } from "./ui";
export function MagazineManager({
  articles,
  onOpen,
  onSave,
  onDelete,
}: {
  articles: MagazineArticle[];
  onOpen: (id: string) => Promise<MagazineArticle>;
  onSave: (article: MagazineArticle) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const localize = useLocalized(),
    [editing, setEditing] = useState<MagazineArticle | null | undefined>(),
    [deleting, setDeleting] = useState<MagazineArticle | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return localize(
    <section className="magazine-manager">
      <button
        className="button button-dark"
        disabled={busy}
        onClick={() => setEditing(null)}
      >
        <Plus size={16} />
        매거진 등록
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="admin-magazine-list">
        {articles.map((a) => (
          <article key={a.id}>
            <img src={a.image} alt="" />
            <div>
              <h3 translate="no">{a.title}</h3>
              <p translate="no">{a.tag}</p>
            </div>
            <button
              disabled={busy}
              aria-label={`${a.title} 편집`}
              onClick={async () => {
                setBusy(true);
                try {
                  setEditing(await onOpen(a.id));
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Pencil size={16} />
              편집
            </button>
            <button
              aria-label={`${a.title} 삭제`}
              onClick={() => setDeleting(a)}
            >
              <Trash2 size={16} />
              삭제
            </button>
          </article>
        ))}
      </div>
      {editing !== undefined && (
        <Modal
          title={editing ? "매거진 편집" : "매거진 등록"}
          wide
          close={() => !busy && setEditing(undefined)}
        >
          <MagazineEditor
            key={editing?.id ?? "new"}
            article={editing ?? undefined}
            busy={busy}
            onSave={async (a) => {
              setBusy(true);
              setError("");
              try {
                await onSave(a);
                setEditing(undefined);
              } catch (e) {
                setError((e as Error).message);
                throw e;
              } finally {
                setBusy(false);
              }
            }}
          />
        </Modal>
      )}
      {deleting && (
        <Modal title="매거진 삭제" close={() => !busy && setDeleting(null)}>
          <p translate="no">{deleting.title}</p>
          <p>이 매거진을 삭제하시겠어요?</p>
          <button
            className="button button-dark"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onDelete(deleting.id);
                setDeleting(null);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            삭제 확인
          </button>
        </Modal>
      )}
    </section>,
  );
}
function MagazineEditor({
  article,
  busy,
  onSave,
}: {
  article?: MagazineArticle;
  busy: boolean;
  onSave: (article: MagazineArticle) => Promise<void>;
}) {
  const localize = useLocalized(),
    [draft, setDraft] = useState<MagazineArticle>(
      article ?? {
        id: crypto.randomUUID(),
        title: "",
        tag: "",
        excerpt: "",
        image: "/images/street.jpg",
        read: "",
        paragraphs: [""],
      },
    ),
    [body, setBody] = useState(article?.paragraphs.join("\n\n") ?? ""),
    [error, setError] = useState(""),
    [uploading, setUploading] = useState(false);
  return localize(
    <form
      className="standard-form magazine-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        const checked = parseMagazine({
          ...draft,
          paragraphs: body
            .split(/\n\s*\n/)
            .map((p) => p.trim())
            .filter(Boolean),
        });
        if (!checked) {
          setError("제목·분류·사진과 본문을 확인해 주세요.");
          return;
        }
        try {
          await onSave(checked);
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      {(
        [
          ["title", "매거진 제목", 120],
          ["tag", "매거진 분류", 60],
          ["excerpt", "한 줄 소개", 500],
          ["read", "읽는 시간 안내", 60],
        ] as const
      ).map(([key, label, max]) => (
        <label key={key}>
          {label}
          <input
            value={draft[key]}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            maxLength={max}
            required={key === "title" || key === "tag"}
          />
        </label>
      ))}
      <img
        className="magazine-cover-preview"
        src={draft.image}
        alt="매거진 사진 미리보기"
      />
      <label>
        대표 사진
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading || busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true);
            try {
              const image = await readProductPhoto(file);
              setDraft((current) => ({ ...current, image }));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setUploading(false);
            }
          }}
        />
      </label>
      <label>
        매거진 본문
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          maxLength={50000}
          required
        />
      </label>
      <p>문단 사이는 빈 줄로 나눠 주세요.</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button button-dark" disabled={busy || uploading}>
        매거진 저장
      </button>
    </form>,
  );
}
