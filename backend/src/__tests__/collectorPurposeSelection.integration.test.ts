import test from "node:test";
import assert from "node:assert/strict";

test("saveCollectorPurposeSelection deduplicates noisy selected collector rows before linking", async (t) => {
  const testDatabaseUrl = process.env.SMARTSCRAPE_TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    t.skip("set SMARTSCRAPE_TEST_DATABASE_URL to run the collector purpose dedup database integration test");
    return;
  }

  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.SMARTSCRAPE_DISABLE_AUTO_TAG_QUEUE = "true";

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
  const testDatabaseUrl = process.env.SMARTSCRAPE_TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    t.skip("set SMARTSCRAPE_TEST_DATABASE_URL to run the collector purpose delete database integration test");
    return;
  }

  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.SMARTSCRAPE_DISABLE_AUTO_TAG_QUEUE = "true";

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
