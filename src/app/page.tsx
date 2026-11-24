import DemoAccess from '@/components/demo-access';
import type { Metadata } from 'next';

const previewTitle = 'GG-O · Văn hóa Hàn và gu của bạn';
const previewDescription = '문화와 일상, 즐거움을 나누는 익명 커뮤니티';

export const metadata: Metadata = {
  title: previewTitle,
  description: previewDescription,
  robots: { index: (process.env.VERCEL_ENV ?? process.env.NODE_ENV) === 'production', follow: true },
  openGraph: {
    title: previewTitle,
    description: previewDescription,
    type: 'website',
  },
};

export default function Page() { return <DemoAccess />; }
