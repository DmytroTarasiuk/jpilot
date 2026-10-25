import { describe, expect, it, vi } from "vitest";
import { buildDjinniFeedUrl, discoverDjinniVacancies, parseDjinniFeed } from "./djinni";

const rss = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Latest Job Vacancies at Djinni</title>
    <item>
      <title>Senior TypeScript Engineer</title>
      <link>https://djinni.co/jobs/845514-senior-typescript-engineer/?utm_source=rss</link>
      <description><![CDATA[<p>Remote product role using TypeScript, Node.js and PostgreSQL.</p>]]></description>
      <pubDate>Sat, 24 Oct 2026 10:00:00 +0000</pubDate>
      <guid>https://djinni.co/jobs/845514-senior-typescript-engineer/</guid>
      <category>Node.js</category>
      <category>TypeScript</category>
    </item>
  </channel>
</rss>`;

describe("Djinni RSS discovery", () => {
  it("uses the first-party country-filtered RSS URL and returns bounded window records", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(rss, { status: 200, headers: { "content-type": "application/rss+xml" } }),
    );

    const result = await discoverDjinniVacancies(
      {
        targetCountries: ["PL"],
        windowStart: new Date("2026-10-24T00:00:00.000Z"),
        windowEnd: new Date("2026-10-25T00:00:00.000Z"),
        limit: 1,
      },
      fetchImpl as typeof fetch,
    );

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(buildDjinniFeedUrl("PL"));
    expect(new URL(buildDjinniFeedUrl("PL")).searchParams.get("region")).toBeNull();
    expect(new URL(buildDjinniFeedUrl("PL")).searchParams.get("country")).toBe("POL");
    expect(result.failures).toEqual([]);
    expect(result.diagnostics).toEqual({
      feedsRequested: 1,
      sourceItemsRetrieved: 1,
      sourceItemsParsed: 1,
      sourceItemsMalformed: 0,
      rejectedOutsideRunWindow: 0,
      rejectedDuplicateInBatch: 0,
      recordsSelected: 1,
    });
    expect(result.records).toEqual([
      expect.objectContaining({
        externalId: "845514",
        countryCode: "PL",
        title: "Senior TypeScript Engineer",
        sourceUrl: "https://djinni.co/jobs/845514-senior-typescript-engineer/",
        categories: ["Node.js", "TypeScript"],
      }),
    ]);
  });

  it("keeps country filtering independent from region and explains window rejections", async () => {
    const staleRss = rss.replace(
      "Sat, 24 Oct 2026 10:00:00 +0000",
      "Thu, 22 Oct 2026 10:00:00 +0000",
    );
    const fetchImpl = vi.fn(async () =>
      new Response(staleRss, { status: 200, headers: { "content-type": "application/rss+xml" } }),
    );

    const result = await discoverDjinniVacancies(
      {
        targetCountries: ["PL"],
        windowStart: new Date("2026-10-23T00:00:00.000Z"),
        windowEnd: new Date("2026-10-25T00:00:00.000Z"),
        limit: 25,
      },
      fetchImpl as typeof fetch,
    );

    expect(result.records).toEqual([]);
    expect(result.diagnostics).toEqual(
      expect.objectContaining({
        sourceItemsRetrieved: 1,
        sourceItemsParsed: 1,
        rejectedOutsideRunWindow: 1,
        recordsSelected: 0,
      }),
    );
  });

  it("records malformed source items as deterministic failures", () => {
    const malformed = rss.replace(
      "https://djinni.co/jobs/845514-senior-typescript-engineer/?utm_source=rss",
      "javascript:alert(1)",
    ).replace(
      "https://djinni.co/jobs/845514-senior-typescript-engineer/</guid>",
      "javascript:alert(1)</guid>",
    );

    const result = parseDjinniFeed(malformed, "UA");

    expect(result.records).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toEqual(
      expect.objectContaining({ failureCode: "job_url_protocol_unsupported" }),
    );
  });
});
