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
      (lane) => lane.website === "caqm.nic.in" && lane.format === "any",
    ),
  );
  assert.ok(lanes.some((lane) => /GRAP 4/i.test(lane.keywords)));
});

test("generic GRAP purposes do not acquire a stage or unrelated registry hints", async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgresql://smart_scrape:smart_scrape@localhost:5432/smart_scrape_test";
  process.env.AQLIBRARYPLUS_DISABLE_AUTO_TAG_QUEUE = "true";

  const { fallbackPurposeLanes, inferAuthoritySources } = await import(
    "../services/collectorPurpose.service"
  );
  const purpose = {
    title: "Reasons for GRAP orders",
    researchQuestion: "Find reasons for GRAP orders.",
    jurisdiction: "Delhi NCR",
    region: null,
    yearFrom: null,
    yearTo: null,
    sourcePreferences: [],
    targetActors: [],
  };

  const caqm = inferAuthoritySources(purpose).find((source) => source.key === "caqm");
  assert.ok(caqm);
  assert.deepEqual(caqm.queryHints, ["GRAP"]);
  assert.deepEqual(caqm.documentTerms, ["order"]);

  const lanes = fallbackPurposeLanes(purpose);
  assert.ok(lanes.some((lane) => lane.website === "caqm.nic.in"));
  assert.ok(lanes.every((lane) => !/stage\s*(?:iv|4)|sub-committee/i.test(lane.keywords)));
  assert.ok(lanes.every((lane) => lane.format === "any"));
});

test("an explicit PDF purpose retains its requested format constraint", async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgresql://smart_scrape:smart_scrape@localhost:5432/smart_scrape_test";
  process.env.AQLIBRARYPLUS_DISABLE_AUTO_TAG_QUEUE = "true";

  const { fallbackPurposeLanes } = await import("../services/collectorPurpose.service");
  const lanes = fallbackPurposeLanes({
    researchQuestion: "Find PDF copies of GRAP Stage IV orders.",
    jurisdiction: "Delhi NCR",
    region: null,
    yearFrom: null,
    yearTo: null,
    sourcePreferences: [],
    targetActors: [],
  });

  assert.ok(lanes.every((lane) => lane.format === "pdfOnly"));
  assert.ok(lanes.some((lane) => /Stage IV/i.test(lane.keywords)));
});

test("AI lane sanitation cannot invent structured purpose scope", async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgresql://smart_scrape:smart_scrape@localhost:5432/smart_scrape_test";
  process.env.AQLIBRARYPLUS_DISABLE_AUTO_TAG_QUEUE = "true";

  const { collectorPurposePlanningTestHooks, fallbackPurposeLanes } = await import(
    "../services/collectorPurpose.service"
  );
  const purpose = {
    title: "GRAP orders",
    researchQuestion: "Find GRAP orders.",
    jurisdiction: "Delhi NCR",
    region: null,
    yearFrom: null,
    yearTo: null,
    sourcePreferences: [],
    targetActors: [],
  };
  const fallback = fallbackPurposeLanes(purpose);
  const proposed = [
    {
      key: "primary",
      label: "Primary records",
      rationale: "Find the requested records.",
      website: "unrelated.example",
      keywords: "GRAP orders",
      jurisdiction: "Haryana",
      region: "Gurugram",
      yearFrom: "2024",
      yearTo: "2025",
      format: "pdfOnly" as const,
    },
    {
      key: "official",
      label: "Official records",
      rationale: "Find official records.",
      website: "caqm.nic.in",
      keywords: "GRAP orders",
      jurisdiction: "India",
      region: "Delhi",
      yearFrom: "2020",
      yearTo: "2026",
      format: "excludePdf" as const,
    },
  ];

  const lanes = collectorPurposePlanningTestHooks.sanitizeLanes(
    proposed,
    fallback,
    purpose,
  );
  assert.equal(lanes[0].website, "");
  assert.equal(lanes[1].website, "caqm.nic.in");
  assert.ok(lanes.every((lane) => lane.jurisdiction === "Delhi NCR"));
  assert.ok(lanes.every((lane) => lane.region === ""));
  assert.ok(lanes.every((lane) => lane.yearFrom === "" && lane.yearTo === ""));
  assert.ok(lanes.every((lane) => lane.format === "any"));
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

test("collector purpose authority inference broadens Delhi construction searches to related government portals", async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgresql://smart_scrape:smart_scrape@localhost:5432/smart_scrape_test";
  process.env.AQLIBRARYPLUS_DISABLE_AUTO_TAG_QUEUE = "true";

  const { inferAuthoritySources } = await import(
    "../services/collectorPurpose.service"
  );

  const sources = inferAuthoritySources({
    title: "Delhi C&D dust enforcement",
    researchQuestion:
      "How did CAQM directions translate into Delhi construction-and-demolition dust enforcement and reporting?",
    jurisdiction: "Delhi NCR",
    region: "Delhi",
    yearFrom: null,
    yearTo: null,
    sourcePreferences: [],
    targetActors: [],
  });

  assert.ok(sources.some((source) => source.domain === "caqm.nic.in"));
  assert.ok(sources.some((source) => source.domain === "delhi.gov.in"));
  assert.ok(sources.some((source) => source.domain === "mohua.gov.in"));
  assert.ok(sources.some((source) => source.domain === "ncrpb.nic.in"));
  assert.ok(sources.some((source) => source.domain === "india.gov.in"));
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
