// The example books of the front page (webapp/examples.json). Each is a .chaya.pdf the page can load: at its `url` (the
// books are on Cloudflare R2, which lets any site fetch them), else where the app is served: under examples/ on a
// published site, under outputs/books/ in a checkout of the repository. A book whose file is found nowhere is left
// out, so the list never offers a dead link.
export const EXAMPLE_PLACES = ["examples/", "../outputs/books/"];

export async function loadExamples(base, fetchImpl = fetch) {
  let list;
  try { list = await (await fetchImpl(new URL("../examples.json", base))).json(); } catch { return []; }
  const found = await Promise.all(list.map(async example => {
    const places = [...(example.url ? [example.url] : []), ...EXAMPLE_PLACES.map(place => new URL(place + example.file, new URL("../", base)).href)];
    for (const url of places) {
      try {
        const response = await fetchImpl(url, { method: "HEAD" });
        if (response.ok) return { ...example, url, bytes: Number(response.headers.get("content-length")) || null };
      } catch { /* try the next place */ }
    }
    return null;
  }));
  return found.filter(Boolean);
}

export const exampleHref = example => `?book=${encodeURIComponent(example.url)}`;
export const exampleSize = example => example.bytes ? `${(example.bytes / 1e6).toFixed(example.bytes < 1e7 ? 1 : 0)} MB` : "";
