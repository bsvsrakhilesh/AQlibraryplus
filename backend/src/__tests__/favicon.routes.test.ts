import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import axios from "axios";
import dns from "dns/promises";

import faviconRoutes from "../routes/favicon.routes";

async function requestFavicon(rawUrl: string) {
  const app = express();
  app.use("/api", faviconRoutes);
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const path = `/api/favicon?url=${encodeURIComponent(rawUrl)}`;
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
    return {
      status: response.status,
      body: await response.json().catch(() => null),
    };
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

function mockNoFaviconFetch(t: TestContext) {
  t.mock.method(axios as any, "get", async () => {
    assert.fail("axios.get should not run for blocked favicon hosts");
  });
}

test("favicon route rejects localhost targets before DNS or outbound fetch", async (t) => {
  t.mock.method(dns as any, "lookup", async () => {
    assert.fail("dns.lookup should not run for blocked localhost targets");
  });
  mockNoFaviconFetch(t);

  const response = await requestFavicon("http://localhost/admin");

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "Blocked host" });
});

test("favicon route rejects private DNS answers before outbound fetch", async (t) => {
  t.mock.method(dns as any, "lookup", async () => [
    { address: "192.168.1.20", family: 4 },
  ]);
  mockNoFaviconFetch(t);

  const response = await requestFavicon("https://public-looking.example/page");

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "Blocked host" });
});

test("favicon route rejects non-http URL schemes", async (t) => {
  t.mock.method(dns as any, "lookup", async () => {
    assert.fail("dns.lookup should not run for invalid schemes");
  });
  mockNoFaviconFetch(t);

  const response = await requestFavicon("file:///etc/passwd");

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "Invalid url" });
});
