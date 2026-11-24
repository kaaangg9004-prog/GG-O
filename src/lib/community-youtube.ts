const youtubeId = /^[A-Za-z0-9_-]{11}$/;
const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);

export function youtubeEmbedUrl(value: string) {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return null;
  const [, route, resource] = url.pathname.split("/");
  const id = url.hostname === "youtu.be" ? route
    : youtubeHosts.has(url.hostname) ? (route === "watch" ? url.searchParams.get("v") : ["shorts", "live", "embed"].includes(route) ? resource : null)
    : null;
  return id && youtubeId.test(id) ? `https://www.youtube-nocookie.com/embed/${id}?playsinline=1` : null;
}

export function splitYouTubeLinks(text: string) {
  const parts: { text?: string; embed?: string }[] = [];
  let next = 0;
  const links = /(?:^|[\s(])((?:https?:\/\/)?(?:(?:www\.|m\.)?youtube\.com|youtu\.be)\/[^\s<>"'()\[\]]+)/gi;
  for (const match of text.matchAll(links)) {
    const link = match[1].replace(/[.,!?]+$/, "");
    const embed = youtubeEmbedUrl(link);
    if (!embed) continue;
    const start = match.index + match[0].length - match[1].length;
    if (start > next) parts.push({ text: text.slice(next, start) });
    parts.push({ embed });
    next = start + link.length;
  }
  if (next < text.length) parts.push({ text: text.slice(next) });
  return parts;
}
