import type { CommunityPostImage } from "./anonymous-types";
import { getSupabase } from "./supabase-service";

const bucket = "community-inline-media";
export const maxCommunityImages = 4;
export const maxCommunityVideoBytes = 20 * 1024 * 1024;
export const isVideoAttachment = (path: string) => /\.(mp4|webm)$/i.test(path);

export function splitPostBody(body: string, images: CommunityPostImage[]) {
  const characters = Array.from(body);
  const offsets = [0, ...images.map(image => image.offset), characters.length];
  return offsets.slice(1).map((end, index) => characters.slice(offsets[index], end).join(""));
}

export async function uploadPostImage(source: string | File) {
  const client = getSupabase();
  if (!client) throw new Error("사진 저장소가 연결되지 않았습니다.");
  const blob = typeof source === "string" ? await (await fetch(source)).blob() : source;
  const extension = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg", "video/mp4": "mp4", "video/webm": "webm" }[blob.type];
  if (!extension) throw new Error("지원하는 첨부 파일 형식인지 확인해 주세요.");
  const path = `${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage.from(bucket).upload(path, blob, { contentType: blob.type });
  if (error) throw new Error("파일 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  return path;
}

export async function getPostImageUrls(paths: string[]) {
  const client = getSupabase();
  if (!client || !paths.length) return {};
  const { data } = await client.storage.from(bucket).createSignedUrls([...new Set(paths)], 300);
  return Object.fromEntries((data ?? []).flatMap(item => item.path && item.signedUrl ? [[item.path, item.signedUrl]] : []));
}
