
exports.handler = async function (event) {
  const name = event.queryStringParameters && event.queryStringParameters.name;
  if (!name) {
    return { statusCode: 400, body: JSON.stringify({ error: "missing name" }) };
  }

  const result = { coral: [], errors: {} };
  const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };

  try {
    const res = await fetch(
      `https://news.google.com/rss/search?q=${encodeURIComponent(name + " action bourse")}&hl=fr&gl=FR&ceid=FR:fr`,
      { headers: UA }
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5);
    result.coral = items.map((m) => {
      const block = m[1];
      const title = ((block.match(/<title>([\s\S]*?)<\/title>/) || [, ""])[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "");
      const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [, ""])[1] || "";
      const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [, ""])[1] || "";
      return { text: title, link, date: pubDate ? new Date(pubDate).toLocaleDateString("fr-FR") : "" };
    });
    if (!result.coral.length) result.errors.coral = "aucun article retourné";
  } catch (e) {
    result.errors.coral = e.message || "erreur réseau";
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(result),
  };
};
