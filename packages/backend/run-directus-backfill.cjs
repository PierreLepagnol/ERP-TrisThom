const { spawnSync } = require("node:child_process");

const payload = JSON.stringify({
  directusItemIds: ["54", "58", "60", "61", "63", "64"]
});

const result = spawnSync(
  "bun",
  [
    "x",
    "convex",
    "run",
    "directusSync:backfillRequests",
    payload,
    "--deployment",
    "polished-cricket-455"
  ],
  { stdio: "inherit" }
);

process.exit(result.status ?? 1);
