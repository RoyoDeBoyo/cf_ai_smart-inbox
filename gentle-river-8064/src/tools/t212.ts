export async function fetchT212Portfolio(apiKey: string, apiSecret: string): Promise<string> {
  console.log("AI fetching live t212 data...");

  try {
    // 1. Fetch EUR/GBP Exchange Rate
    let eurGbpRate = 0.85; // Fallback
    try {
      const fxRes = await fetch("https://api.exchangerate-api.com/v4/latest/EUR");
      if (fxRes.ok) {
        const fxData = (await fxRes.json()) as { rates: { GBP: number } };
        eurGbpRate = fxData.rates.GBP;
      }
    } catch (e) {
      console.warn("Using fallback EUR/GBP rate.");
    }

    // 2. Fetch T212 Portfolio
    const authString = btoa(`${apiKey}:${apiSecret}`);
    const t212Res = await fetch("https://live.trading212.com/api/v0/equity/portfolio", {
      headers: { "Authorization": `Basic ${authString}` }
    });

    if (!t212Res.ok) throw new Error(`T212 API Error: ${t212Res.statusText}`);
    const data: any[] = await t212Res.json();

    // 3. Map and Sanitize Data
    const tickerMap: Record<string, { name: string, currency: string }> = {
      "VHYLl_EQ": { name: "VHYL", currency: "GBP" },
      "BNPp_EQ":  { name: "BNP",  currency: "EUR" },
      "CABKe_EQ": { name: "CABK", currency: "EUR" },
      "ENGIp_EQ": { name: "ENGI", currency: "EUR" },
      "HSBAl_EQ": { name: "HSBA", currency: "GBX" },
      "IBEe_EQ":  { name: "IBE",  currency: "EUR" },
      "INGAa_EQ": { name: "INGA", currency: "EUR" },
      "IESd_EQ":  { name: "ISP",  currency: "EUR" }, 
      "LGENl_EQ": { name: "LGEN", currency: "GBX" },
      "LLOYl_EQ": { name: "LLOY", currency: "GBX" },
      "NGl_EQ":   { name: "NG.",  currency: "GBX" },
      "RBSl_EQ":  { name: "NWG",  currency: "GBX" }, 
      "PNNl_EQ":  { name: "PNN",  currency: "GBX" },
      "UUl_EQ":   { name: "UU.",  currency: "GBX" }
    };

    const sanitizedPortfolio: Record<string, number> = {};
    let totalPortfolioValue = 0.0;

    for (const position of data) {
      const rawTicker = position.ticker;
      if (!tickerMap[rawTicker]) continue;

      const clean = tickerMap[rawTicker];
      const quantity = position.quantity || 0;
      const currentPrice = position.currentPrice || 0;
      const rawValue = quantity * currentPrice;

      let gbpValue = rawValue;
      if (clean.currency === "GBX") gbpValue = rawValue / 100;
      if (clean.currency === "EUR") gbpValue = rawValue * eurGbpRate;

      sanitizedPortfolio[clean.name] = Number(gbpValue.toFixed(2));
      totalPortfolioValue += gbpValue;
    }

    // 4. Calculate Weighted Yield
    const yieldMap: Record<string, number> = {
      "VHYL": 0.0324, "BNP":  0.0816, "CABK": 0.0469,
      "ENGI": 0.0523, "HSBA": 0.0416, "IBE":  0.0336,
      "INGA": 0.0768, "ISP":  0.0622, "LGEN": 0.0802,
      "LLOY": 0.0355, "NG.":  0.0367, "NWG":  0.0527,
      "PNN":  0.0701, "UU.":  0.0387
    };

    let weightedYield = 0.0;
    if (totalPortfolioValue > 0) {
      for (const [ticker, gbpValue] of Object.entries(sanitizedPortfolio)) {
        const weight = gbpValue / totalPortfolioValue;
        const stockYield = yieldMap[ticker] || 0.0;
        weightedYield += (weight * stockYield);
      }
    }

    const finalYield = Number((weightedYield * 100).toFixed(2));
    const finalTotal = Number(totalPortfolioValue.toFixed(2));

    // 5. Return context to the AI
    return `Success! Portfolio Total: £${finalTotal}. Combined Dividend Yield: ${finalYield}%. 
    Breakdown: ${JSON.stringify(sanitizedPortfolio)}`;

  } catch (error) {
    console.error("Portfolio fetch failed:", error);
    return "Error: Could not fetch portfolio data. Check API keys.";
  }
}