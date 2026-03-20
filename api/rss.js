export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url parameter" });

  try {
    const response = await fetch(decodeURIComponent(url), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NewsReader/1.0)",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();

    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let itemMatch;

    while ((itemMatch = itemRegex.exec(xml)) !== null) {
      const item = itemMatch[1];

      const get = (tag) => {
        const m = item.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "si"));
        return m ? m[1].trim() : "";
      };

      const title = get("title");
      const description = get("description").replace(/<[^>]*>/g, "").replace(/&[a-z#0-9]+;/gi, " ").trim();
      const pubDate = get("pubDate") || get("dc:date") || get("published");

      // Try multiple link sources in priority order
      let link = "";

      // 1. <link> tag (sometimes has whitespace/newlines around it)
      const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i);
      if (linkMatch) link = linkMatch[1].replace(/\s+/g, "").trim();

      // 2. <feedburner:origLink>
      if (!link.startsWith("http")) {
        const fbMatch = item.match(/<feedburner:origLink>([\s\S]*?)<\/feedburner:origLink>/i);
        if (fbMatch) link = fbMatch[1].replace(/\s+/g, "").trim();
      }

      // 3. <guid isPermaLink="true">
      if (!link.startsWith("http")) {
        const guidMatch = item.match(/<guid[^>]*isPermaLink="true"[^>]*>([\s\S]*?)<\/guid>/i);
        if (guidMatch) link = guidMatch[1].replace(/\s+/g, "").trim();
      }

      // 4. Any <guid> that looks like a URL
      if (!link.startsWith("http")) {
        const guidAny = item.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
        if (guidAny) {
          const g = guidAny[1].replace(/\s+/g, "").trim();
          if (g.startsWith("http")) link = g;
        }
      }

      // 5. href in <link> atom style
      if (!link.startsWith("http")) {
        const atomLink = item.match(/<link[^>]+href=["']([^"']+)["']/i);
        if (atomLink) link = atomLink[1].trim();
      }

      if (!link.startsWith("http")) link = "";

      if (title) {
        items.push({ title, description, pubDate, link });
      }
    }

    res.status(200).json({ items, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
