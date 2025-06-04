const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 9876;
const API_BASE = "http://20.244.56.144/evaluation-service";

function getTimestamp(dateString) {
  return new Date(dateString).getTime();
}

function getRecentEntries(data, minutes) {
  const currentTime = Date.now();
  return data.filter(entry => {
    const elapsedMinutes = (currentTime - getTimestamp(entry.lastUpdatedAt)) / 60000;
    return elapsedMinutes <= minutes;
  });
}

function computeAveragePrice(data) {
  if (data.length === 0) return 0;
  const total = data.reduce((sum, entry) => sum + entry.price, 0);
  return total / data.length;
}

function pearsonCorrelation(stockData1, stockData2) {
  const length = Math.min(stockData1.length, stockData2.length);
  if (length < 2) return 0;

  const prices1 = stockData1.slice(0, length).map(d => d.price);
  const prices2 = stockData2.slice(0, length).map(d => d.price);

  const mean1 = prices1.reduce((a, b) => a + b, 0) / length;
  const mean2 = prices2.reduce((a, b) => a + b, 0) / length;

  let numerator = 0;
  let denom1 = 0;
  let denom2 = 0;

  for (let i = 0; i < length; i++) {
    const diff1 = prices1[i] - mean1;
    const diff2 = prices2[i] - mean2;

    numerator += diff1 * diff2;
    denom1 += diff1 * diff1;
    denom2 += diff2 * diff2;
  }

  const denominator = Math.sqrt(denom1) * Math.sqrt(denom2);
  return denominator === 0 ? 0 : numerator / denominator;
}

app.get("/stocks/:symbol", async (req, res) => {
  const symbol = req.params.symbol;
  const minutes = parseInt(req.query.minutes) || 0;

  try {
    const response = await axios.get(`${API_BASE}/stocks/${symbol}`);
    const stockPrices = response.data;

    const recentPrices = getRecentEntries(stockPrices, minutes);
    const averagePrice = computeAveragePrice(recentPrices);

    res.json({
      averageStockPrice: averagePrice,
      priceHistory: recentPrices,
    });
  } catch (error) {
    res.status(500).json({ error: "Unable to retrieve stock data" });
  }
});

app.get("/stockcorrelation", async (req, res) => {
  const minutes = parseInt(req.query.minutes) || 0;
  const tickers = req.query.ticker;

  if (!tickers) {
    return res.status(400).json({ error: "Ticker parameter is required" });
  }

  const [symbol1, symbol2] = tickers.split(",");
  if (!symbol1 || !symbol2) {
    return res.status(400).json({ error: "Two tickers must be provided separated by a comma" });
  }

  try {
    const [resp1, resp2] = await Promise.all([
      axios.get(`${API_BASE}/stocks/${symbol1}`),
      axios.get(`${API_BASE}/stocks/${symbol2}`),
    ]);

    const filteredData1 = getRecentEntries(resp1.data, minutes);
    const filteredData2 = getRecentEntries(resp2.data, minutes);

    const avg1 = computeAveragePrice(filteredData1);
    const avg2 = computeAveragePrice(filteredData2);

    const corr = pearsonCorrelation(filteredData1, filteredData2);

    res.json({
      correlation: corr,
      stocks: {
        [symbol1]: { averagePrice: avg1, priceHistory: filteredData1 },
        [symbol2]: { averagePrice: avg2, priceHistory: filteredData2 },
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch or process stock information" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is listening on http://localhost:${PORT}`);
});
