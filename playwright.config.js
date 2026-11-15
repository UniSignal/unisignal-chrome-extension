const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  use: { headless: true },
});
