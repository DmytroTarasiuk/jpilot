import { describe, expect, it, vi } from "vitest";
import { buildDouFeedUrl, discoverDouVacancies, parseDouFeed } from "./dou";

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <item>
    <title>Senior TypeScript Engineer в Acme, Warszawa</title>
    <link>https://jobs.dou.ua/companies/acme/vacancies/1001/?utm_source=jobsrss</link>
    <description><![CDATA[<p>TypeScript, Node.js and PostgreSQL.</p>]]></description>
    <pubDate>Fri, 24 Oct 2026 10:00:00 +0000</pubDate>
    <guid>https://jobs.dou.ua/companies/acme/vacancies/1001/</guid>
  </item>
  <item>
    <title>Backend Engineer в Bright, віддалено</title>
    <link>https://jobs.dou.ua/companies/bright/vacancies/1002/</link>
    <description><![CDATA[<p>Remote Node.js role.</p>]]></description>
    <pubDate>Fri, 24 Oct 2026 11:00:00 +0000</pubDate>
    <guid>https://jobs.dou.ua/companies/bright/vacancies/1002/</guid>
  </item>
  <item>
    <title>Platform Engineer в Abroad GmbH, Berlin</title>
    <link>https://jobs.dou.ua/companies/abroad/vacancies/1003/</link>
    <description><![CDATA[<p>On-site role.</p>]]></description>
    <pubDate>Fri, 24 Oct 2026 12:00:00 +0000</pubDate>
    <guid>https://jobs.dou.ua/companies/abroad/vacancies/1003/</guid>
  </item>
  <item>
    <title>Broken date в Acme, Київ</title>
    <link>https://jobs.dou.ua/companies/acme/vacancies/1004/</link>
    <description><![CDATA[<p>Invalid date.</p>]]></description>
    <pubDate>not-a-date</pubDate>
    <guid>https://jobs.dou.ua/companies/acme/vacancies/1004/</guid>
  </item>
</channel></rss>`;

describe("DOU RSS discovery", () => {
  it("parses first-party vacancies without inventing unsupported countries", () => {
    const parsed = parseDouFeed(feed);
    expect(parsed.records).toHaveLength(2);
    expect(parsed.failures).toHaveLength(1);
    expect(parsed.rejectedUnsupportedCountry).toBe(1);
    expect(parsed.records[0]).toMatchObject({
      platform: "dou",
      externalId: "1001",
      sourceUrl: "https://jobs.dou.ua/companies/acme/vacancies/1001/",
      countryCode: "PL",
      title: "Senior TypeScript Engineer",
      company: "Acme",
      city: "Warszawa",
    });
    expect(parsed.records[1]).toMatchObject({ countryCode: "UA", city: "віддалено" });
  });

  it("applies the run window, country selection, and source limit deterministically", async () => {
    const fetchImpl = vi.fn(async () => new Response(feed, {
      status: 200,
      headers: { "content-type": "application/rss+xml" },
    })) as unknown as typeof fetch;
    const batch = await discoverDouVacancies({
      targetCountries: ["PL"],
      windowStart: new Date("2026-10-24T00:00:00.000Z"),
      windowEnd: new Date("2026-10-25T00:00:00.000Z"),
      limit: 10,
    }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(buildDouFeedUrl(), expect.objectContaining({
      headers: expect.objectContaining({ accept: expect.stringContaining("application/rss+xml") }),
    }));
    expect(batch.records.map((record) => record.externalId)).toEqual(["1001"]);
    expect(batch.diagnostics).toEqual({
      feedsRequested: 1,
      sourceItemsRetrieved: 4,
      sourceItemsParsed: 2,
      sourceItemsMalformed: 1,
      rejectedOutsideRunWindow: 0,
      rejectedDuplicateInBatch: 0,
      rejectedCountryNotSelected: 1,
      rejectedUnsupportedCountry: 1,
      recordsSelected: 1,
    });
  });
});
