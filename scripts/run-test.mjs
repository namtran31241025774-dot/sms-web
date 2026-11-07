import { spawnSync } from "node:child_process";

process.env.SMS_DB_PATH = ":memory:";
process.env.SMS_AI_MODE = "mock";

const isWatch = process.argv.includes("--watch");
const args = isWatch ? [] : ["run"];

const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(npxCmd, ["vitest", ...args], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 0);
