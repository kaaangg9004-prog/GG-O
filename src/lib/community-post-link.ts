const postIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function communityPostId(hash: string) {
  const [section, query] = hash.split("?");
  if (section !== "#community") return null;
  const id = new URLSearchParams(query).get("id");
  return id && postIdPattern.test(id) ? id : null;
}

export function communityPostUrl(origin: string, id: string) {
  return new URL(`/#community?id=${encodeURIComponent(id)}`, origin).href;
}
