import { test } from "node:test";
import assert from "node:assert/strict";
import { blockContext, pageBlocks } from "../js/blocks.js";
import { workflowAddress, workflowRoute } from "../js/workflow.js";

test("the blocks address opens directly regardless of the current workflow stage", () => {
  const page = workflowAddress("blocks", "page 1", { region: "r1" });
  assert.equal(page, "#blocks&p=page%201&r=r1");
  assert.deepEqual(workflowRoute(page), { stage: "page", mode: "page", pid: "page 1",
    view: "", region: "r1", unit: null });
  assert.equal(workflowRoute("#blocks").mode, "read");
});
