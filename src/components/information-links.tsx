"use client";
import { useLocale } from "./locale-provider";
const labels = {
  vi: [
    "Giới thiệu",
    "Điều khoản sử dụng",
    "Chính sách bảo mật",
    "Liên hệ",
    "Thông tin GG-O",
  ],
  ko: ["소개", "이용약관", "개인정보처리방침", "문의", "GG-O 안내"],
  en: [
    "About",
    "Terms of use",
    "Privacy policy",
    "Contact",
    "GG-O information",
  ],
};
export function InformationLinks({
  current,
}: {
  current?: "about" | "terms" | "privacy";
}) {
  const { locale } = useLocale(),
    copy = labels[locale];
  return (
    <nav
      className="information-links"
      aria-label={copy[4]}
      lang={locale}
      translate="no"
    >
      {(["about", "terms", "privacy"] as const).map((route, index) => (
        <span key={route}>
          <a
            href={`/${route}/`}
            aria-current={current === route ? "page" : undefined}
          >
            {copy[index]}
          </a>
          <i aria-hidden="true">|</i>
        </span>
      ))}
      <a href="mailto:contact.US.GGO@gmail.com">{copy[3]}: contact.US.GGO@gmail.com</a>
    </nav>
  );
}
