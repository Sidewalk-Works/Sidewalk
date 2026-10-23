import express from "express";
import { pinoHttp } from "pino-http";
import request from "supertest";
import { Writable } from "node:stream";
import { buildPinoHttpOptions } from "../src/common/logging";
import { describeErrorForLog } from "../src/common/filters/all-exceptions.filter";

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    }
  });
  return { lines, stream };
}

describe("logging never records credentials", () => {
  it("drops query strings and credentials from request logs, and redacts secrets logged by mistake", async () => {
    const { lines, stream } = capture();
    const { transport: _transport, ...options } = buildPinoHttpOptions({
      LOG_LEVEL: "info",
      NODE_ENV: "production"
    });
    const app = express();
    app.use(express.json());
    app.use(pinoHttp(options, stream));
    app.post("/api/v1/auth/login", (req, res) => {
      // A developer mistake: logging the body, the headers and a user row. The redaction must still hold.
      req.log.info(
        {
          body: req.body,
          headers: req.headers,
          user: { email: "a@example.test", passwordHash: "$argon2id$HASHVALUE" }
        },
        "debugging"
      );
      res.setHeader("Set-Cookie", ["sw_at=ACCESSVALUE; HttpOnly", "sw_rt=REFRESHVALUE; HttpOnly"]);
      res.status(401).json({});
    });

    await request(app)
      .post("/api/v1/auth/login?email=victim@example.test&q=secret-search")
      .set("Authorization", "Bearer eyJhbGciOiJIUzI1NiJ9.AAAA.BBBB")
      .set("Cookie", "sw_at=COOKIEACCESS; sw_rt=COOKIEREFRESH")
      .set("X-CSRF-Token", "CSRFVALUE")
      .send({ email: "a@example.test", password: "Hunter2-Password!" });

    const output = lines.join("\n");
    expect(output.length).toBeGreaterThan(0);
    for (const secret of [
      "Hunter2-Password!",
      "HASHVALUE",
      "eyJhbGciOiJIUzI1NiJ9",
      "COOKIEACCESS",
      "COOKIEREFRESH",
      "CSRFVALUE",
      "ACCESSVALUE",
      "REFRESHVALUE",
      "victim@example.test",
      "secret-search"
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain("/api/v1/auth/login");
  });

  it("error descriptions are safe for the log", () => {
    const logged = JSON.stringify(
      describeErrorForLog(new Error("connect failed: password=hunter2 for user"))
    );
    expect(logged).not.toContain("hunter2");
  });
});
