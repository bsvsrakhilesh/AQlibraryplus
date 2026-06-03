import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";

import { googleSearch, resultHostMatchesSite } from "../services/search.service";

function mockGoogleCse(t: TestContext, items: any[]) {
  t.mock.method(axios as any, "get", async () => ({
    status: 200,
    data: {
      items,
      queries: {},
      searchInformation: { totalResults: String(items.length) },
    },
  }));
}

test("resultHostMatchesSite accepts exact hosts, www variants, and subdomains only", () => {
  assert.equal(
    resultHostMatchesSite("https://caqm.nic.in/order.pdf", "caqm.nic.in"),
    true,
  );
  assert.equal(
    resultHostMatchesSite("https://orders.caqm.nic.in/order.pdf", "caqm.nic.in"),
    true,
  );
  assert.equal(
    resultHostMatchesSite("https://www.caqm.nic.in/order.pdf", "caqm.nic.in"),
    true,
  );
  assert.equal(
    resultHostMatchesSite("https://cpcb.nic.in/report.pdf", "caqm.nic.in"),
    false,
  );
  assert.equal(
    resultHostMatchesSite("https://notcaqm.nic.in/report.pdf", "caqm.nic.in"),
    false,
  );
});

test("googleSearch drops CSE results outside the requested site", async (t) => {
  const oldKey = process.env.GOOGLE_CSE_KEY;
  const oldCx = process.env.GOOGLE_CSE_CX;
  process.env.GOOGLE_CSE_KEY = "test-key";
  process.env.GOOGLE_CSE_CX = "test-cx";
  t.after(() => {
    if (oldKey === undefined) delete process.env.GOOGLE_CSE_KEY;
    else process.env.GOOGLE_CSE_KEY = oldKey;
    if (oldCx === undefined) delete process.env.GOOGLE_CSE_CX;
    else process.env.GOOGLE_CSE_CX = oldCx;
  });

  mockGoogleCse(t, [
    {
      title: "CAQM order",
      link: "https://caqm.nic.in/order.pdf",
      snippet: "Official order",
    },
    {
      title: "CAQM subdomain order",
      link: "https://orders.caqm.nic.in/order.pdf",
      snippet: "Official order",
    },
    {
      title: "Other board copy",
      link: "https://cpcb.nic.in/copied-order.pdf",
      snippet: "Different domain",
    },
  ]);

  const out = await googleSearch("GRAP stage IV", 1, { site: "caqm.nic.in" });

  assert.deepEqual(
    out.results.map((row) => row.url),
    [
      "https://caqm.nic.in/order.pdf",
      "https://orders.caqm.nic.in/order.pdf",
    ],
  );
  assert.equal(out.totalResults, 3);
});
