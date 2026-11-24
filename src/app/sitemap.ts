import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

const siteUrl = 'https://www.gg-o.net';
const publicPaths = ['/', '/about/', '/privacy/', '/terms/'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths.map((path) => ({ url: new URL(path, siteUrl).href }));
}
