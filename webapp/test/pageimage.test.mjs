import { test } from "node:test";
import assert from "node:assert/strict";
import { regionPath } from "../js/pageimage.js";
import { pathD } from "../js/render.js";

const illustration = () => ({ id: "r9", type: "illustration", box: [100, 200, 300, 600],
  polygons: [[[120, 450], [180, 450], [180, 500], [120, 500]]], lines: [] });

test("figure overlays show the full image crop even when saved ink outlines cover only part of it", () => {
  const region = illustration(), original = structuredClone(region);
  assert.equal(regionPath(region, "figure"), "M100,200 H300 V600 H100 Z");
  assert.deepEqual(region, original);
  const record = { ...region, model_box: [90, 190, 310, 610] };
  delete record.box;
  assert.equal(regionPath(record, "figure"), "M90,190 H310 V610 H90 Z");
});

test("text overlays retain ink outlines and figures without a crop box use the reader's polygon bounds", () => {
  const region = illustration();
  assert.equal(regionPath(region, "paragraph"), pathD(region.polygons));
  delete region.box;
  assert.equal(regionPath(region, "figure"), "M120,450 H180 V500 H120 Z");
});
