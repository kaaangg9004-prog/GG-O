"use client";

import {useEffect, useRef, useState} from "react";
import {getSupabase} from "@/lib/supabase-service";
import {readProductPhoto} from "@/lib/product-images";
import type {Locale} from "@/lib/i18n";
import {useLocalized} from "./locale-provider";
import ko from "@/lib/locales/legal-ko.json";
import vi from "@/lib/locales/legal-vi.json";
import en from "@/lib/locales/legal-en.json";

type Block = {text: string} | {image: string};
const defaults = {ko, vi, en};
const validImage = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/poll-media\/[a-f0-9-]+\.webp$/;

async function read(locale: Locale): Promise<Block[] | null> {
  const client = getSupabase();
  if (!client) return null;
  const {data, error} = await client.from("brand_introductions").select("blocks").eq("locale", locale).maybeSingle();
  if (error) throw error;
  return data?.blocks ?? null;
}

export function PublishedBrandIntroduction({fallback}: {fallback: React.ReactNode}) {
  const {locale} = useLocalized();
  const [published, setPublished] = useState<{locale: Locale; blocks: Block[] | null}>();
  useEffect(() => {
    let active = true;
    void read(locale).then(blocks => {if (active) setPublished({locale, blocks});}).catch(() => {});
    return () => { active = false; };
  }, [locale]);
  if (published?.locale !== locale || published.blocks === null) return fallback;
  return <div className="information-copy" lang={locale} translate="no">{published.blocks.map((block, index) =>
    "text" in block ? <p key={index} style={{whiteSpace: "pre-wrap"}}>{block.text}</p> :
    validImage.test(block.image) ? <img key={index} src={block.image} alt="" style={{maxWidth: "100%", height: "auto"}}/> : null
  )}</div>;
}

export function BrandIntroductionEditor() {
  const localize = useLocalized();
  const [locale, setLocale] = useState<Locale>(localize.locale);
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const editor = useRef<HTMLTextAreaElement>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    let active = true;
    setReady(false);
    setStatus("");
    void read(locale).then(saved => {
      if (!active) return;
      const images: string[] = [];
      const text = saved?.map(block => "text" in block ? block.text : `[[${images.push(block.image)}]]`).join("\n\n");
      setBody(text ?? defaults[locale].about);
      setPhotos(images);
      setReady(true);
    }).catch(() => {if (active) setStatus("브랜드 소개를 불러오지 못했습니다.");});
    return () => { active = false; };
  }, [locale]);

  async function addPhoto(file: File) {
    const start = editor.current?.selectionStart ?? body.length;
    const end = editor.current?.selectionEnd ?? start;
    setBusy(true);
    setStatus("");
    try {
      const client = getSupabase();
      if (!client) throw new Error();
      const image = await readProductPhoto(file);
      const blob = await (await fetch(image)).blob();
      if (blob.type !== "image/webp") throw new Error();
      const bucket = client.storage.from("poll-media");
      const path = crypto.randomUUID() + ".webp";
      const {error} = await bucket.upload(path, blob, {contentType: blob.type});
      if (error) throw error;
      setPhotos(current => [...current, bucket.getPublicUrl(path).data.publicUrl]);
      setBody(current => current.slice(0, start) + `\n[[${photos.length + 1}]]\n` + current.slice(end));
    } catch {
      setStatus("사진을 올리지 못했습니다.");
    } finally { setBusy(false); }
  }

  return localize(<section className="standard-form">
    <h3>브랜드 소개</h3>
    <label>편집 언어<select value={locale} disabled={busy} onChange={event => setLocale(event.target.value as Locale)}>
      <option value="ko">한국어</option><option value="vi">Tiếng Việt</option><option value="en">English</option>
    </select></label>
    {ready && <fieldset disabled={busy}>
      <label>브랜드 소개 본문
        <textarea ref={editor} value={body} onChange={event => setBody(event.target.value)} rows={16} maxLength={30000} />
      </label>
      <label>사진 추가<input type="file" accept="image/jpeg,image/png,image/webp" disabled={photos.length >= 14}
        onChange={event => {const file = event.target.files?.[0]; event.target.value = ""; if (file) void addPhoto(file);}}/></label>
      {photos.length > 0 && <div>
        <p>본문의 사진 번호를 옮기거나 지워 사진 위치를 바꿀 수 있습니다.</p>
        {photos.map((url, index) => validImage.test(url) && <figure key={index}>
          <img src={url} alt="" style={{maxWidth: "100%", maxHeight: 100}}/><figcaption>[[{index + 1}]]</figcaption>
        </figure>)}
      </div>}
      <button type="button" onClick={() => {setBody(""); setPhotos([]);}}>내용 모두 지우기</button>
      <button type="button" onClick={async () => {
        setBusy(true);
        setStatus("");
        try {
          const client = getSupabase();
          if (!client) throw new Error();
          const blocks: Block[] = body.split(/(\[\[\d+\]\])/g).flatMap((part): Block[] => {
            const match = /^\[\[(\d+)\]\]$/.exec(part);
            const image = match ? photos[Number(match[1]) - 1] : undefined;
            return image ? [{image}] : part.trim() ? [{text: part.trim()}] : [];
          });
          const {error} = await client.from("brand_introductions").upsert({locale, blocks});
          if (error) throw error;
          setStatus("브랜드 소개를 저장했습니다.");
        } catch { setStatus("브랜드 소개를 저장하지 못했습니다."); }
        finally { setBusy(false); }
      }}>저장하기</button>
    </fieldset>}
    {status && <p role="status">{status}</p>}
  </section>);
}
