import test from "node:test";
import assert from "node:assert/strict";

test("collector purpose authority inference finds CAQM for GRAP Stage IV questions", async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgresql://smart_scrape:smart_scrape@localhost:5432/smart_scrape_test";
  process.env.AQLIBRARYPLUS_DISABLE_AUTO_TAG_QUEUE = "true";

  const { authoritySourceForUrl, fallbackPurposeLanes, inferAuthoritySources } = await import(
    "../services/collectorPurpose.service"
  );

  const purpose = {
    title: "GRAP Stage IV orders",
    researchQuestion: "Find GRAP 4 orders and revocation orders for Delhi NCR.",
    jurisdiction: "Delhi NCR",
    region: "Delhi",
    yearFrom: null,
    yearTo: null,
    sourcePreferences: [],
    targetActors: [],
  };

  const sources = inferAuthoritySources(purpose);
  assert.equal(sources[0].domain, "caqm.nic.in");
  assert.ok(
    (sources.find((source) => source.domain === "caqm.nic.in")?.confidence ?? 0) >
      (sources.find((source) => source.domain === "cpcb.nic.in")?.confidence ?? 0),
  );
  assert.ok(sources.some((source) => source.domain === "cpcb.nic.in"));
  assert.ok(sources.some((source) => source.domain === "hspcb.gov.in"));
  assert.ok(sources.some((source) => source.domain === "uppcb.com"));
  assert.ok(sources.some((source) => source.domain === "environment.rajasthan.gov.in"));
  assert.equal(
    authoritySourceForUrl(
      sources,
      "https://caqm.nic.in/WriteReadData/LINKS/GRAP%20stage%20IV%20order.pdf",
    )?.label,
    "CAQM",
  );

  const lanes = fallbackPurposeLanes(purpose);
  assert.ok(
    lanes.some(
      (lane) => lane.website === "caqm.nic.in" && lane.format === "pdfOnly",
    ),
  );
});

test("collector purpose authority inference covers stubble and forecast evidence sources", async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgresql://smart_scrape:smart_scrape@localhost:5432/smart_scrape_test";
  process.env.AQLIBRARYPLUS_DISABLE_AUTO_TAG_QUEUE = "true";

  const { inferAuthoritySources } = await import(
    "../services/collectorPurpose.service"
  );

  const sources = inferAuthoritySources({
    title: "Stubble burning and Delhi AQI",
    researchQuestion:
      "Find official evidence on Punjab paddy stubble burning contribution to Delhi NCR AQI forecast and air quality.",
    jurisdiction: "Delhi NCR",
    region: "Punjab and Delhi",
    yearFrom: null,
    yearTo: null,
    sourcePreferences: [],
    targetActors: [],
  });

  assert.ok(sources.some((source) => source.domain === "ppcb.punjab.gov.in"));
  assert.ok(sources.some((source) => source.domain === "mausam.imd.gov.in"));
  assert.ok(sources.some((source) => source.domain === "safar.tropmet.res.in"));
});

test("saveCollectorPurposeSelection deduplicates noisy selected collector rows before linking", async (t) => {
  const testDatabaseUrl = process.env.AQLIBRARYPLUS_TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    t.skip("set AQLIBRARYPLUS_TEST_DATABASE_URL to run the collector purpose dedup database integration test");
    return;
  }

  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.AQLIBRARYPLUS_DISABLE_AUTO_TAG_QUEUE = "true";

  const [{ canonicalizeUrl }, { default: prisma }, { saveCollectorPurposeSelection }] =
    await Promise.all([
      import("../utils/urlCanonical"),
      import("../config/database"),
      import("../services/collectorPurpose.service"),
    ]);

  const ownerId = `collector-dedup-${Date.now()}-${process.pid}`;
  const uniqueHost = `${ownerId}.example.test`;
  const expectedCanonical = canonicalizeUrl(
    `https://${uniqueHost}/orders/report.pdf?download=1`,
  );

  const purpose = await prisma.collectorPurpose.create({
    data: {
      ownerId,
      title: "Collector dedup integration",
      researchQuestion: "Do duplicate selected collector results save once?",
    },
    select: { id: true },
  });

  try {
    const firstSave = await saveCollectorPurposeSelection({
      ownerId,
      purposeId: purpose.id,
      rows: [
        {
          title: "Original report",
          url: `https://${uniqueHost}/orders/report.pdf?download=1&utm_source=collector#page=1`,
        },
        {
          title: "Duplicate decorated report",
          url: `https://${uniqueHost.toUpperCase()}:443/orders//report.pdf/?download=1&fbclid=abc`,
        },
        {
          title: "Duplicate bare report",
          url: `${uniqueHost}/orders/report.pdf?download=1`,
        },
      ],
    });

    assert.equal(firstSave.rows.length, 1);
    assert.equal(firstSave.rows[0].status, "saved_to_purpose");

    const storedUrls = await prisma.url.findMany({
      where: { canonical_url: expectedCanonical },
      select: { id: true },
    });
    assert.equal(storedUrls.length, 1);

    const links = await prisma.collectorPurposeUrl.findMany({
      where: { purposeId: purpose.id, urlId: storedUrls[0].id },
      select: { purposeId: true, urlId: true },
    });
    assert.equal(links.length, 1);

    const secondSave = await saveCollectorPurposeSelection({
      ownerId,
      purposeId: purpose.id,
      rows: [
        {
          title: "Same report again",
          url: `https://${uniqueHost}/orders/report.pdf?download=1&utm_medium=email`,
        },
      ],
    });

    assert.equal(secondSave.rows.length, 1);
    assert.equal(secondSave.rows[0].status, "already_in_purpose");
  } finally {
    await prisma.collectorPurpose.deleteMany({ where: { id: purpose.id } });
    await prisma.url.deleteMany({ where: { canonical_url: expectedCanonical } });
    await prisma.$disconnect();
  }
});

test("deleteCollectorPurpose removes purpose-only records and keeps saved URLs", async (t) => {
  const testDatabaseUrl = process.env.AQLIBRARYPLUS_TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    t.skip("set AQLIBRARYPLUS_TEST_DATABASE_URL to run the collector purpose delete database integration test");
    return;
  }

  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.AQLIBRARYPLUS_DISABLE_AUTO_TAG_QUEUE = "true";

  const [{ default: prisma }, { deleteCollectorPurpose }] = await Promise.all([
    import("../config/database"),
    import("../services/collectorPurpose.service"),
  ]);

  const ownerId = `collector-delete-${Date.now()}-${process.pid}`;
  const canonicalUrl = `https://${ownerId}.example.test/source`;
  let purposeId = "";
  let urlId = 0;

  try {
    const purpose = await prisma.collectorPurpose.create({
      data: {
        ownerId,
        title: "Collector delete integration",
        researchQuestion: "Does deleting a purpose keep saved URLs?",
      },
      select: { id: true },
    });
    purposeId = purpose.id;

    const url = await prisma.url.create({
      data: {
        url: canonicalUrl,
        canonical_url: canonicalUrl,
        normalizedDomain: `${ownerId}.example.test`,
        title: "Source retained after purpose delete",
      },
      select: { id: true },
    });
    urlId = url.id;

    const search = await prisma.collectorPurposeSearch.create({
      data: {
        purposeId,
        query: "purpose delete safety",
        laneKey: "official-record",
        parameters: { source: "test" },
        resultCount: 1,
      },
      select: { id: true },
    });

    await prisma.collectorPurposeUrl.create({
      data: {
        purposeId,
        urlId,
        sourceSearchId: search.id,
      },
    });

    assert.deepEqual(await deleteCollectorPurpose(ownerId, purposeId), { ok: true });

    assert.equal(await prisma.collectorPurpose.count({ where: { id: purposeId } }), 0);
    assert.equal(await prisma.collectorPurposeSearch.count({ where: { purposeId } }), 0);
    assert.equal(await prisma.collectorPurposeUrl.count({ where: { purposeId } }), 0);
    assert.equal(await prisma.url.count({ where: { id: urlId } }), 1);
  } finally {
    if (purposeId) await prisma.collectorPurpose.deleteMany({ where: { id: purposeId } });
    if (urlId) await prisma.url.deleteMany({ where: { id: urlId } });
    await prisma.$disconnect();
  }
});
