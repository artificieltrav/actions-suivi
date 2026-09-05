exports.handler = async function (event) {
  const name = event.queryStringParameters && event.queryStringParameters.name;
  if (!name) {
    return { statusCode: 400, body: JSON.stringify({ error: "missing name" }) };
  }

  const result = { coral: [], emerald: [], violet: [], errors: {} };
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

  try {
    const searchRes = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(name)}&lang=fr-FR&region=FR&quotesCount=5`,
      { headers: UA }
    );
    if (!searchRes.ok) throw new Error("HTTP " + searchRes.status);
    const searchData = await searchRes.json();
    const quotes = searchData.quotes || [];
    const best = quotes.find((q) => q.quoteType === "EQUITY") || quotes[0];

    if (!best) {
      result.errors.emerald = "société non identifiée";
      result.errors.violet = "société non identifiée";
    } else {
      const calRes = await fetch(
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${best.symbol}?modules=calendarEvents`,
        { headers: UA }
      );
      if (!calRes.ok) throw new Error("HTTP " + calRes.status);
      const calData = await calRes.json();
      const cal =
        calData.quoteSummary &&
        calData.quoteSummary.result &&
        calData.quoteSummary.result[0] &&
        calData.quoteSummary.result[0].calendarEvents;

      if (cal) {
        const fmt = (f) => (Array.isArray(f) ? f[0] && f[0].fmt : f && f.fmt) || null;
        const exDiv = fmt(cal.exDividendDate);
        const divPay = fmt(cal.dividendDate);
        if (exDiv || divPay) {
          result.emerald.push({
            date: exDiv || divPay,
            text: exDiv ? "Date de détachement du dividende (ex-dividende)" : "Date de versement du dividende",
          });
        } else {
          result.errors.emerald = "pas de dividende programmé trouvé";
        }
        const earnings = cal.earnings && cal.earnings.earningsDate;
        if (earnings && earnings.length) {
          result.violet = earnings.slice(0, 2).map((d) => ({ date: d.fmt, text: "Publication de résultats prévue" }));
        } else {
          result.errors.violet = "pas de date de résultats trouvée";
        }
      } else {
        result.errors.emerald = "calendrier indisponible";
        result.errors.violet = "calendrier indisponible";
      }
    }
  } catch (e) {
    result.errors.emerald = e.message || "erreur réseau";
    result.errors.violet = e.message || "erreur réseau";
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(result),
  };
};
