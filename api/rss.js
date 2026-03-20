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

    // Parse RSS XML
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let itemMatch;

    while ((itemMatch = itemRegex.exec(xml)) !== null) {
      const item = itemMatch[1];
      const get = (tag) => {
        const m = item.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, "si"));
        return m ? m[1].trim() : "";
      };
      const getLinkFromGuid = () => {
        const m = item.match(/<guid[^>]*isPermaLink="true"[^>]*>(.*?)<\/guid>/si);
        return m ? m[1].trim() : "";
      };

      let link = get("link") || getLinkFromGuid() || get("guid");
      // Clean up link - remove whitespace and CDATA artifacts
      link = link.replace(/\s+/g, "").trim();
      if (!link.startsWith("http")) link = "";

      const title = get("title");
      const description = get("description").replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ").trim();
      const pubDate = get("pubDate") || get("dc:date") || get("published");

      if (title) {
        items.push({ title, description, pubDate, link });
      }
    }

    res.status(200).json({ items, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
