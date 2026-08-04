import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldRefreshMainAfterOtLoad,
  shouldStopLoadingAfterOtLoad,
} from "../shared/ot-load.js";

test("initial load waits for headcount before refreshing main view", () => {
  assert.equal(
    shouldRefreshMainAfterOtLoad({ needOt: true, needHeadcount: true }),
    false,
  );
});

test("initial load keeps loading banner until headcount arrives", () => {
  assert.equal(
    shouldStopLoadingAfterOtLoad({ needOt: true, needHeadcount: true }),
    false,
  );
});

test("ot-only refresh still updates main view immediately", () => {
  assert.equal(
    shouldRefreshMainAfterOtLoad({ needOt: true, needHeadcount: false }),
    true,
  );
  assert.equal(
    shouldStopLoadingAfterOtLoad({ needOt: true, needHeadcount: false }),
    true,
  );
});
