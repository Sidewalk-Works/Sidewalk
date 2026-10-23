/** @type {import('jest').Config} */
module.exports = {
  rootDir: ".",
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/**/*.spec.ts", "<rootDir>/src/**/*.spec.ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      { tsconfig: "<rootDir>/tsconfig.json", diagnostics: { ignoreCodes: [151001] } }
    ]
  },
  moduleNameMapper: { "^@sidewalk/contracts$": "<rootDir>/../../packages/contracts/src/index.ts" },
  globalSetup: "<rootDir>/test/global-setup.js",
  setupFiles: ["<rootDir>/test/set-env.js"],
  testTimeout: 40000,
  clearMocks: true
};
