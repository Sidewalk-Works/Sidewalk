// Applies the committed migrations to the test database once per run, proving they work from scratch.
const { execSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { parse } = require("dotenv");

module.exports = async () => {
  const envFile = path.resolve(__dirname, "../../../.env.test");
  const env = parse(readFileSync(envFile));
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, ...env, DOTENV_CONFIG_PATH: envFile },
    stdio: "pipe"
  });
};
