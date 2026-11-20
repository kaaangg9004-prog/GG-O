import { articles } from "./data";
import { safePollImage } from "./polls";
import { getSupabase } from "./supabase-service";
import type { LocalState } from "./types";
export type MagazineArticle = (typeof articles)[number];
export function parseMagazine(value: unknown): MagazineArticle | null {
  if (!value || typeof value !== "object") return null;
  const v = value as MagazineArticle;
  if (
    typeof v.id !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v.id) ||
    typeof v.title !== "string" ||
    v.title.trim().length < 2 ||
    v.title.length > 120 ||
    typeof v.tag !== "string" ||
    !v.tag.trim() ||
    v.tag.length > 60 ||
    typeof v.excerpt !== "string" ||
    v.excerpt.length > 500 ||
    typeof v.read !== "string" ||
    v.read.length > 60 ||
    !safePollImage(v.image) ||
    !Array.isArray(v.paragraphs) ||
    !v.paragraphs.length ||
    v.paragraphs.length > 20 ||
    v.paragraphs.some(
      (p) => typeof p !== "string" || p.length < 1 || p.length > 5000,
    )
  )
    return null;
  return {
    id: v.id,
    title: v.title.trim(),
    tag: v.tag.trim(),
    excerpt: v.excerpt,
    image: v.image,
    read: v.read,
    paragraphs: [...v.paragraphs],
  };
}
export const listedArticles = (state: LocalState) =>
  [
    ...new Map(
      [...articles, ...state.articleEdits].map((a) => [a.id, a]),
    ).values(),
  ].filter((a) => !state.deletedArticleIds.includes(a.id));
export function magazineGateway() {
  const client = getSupabase();
  if (!client) return null;
  const rpc = async (name: string, args?: Record<string, unknown>) => {
    const { data, error } = await client.rpc(name, args);
    if (error)
      throw new Error(
        "매거진 요청을 처리하지 못했습니다. 권한과 연결 상태를 확인해 주세요.",
      );
    return data;
  };
  return {
    list: async (): Promise<MagazineArticle[]> => {
      const rows = await rpc("magazine_summaries");
      if (!Array.isArray(rows))
        throw new Error("매거진을 불러오지 못했습니다.");
      return rows.map((v) => ({ ...v, paragraphs: [] }));
    },
    open: async (id: string) => {
      const article = parseMagazine(await rpc("magazine_open", { p_id: id }));
      if (!article) throw new Error("매거진을 불러오지 못했습니다.");
      return article;
    },
    save: async (article: MagazineArticle) => {
      let image = article.image;
      if (image.startsWith("data:")) {
        const blob = await (await fetch(image)).blob(),
          path = crypto.randomUUID() + ".webp";
        const { error } = await client.storage
          .from("poll-media")
          .upload(path, blob, { contentType: blob.type });
        if (error) throw new Error("사진을 등록하지 못했습니다.");
        image = client.storage.from("poll-media").getPublicUrl(path)
          .data.publicUrl;
      }
      await rpc("site_admin_magazine", { p_document: { ...article, image } });
    },
    remove: async (id: string) => {
      await rpc("site_admin_magazine_remove", { p_id: id });
    },
  };
}

export function isPresetMagazineText(article: MagazineArticle, text: string) {
  const original = articles.find((a) => a.id === article.id);
  return (
    !!original &&
    [
      original.title,
      original.tag,
      original.excerpt,
      original.read,
      ...original.paragraphs,
    ].includes(text)
  );
}
