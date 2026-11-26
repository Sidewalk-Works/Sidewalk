// Runs in every test worker before any module loads: point the app at the throwaway test database.
const path = require("node:path");
const { config } = require("dotenv");

const file = path.resolve(__dirname, "../../../.env.test");
config({ path: file, override: true, quiet: true });
process.env.DOTENV_CONFIG_PATH = file;
