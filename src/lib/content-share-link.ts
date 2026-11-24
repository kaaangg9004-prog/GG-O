export type ShareSection = "community" | "polls" | "journal" | "news" | "events";

export function contentShareUrl(origin: string, section: ShareSection, id: string) {
  const url = new URL("/", origin);
  url.searchParams.set("share", section);
  url.searchParams.set("id", id);
  return url.href;
}

export function contentShareRoute(location: Pick<Location, "hash" | "search">): string {
  if (location.hash) return location.hash;
  const query = new URLSearchParams(location.search);
  const section = query.get("share");
  const id = query.get("id");
  if (!section || !["community", "polls", "journal", "news", "events"].includes(section) ||
    !id || !/^[a-z0-9_-]{1,80}$/i.test(id)) return "";
  return `#${section}?id=${encodeURIComponent(id)}`;
}
