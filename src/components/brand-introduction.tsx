"use client";

import {useEffect, useState} from "react";
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
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    let active = true;
    setReady(false);
    setStatus("");
    void read(locale).then(saved => {
      if (!active) return;
      setBlocks(saved ?? defaults[locale].about.split("\n\n").map(text => ({text})));
      setReady(true);
    }).catch(() => {if (active) setStatus("브랜드 소개를 불러오지 못했습니다.");});
    return () => { active = false; };
  }, [locale]);

  function move(index: number, direction: number) {
    const next = [...blocks];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setBlocks(next);
  }

  async function addPhoto(file: File) {
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
      setBlocks(current => [...current, {image: bucket.getPublicUrl(path).data.publicUrl}]);
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
      {blocks.map((block,index) => <div key={index}>
        {"text" in block
          ? <textarea aria-label="소개 문단" value={block.text} maxLength={10000} rows={5}
              onChange={event => {const text = event.target.value; setBlocks(current => current.map((part, i) => i === index ? {text} : part));}}/>
          : <img src={validImage.test(block.image) ? block.image : undefined} alt="" style={{maxWidth: "100%", maxHeight: 220}}/>}
        <button type="button" disabled={index === 0} onClick={() => move(index,-1)}>위로</button>
        <button type="button" disabled={index === blocks.length - 1} onClick={() => move(index,1)}>아래로</button>
        <button type="button" onClick={() => setBlocks(current => current.filter((_,i) => i !== index))}>삭제</button>
      </div>)}
      <button type="button" disabled={blocks.length >= 30} onClick={() => setBlocks(current => [...current,{text:""}])}>본문 추가</button>
      <label>사진 추가<input type="file" accept="image/jpeg,image/png,image/webp" disabled={blocks.length >= 30}
        onChange={event => {const file = event.target.files?.[0]; event.target.value = ""; if (file) void addPhoto(file);}}/></label>
      <button type="button" onClick={() => setBlocks([])}>내용 모두 지우기</button>
      <button type="button" onClick={async () => {
        setBusy(true);
        setStatus("");
        try {
          const client = getSupabase();
          if (!client) throw new Error();
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
