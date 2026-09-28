exports.handler = async function (event) {
  const name = event.queryStringParameters && event.queryStringParameters.name;
  if (!name) {
    return { statusCode: 400, body: JSON.stringify({ error: "missing name" }) };
  }

  const FMP_KEY = process.env.FMP_API_KEY;
  const result = { coral: [], price: null, errors: {} };
  const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };

  // ---- Actualités : Google News RSS (gratuit, sans clé) ----
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

  // ---- Cours actuel : identifier des candidats (FMP, gratuit) puis tester chacun sur Yahoo Chart (gratuit) ----
  let candidates = [];
  if (FMP_KEY) {
    try {
      const searchRes = await fetch(
        `https://financialmodelingprep.com/stable/search-name?query=${encodeURIComponent(name)}&limit=8&apikey=${FMP_KEY}`
      );
      if (searchRes.ok) {
        const matches = await searchRes.json();
        if (Array.isArray(matches) && matches.length) {
          // On priorise Paris/Euronext, mais on garde tous les candidats en secours
          const scored = matches.map((m) => {
            const exch = (m.exchangeFullName || m.exchange || "").toLowerCase();
            const isParis = exch.includes("paris") || exch.includes("euronext");
            return { symbol: m.symbol, priority: isParis ? 0 : 1 };
          });
          scored.sort((a, b) => a.priority - b.priority);
          candidates = scored.map((s) => s.symbol).filter(Boolean);
        }
      }
    } catch (e) {
      // silencieux : le cours est un bonus, ne bloque pas le reste
    }
  }

  if (candidates.length) {
    let lastErr = null;
    let found = false;
    for (const symbol of candidates.slice(0, 4)) {
      try {
        const chartRes = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
          { headers: UA }
        );
        if (!chartRes.ok) { lastErr = new Error("HTTP " + chartRes.status); continue; }
        const chartData = await chartRes.json();
        const meta = chartData && chartData.chart && chartData.chart.result && chartData.chart.result[0] && chartData.chart.result[0].meta;
        if (meta && typeof meta.regularMarketPrice === "number") {
          const price = meta.regularMarketPrice;
          const prevClose = meta.chartPreviousClose || meta.previousClose;
          const change = typeof prevClose === "number" ? price - prevClose : null;
          const changePercent = change !== null && prevClose ? (change / prevClose) * 100 : null;
          result.price = { value: price, change, changePercent, currency: meta.currency || "" };
          found = true;
          break;
        } else {
          lastErr = new Error("cours indisponible");
        }
      } catch (e) {
        lastErr = e;
      }
    }
    if (!found) {
      result.errors.price = (lastErr && lastErr.message) || "cours indisponible";
    }
  } else {
    result.errors.price = "société non identifiée";
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(result),
  };
};
