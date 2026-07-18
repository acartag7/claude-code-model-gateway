import test from "node:test";
import assert from "node:assert/strict";
import { parseLaunchArguments } from "../scripts/launch.mjs";

test("launch accepts pnpm's forwarded separator", () => {
  assert.deepEqual(
    parseLaunchArguments(["--", "safe", "gpt-5.6-terra", "--print"]),
    {
      mode: "safe",
      modelId: "gpt-5.6-terra",
      claudeArgs: ["--print"],
    },
  );
});
