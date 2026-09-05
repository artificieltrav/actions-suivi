
exports.handler = async function (event) {
  const name = event.queryStringParameters && event.queryStringParameters.name;
  if (!name) {
    return { statusCode: 400, body: JSON.stringify({ error: "missing name" }) };
  }

  const FMP_KEY = process.env.FMP_API_KEY;
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

  if (!FMP_KEY) {
    result.errors.emerald = "clé API non configurée sur le serveur";
    result.errors.violet = "clé API non configurée sur le serveur";
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(result),
    };
  }

  let symbol = null;
  try {
    const searchRes = await fetch(
      `https://financialmodelingprep.com/stable/search-name?query=${encodeURIComponent(name)}&limit=5&apikey=${FMP_KEY}`
    );
    if (!searchRes.ok) throw new Error("HTTP " + searchRes.status);
    const matches = await searchRes.json();
    if (Array.isArray(matches) && matches.length) {
      const best =
        matches.find((m) => ((m.exchangeFullName || m.exchange || "").toLowerCase().includes("paris")) || ((m.exchangeFullName || m.exchange || "").toLowerCase().includes("euronext"))) ||
        matches[0];
      symbol = best.symbol;
    }
  } catch (e) {
    result.errors.emerald = result.errors.violet = "recherche société : " + (e.message || "erreur");
  }

  if (symbol) {
    try {
      const divRes = await fetch(
        `https://financialmodelingprep.com/stable/dividends?symbol=${symbol}&apikey=${FMP_KEY}`
      );
      if (!divRes.ok) throw new Error("HTTP " + divRes.status);
      const divData = await divRes.json();
      const hist = Array.isArray(divData) ? divData : ((divData && divData.historical) || []);
      const today = new Date().toISOString().slice(0, 10);
      const upcoming = hist.filter((d) => d.paymentDate && d.paymentDate >= today).sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
      const mostRecent = hist[0];
      if (upcoming.length) {
        result.emerald.push({ date: upcoming[0].paymentDate, text: `Prochain versement estimé : ${upcoming[0].dividend} par action` });
      } else if (mostRecent) {
        result.emerald.push({ date: mostRecent.date, text: `Dernier dividende versé : ${mostRecent.dividend} par action` });
      } else {
        result.errors.emerald = "pas de dividende trouvé";
      }
    } catch (e) {
      result.errors.emerald = e.message || "erreur réseau";
    }

    try {
      const earnRes = await fetch(
        `https://financialmodelingprep.com/stable/earnings?symbol=${symbol}&apikey=${FMP_KEY}`
      );
      if (!earnRes.ok) throw new Error("HTTP " + earnRes.status);
      const earnData = await earnRes.json();
      const today = new Date().toISOString().slice(0, 10);
      const list = Array.isArray(earnData) ? earnData : [];
      const upcoming = list.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
      if (upcoming.length) {
        result.violet = upcoming.slice(0, 2).map((e) => ({ date: e.date, text: "Publication de résultats prévue" }));
      } else if (list.length) {
        const lastPast = list.sort((a, b) => b.date.localeCompare(a.date))[0];
        result.violet.push({ date: lastPast.date, text: "Derniers résultats publiés" });
      } else {
        result.errors.violet = "pas de date de résultats trouvée";
      }
    } catch (e) {
      result.errors.violet = e.message || "erreur réseau";
    }
  } else if (!result.errors.emerald) {
    result.errors.emerald = "société non identifiée";
    result.errors.violet = "société non identifiée";
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(result),
  };
};
