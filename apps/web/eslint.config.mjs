import react from "eslint-plugin-react";
import rootConfig from "../../eslint.config.mjs";

export default [
  ...rootConfig,
  {
    files: ["src/components/**/*.{ts,tsx}"],
    plugins: { react },
    settings: { react: { version: "detect" } },
    rules: {
      "react/button-has-type": "error",
    },
  },
];
