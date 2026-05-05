import assert from "node:assert/strict";
import test from "node:test";

test("extractStaticPdfCandidates finds linked, embedded, and scripted PDFs", async () => {
  process.env.DATABASE_URL ||=
    "postgresql://user:pass@localhost:5432/smartscrape_test";

  const { extractStaticPdfCandidates } = await import(
    "../services/documentDiscovery.service"
  );

  const html = `
    <html>
      <head><title>Orders</title></head>
      <body>
        <h1>GRAP Orders</h1>
        <ul>
          <li>
            <a href="/docs/order-16-04-2026.pdf">
              Order dated 16.04.2026 - Implementation under Stage-I
            </a>
          </li>
          <li>
            <iframe src="../files/advisory.pdf"></iframe>
          </li>
        </ul>
        <script>
          window.open('/downloads/notification.pdf?download=1');
        </script>
      </body>
    </html>
  `;

  const out = extractStaticPdfCandidates(
    html,
    "https://example.gov/archive/orders/index.html",
  );

  assert.equal(out.length, 3);
  assert.ok(out.some((c) => c.url === "https://example.gov/docs/order-16-04-2026.pdf"));
  assert.ok(out.some((c) => c.url === "https://example.gov/archive/files/advisory.pdf"));
  assert.ok(
    out.some(
      (c) =>
        c.url === "https://example.gov/downloads/notification.pdf?download=1",
    ),
  );
});

test("extractStaticPdfCandidates ignores non-document links", async () => {
  process.env.DATABASE_URL ||=
    "postgresql://user:pass@localhost:5432/smartscrape_test";

  const { extractStaticPdfCandidates } = await import(
    "../services/documentDiscovery.service"
  );

  const out = extractStaticPdfCandidates(
    `<a href="/about">About</a><a href="mailto:test@example.gov">Mail</a>`,
    "https://example.gov",
  );

  assert.equal(out.length, 0);
});
