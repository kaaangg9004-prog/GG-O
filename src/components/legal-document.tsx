"use client";
import { useLocalized } from "@/components/locale-provider";
import { useEffect } from "react";
import type { ReactNode } from "react";
import korean from "@/lib/locales/legal-ko.json";
import vietnamese from "@/lib/locales/legal-vi.json";
import english from "@/lib/locales/legal-en.json";
import { Logo } from "./ui";
import { EmergencyPrivacyNotice } from "./emergency-privacy-notice";
import { InformationLinks } from "./information-links";
export type LegalKind = "terms" | "privacy";
type InformationKind = LegalKind | "about";
export const legalTitle = (kind: LegalKind) =>
  kind === "terms" ? "이용약관" : "개인정보 처리방침";
const titles = {
  ko: { about: "GG-O 소개", terms: "이용약관", privacy: "개인정보처리방침" },
  vi: {
    about: "Giới thiệu về GG-O",
    terms: "Điều khoản sử dụng",
    privacy: "Chính sách bảo mật",
  },
  en: { about: "About GG-O", terms: "Terms of use", privacy: "Privacy policy" },
};
function linkedText(value: string): ReactNode {
  return value
    .split(
      /(https:\/\/policies\.google\.com\/technologies\/ads|https:\/\/www\.gg-o\.net|contact\.US\.GGO@gmail\.com)/g,
    )
    .map((part, index) =>
      part.startsWith("https://") || part === "contact.US.GGO@gmail.com" ? (
        <a key={index} href={part.includes("@") ? `mailto:${part}` : part}>
          {part === "https://www.gg-o.net" ? "GG-O.net" : part}
        </a>
      ) : (
        part
      ),
    );
}
function DocumentBody({ kind }: { kind: InformationKind }) {
  const { locale } = useLocalized(),
    copy = { ko: korean, vi: vietnamese, en: english }[locale][kind];
  return (
    <div className="information-copy" lang={locale} translate="no">
      {copy.split("\n\n").map((block, index) =>
        /^\d+\. [^\n]+$/.test(block) ? (
          <h2 key={index}>{block}</h2>
        ) : block.startsWith("- ") ? (
          <ul key={index}>
            {block.split("\n").map((line, i) => (
              <li key={i}>{linkedText(line.replace(/^- /, ""))}</li>
            ))}
          </ul>
        ) : (
          <p key={index}>{linkedText(block)}</p>
        ),
      )}
    </div>
  );
}
export function LegalDocument({ kind }: { kind: LegalKind }) {
  const localize = useLocalized();
  return localize(
    <article className="legal-document">
      <DocumentBody kind={kind} />
      {kind === "privacy" && (
        <section id="emergency" className="legal-emergency-section">
          <h2>긴급 도움 요청 개인정보 처리 안내</h2>
          <p>
            긴급 도움 요청을 보낼 때에는 아래 항목에 대해 별도로 동의를
            받습니다. 접수 서버가 활성화된 경우에만 요청을 전송합니다.
          </p>
          <EmergencyPrivacyNotice />
        </section>
      )}
    </article>,
  );
}
export function LegalPage({ kind }: { kind: InformationKind }) {
  const localize = useLocalized(),
    title = titles[localize.locale][kind];
  useEffect(() => {
    document.title = title + " · GG-O";
  }, [title]);
  return (
    <>
      <main className="legal-page shell section">
        <header>
          <a href="/" aria-label={localize.text("GG-O 홈")}>
            <Logo />
          </a>
          <a href="/">{localize.text("홈으로 돌아가기")} ↗</a>
        </header>
        <p className="eyebrow">
          GG-O · {localize.text("K-문화 · 플레이 · 커뮤니티")}
        </p>
        <h1 lang={localize.locale} translate="no">
          {title}
        </h1>
        {kind !== "about" && (
          <p className="legal-updated" lang={localize.locale} translate="no">
            {localize.locale === "ko"
              ? "최종 업데이트: 2026년 11월"
              : localize.locale === "vi"
                ? "Cập nhật lần cuối: Tháng 11 năm 2026"
                : "Last updated: November 2026"}
          </p>
        )}
        {kind === "about" ? (
          <article className="legal-document">
            <DocumentBody kind={kind} />
          </article>
        ) : (
          <LegalDocument kind={kind} />
        )}
        <a className="button button-dark" href="/">
          {localize.text("홈으로 돌아가기")} ↗
        </a>
      </main>
      <footer className="information-footer">
        <div className="shell">
          <InformationLinks current={kind} />
        </div>
      </footer>
    </>
  );
}
