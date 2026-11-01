import { describe, expect, it } from "vitest";
import { parseAssetPairs, searchPairs } from "./pairs";

describe("watchlist coin search", () => {
  const json = { result: {
    XXBTZUSD: { wsname: "XBT/USD", status: "online" }, XETHZEUR: { wsname: "ETH/EUR", status: "online" },
    XETHZUSD: { wsname: "ETH/USD", status: "online" }, XDGUSD: { wsname: "XDG/USD", status: "online" },
    BONKUSD: { wsname: "BONK/USD", status: "online" }, OLDUSD: { wsname: "OLD/USD", status: "delisted" },
    ETHXBT: { wsname: "ETH/XBT", status: "online" },
  } };
  it("maps Kraken codes and keeps only online pairs for the quote", () => {
    expect(parseAssetPairs(json, "USD")).toEqual(["BONK", "BTC", "DOGE", "ETH"]);
    expect(parseAssetPairs(json, "EUR")).toEqual(["ETH"]);
    expect(parseAssetPairs(json, "BTC")).toEqual(["ETH"]);
  });
  it("ranks exact, then prefix, then contains, and hides coins already listed", () => {
    const list = ["BONK", "BTC", "DOGE", "ETH", "ETHFI", "WETH", "SOL"];
    expect(searchPairs(list, "eth", [])).toEqual(["ETH", "ETHFI", "WETH"]);
    expect(searchPairs(list, "eth", ["ETH"])).toEqual(["ETHFI", "WETH"]);
    expect(searchPairs(list, "", ["BTC"])).toEqual(["ETH", "SOL", "DOGE"]);
  });
});
