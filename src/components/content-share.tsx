"use client";

import { useId, useRef, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { contentShareUrl, type ShareSection } from "@/lib/content-share-link";
import { useLocalized } from "./locale-provider";

const appTargets = [
  ["Facebook Messenger", "https://www.messenger.com/"],
  ["Instagram", "https://www.instagram.com/"],
  ["Instagram DM", "https://www.instagram.com/direct/inbox/"],
  ["카카오톡", null],
  ["Zalo", "https://chat.zalo.me/"],
] as const;

export function ContentShare({ section, id, title }: { section: ShareSection; id: string; title: string }) {
  const localize = useLocalized();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [instruction, setInstruction] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const origin = typeof window === "undefined" ? "https://www.gg-o.net" : window.location.origin;
  const url = contentShareUrl(origin, section, id);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setInstruction("");
      return true;
    } catch {
      input.current?.focus();
      input.current?.select();
      setCopied(false);
      setInstruction(localize.text("주소를 선택했습니다. 복사한 뒤 원하는 앱에 붙여 넣으세요."));
      return false;
    }
  };
  const shareToApp = async (name: string, fallback: string | null) => {
    if (typeof navigator.share === "function") {
      setInstruction(localize.text("공유 목록에서 원하는 앱을 선택하세요."));
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }
    if (fallback) window.open(fallback, "_blank", "noopener,noreferrer");
    const didCopy = await copy();
    setInstruction(didCopy
      ? `${localize.text(name)} · ${localize.text("복사한 링크를 붙여 넣으세요.")}`
      : localize.text("주소를 선택했습니다. 복사한 뒤 원하는 앱에 붙여 넣으세요."));
  };
  const facebook = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  const x = `https://twitter.com/intent/tweet?${new URLSearchParams({ url, text: title })}`;
  return localize(<section className="content-share" aria-label="게시글 공유">
    <div className="content-share-row">
      <input ref={input} type="text" readOnly value={url} title={url} aria-label="게시글 주소" onFocus={event => event.currentTarget.select()} />
      <button type="button" className="button button-light content-copy" aria-label="링크 복사" title={localize.text("링크 복사")}
        onClick={() => void copy()}>{copied ? <Check size={17} /> : <Copy size={17} />}</button>
      <button type="button" className="button button-light" aria-expanded={expanded} aria-controls={panelId}
        onClick={() => setExpanded(current => !current)}><Share2 size={17} />공유하기</button>
    </div>
    <div id={panelId} hidden={!expanded} className="content-share-options">
      <a className="button button-light" href={facebook} target="_blank" rel="noopener noreferrer">Facebook</a>
      {appTargets.slice(0, 3).map(([name, fallback]) => <button key={name} type="button" className="button button-light" onClick={() => void shareToApp(name, fallback)}>{name}</button>)}
      <a className="button button-light" href={x} target="_blank" rel="noopener noreferrer">X</a>
      {appTargets.slice(3).map(([name, fallback]) => <button key={name} type="button" className="button button-light" onClick={() => void shareToApp(name, fallback)}>{name}</button>)}
    </div>
    {(instruction || copied) && <p className="content-share-result" role="status">{instruction || "링크를 복사했습니다."}</p>}
  </section>);
}
