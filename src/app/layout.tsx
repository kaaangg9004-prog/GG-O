import type { Metadata, Viewport } from 'next';
import './globals.css';
import {LocaleProvider} from '@/components/locale-provider';
import {RankingClockProvider} from '@/components/ranking-clock';
import {LanguageSwitcher} from '@/components/language-switcher';

const googleVerification = process.env.GGO_GOOGLE_SITE_VERIFICATION?.trim()
  || 'lqVJttjgAcdwg7MwganzpSY8_jdD7HAdCUv3kjpP7Fs';
const naverVerification = process.env.GGO_NAVER_SITE_VERIFICATION?.trim();

export const metadata: Metadata = {
  title: 'GG-O · Văn hóa Hàn và gu của bạn',
  description: 'Văn hóa Hàn, niềm vui và cộng đồng ẩn danh. GG-O có tiếng Việt, tiếng Hàn và tiếng Anh.',
  manifest: '/manifest.webmanifest',
  robots: { index: false, follow: true },
  verification: {
    google: googleVerification || undefined,
    other: naverVerification ? { 'naver-site-verification': naverVerification } : undefined,
  },
  appleWebApp: { capable: true, title: 'GG-O', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#101010' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body><LocaleProvider><RankingClockProvider initialNow={Date.now()}><LanguageSwitcher/>{children}</RankingClockProvider></LocaleProvider></body></html>;
}
