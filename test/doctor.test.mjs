import assert from "node:assert/strict";
import test from "node:test";
import { readBoundedResponse } from "../scripts/doctor.mjs";

test("doctor rejects an oversized catalog before buffering the whole response", async () => {
  const response = new Response("x", { headers: { "content-length": String(2 * 1024 * 1024) } });
  await assert.rejects(readBoundedResponse(response), /exceeded 1 MiB/);
});

test("doctor reads a bounded catalog response", async () => {
  const response = new Response('{"data":[]}');
  assert.equal(await readBoundedResponse(response), '{"data":[]}');
});
