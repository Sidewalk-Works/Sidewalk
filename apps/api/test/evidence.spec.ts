import request from "supertest";
import sharp from "sharp";
import {
  createApp,
  makeReport,
  pngImage,
  resetDatabase,
  seedCategories,
  signedIn,
  type TestApp
} from "./helpers";

describe("Evidence upload and access", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await seedCategories(t.prisma);
  });
  afterAll(() => t.close());

  it("stores a real image and serves thumbnails and full size to the public", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(client);
    const up = await client.upload(
      `/reports/${reference}/evidence`,
      await pngImage(2400, 1800),
      "photo.png",
      { caption: "Taken at noon" }
    );
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({
      kind: "REPORT",
      caption: "Taken at noon",
      mimeType: "image/webp"
    });
    expect(up.body.width).toBeLessThanOrEqual(1800);

    const full = await request(t.app.getHttpServer()).get(up.body.fullUrl);
    const thumb = await request(t.app.getHttpServer()).get(up.body.thumbUrl);
    expect(full.status).toBe(200);
    expect(full.headers["content-type"]).toBe("image/webp");
    expect(full.headers["cache-control"]).toContain("public");
    expect((await sharp(thumb.body).metadata()).width).toBeLessThanOrEqual(640);

    const detail = await request(t.app.getHttpServer()).get(`/api/v1/reports/${reference}`);
    expect(detail.body.evidence).toHaveLength(1);
    expect(detail.body.coverThumbUrl).toBe(up.body.thumbUrl);
    expect(detail.text).not.toMatch(/storageKey|thumbKey|\.webp|sha256/);
  });

  it("strips EXIF metadata, including GPS coordinates, from uploads", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(client);
    const withGps = await sharp({
      create: { width: 200, height: 150, channels: 3, background: { r: 90, g: 120, b: 40 } }
    })
      .jpeg()
      .withExif({
        IFD0: { Copyright: "Someone" },
        IFD3: {
          GPSLatitudeRef: "N",
          GPSLatitude: "6/1 31/1 0/1",
          GPSLongitudeRef: "E",
          GPSLongitude: "3/1 22/1 0/1"
        }
      })
      .toBuffer();
    expect((await sharp(withGps).metadata()).exif).toBeDefined();

    const up = await client.upload(`/reports/${reference}/evidence`, withGps, "geo.jpg");
    expect(up.status).toBe(201);
    const served = await request(t.app.getHttpServer()).get(up.body.fullUrl);
    expect((await sharp(served.body).metadata()).exif).toBeUndefined();
  });

  it("validates real content, not the filename or declared type", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(client);

    const text = await client.upload(
      `/reports/${reference}/evidence`,
      Buffer.from("<script>alert(1)</script>"),
      "evil.png",
      {},
      "image/png"
    );
    expect(text.status).toBe(400);
    expect(text.body.code).toBe("UNSUPPORTED_FILE_TYPE");

    const svg = await client.upload(
      `/reports/${reference}/evidence`,
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      "x.svg",
      {},
      "image/svg+xml"
    );
    expect(svg.status).toBe(400);

    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } })
      .gif()
      .toBuffer();
    expect((await client.upload(`/reports/${reference}/evidence`, gif, "x.gif")).status).toBe(400);

    // A valid PNG signature followed by garbage is rejected when decoding fails.
    const truncated = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("not really a png")
    ]);
    const corrupt = await client.upload(`/reports/${reference}/evidence`, truncated, "bad.png");
    expect(corrupt.status).toBe(400);
    expect(corrupt.body.code).toBe("CORRUPT_IMAGE");

    expect(
      (await client.upload(`/reports/${reference}/evidence`, Buffer.alloc(0), "empty.png")).status
    ).toBe(400);
    expect(await t.prisma.reportEvidence.count()).toBe(0);
  });

  it("enforces the file size limit", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(client);
    const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(9 * 1024 * 1024)]);
    const res = await client.upload(`/reports/${reference}/evidence`, huge, "huge.jpg");
    expect(res.status).toBe(413);
    expect(await t.prisma.reportEvidence.count()).toBe(0);
  });

  it("only lets the owner add evidence, and requires sign-in", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const stranger = await signedIn(t.app, t.prisma);
    const staff = await signedIn(t.app, t.prisma, "MODERATOR");
    const { reference } = await makeReport(client);

    const anon = await request(t.app.getHttpServer())
      .post(`/api/v1/reports/${reference}/evidence`)
      .attach("file", await pngImage(), "a.png");
    expect(anon.status).toBe(401);
    expect(
      (await stranger.client.upload(`/reports/${reference}/evidence`, await pngImage(), "a.png"))
        .status
    ).toBe(403);
    // Staff may only add resolution evidence, never impersonate the reporter's own evidence.
    expect(
      (await staff.client.upload(`/reports/${reference}/evidence`, await pngImage(), "a.png"))
        .status
    ).toBe(403);
    expect(
      (
        await staff.client.upload(`/reports/${reference}/evidence`, await pngImage(), "a.png", {
          kind: "RESOLUTION"
        })
      ).status
    ).toBe(201);
    expect(
      (await client.upload(`/reports/${reference}/evidence`, await pngImage(), "b.png")).status
    ).toBe(201);
  });

  it("rejects the same photograph twice and caps photographs per report", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(client);
    const image = await pngImage();
    expect((await client.upload(`/reports/${reference}/evidence`, image, "a.png")).status).toBe(
      201
    );
    const dup = await client.upload(`/reports/${reference}/evidence`, image, "again.png");
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("DUPLICATE_EVIDENCE");

    for (let i = 0; i < 9; i++)
      expect(
        (await client.upload(`/reports/${reference}/evidence`, await pngImage(), `p${i}.png`))
          .status
      ).toBe(201);
    const over = await client.upload(
      `/reports/${reference}/evidence`,
      await pngImage(),
      "eleventh.png"
    );
    expect(over.status).toBe(409);
    expect(over.body.code).toBe("EVIDENCE_LIMIT");
  });

  it("does not serve evidence of hidden reports to the public", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const staff = await signedIn(t.app, t.prisma, "MODERATOR");
    const stranger = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(client);
    const up = await client.upload(`/reports/${reference}/evidence`, await pngImage(), "a.png");
    await staff.client.post(`/moderation/reports/${reference}/actions`, {
      action: "HIDE",
      policy: "PRIVACY_EXPOSURE",
      reason: "The photograph shows a visible number plate."
    });

    expect((await request(t.app.getHttpServer()).get(up.body.fullUrl)).status).toBe(404);
    expect((await stranger.client.get(up.body.fullUrl.replace("/api/v1", ""))).status).toBe(404);
    const owner = await client.get(up.body.fullUrl.replace("/api/v1", ""));
    expect(owner.status).toBe(200);
    expect(owner.headers["cache-control"]).toContain("no-store");
  });

  it("lets the uploader remove their own evidence while the report is editable", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const other = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(client);
    const up = await client.upload(`/reports/${reference}/evidence`, await pngImage(), "a.png");
    expect((await other.client.del(`/reports/${reference}/evidence/${up.body.id}`)).status).toBe(
      403
    );
    expect((await client.del(`/reports/${reference}/evidence/${up.body.id}`)).status).toBe(204);
    expect(await t.prisma.reportEvidence.count()).toBe(0);
    expect((await request(t.app.getHttpServer()).get(up.body.fullUrl)).status).toBe(404);
  });
});
