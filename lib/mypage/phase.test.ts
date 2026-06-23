import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePhase } from "./phase";

// 実行方法（テストランナー未導入のため任意）:
//   node --test --experimental-strip-types lib/mypage/phase.test.ts
// もしくはランナー導入後にそのまま拾える形にしてある。

// ---- 基本: 直列に進んだケース ----
test("受付 / 未作成 → 受注受付(0)", () => {
  assert.equal(
    resolvePhase({ work_status: "受付", estimate_status: "未作成" }).index,
    0,
  );
});

test("受付 / 発行済 → お見積り(1)", () => {
  assert.equal(
    resolvePhase({ work_status: "受付", estimate_status: "発行済" }).index,
    1,
  );
});

test("受付 / 了承済 → ご了承・作業開始(2)", () => {
  const r = resolvePhase({ work_status: "受付", estimate_status: "了承済" });
  assert.equal(r.index, 2);
  assert.equal(r.phase, "ご了承・作業開始");
});

test("作業中 / 了承済 → 作業中(3)", () => {
  assert.equal(
    resolvePhase({ work_status: "作業中", estimate_status: "了承済" }).index,
    3,
  );
});

test("完了 / 了承済 → 作業完了(4)", () => {
  const r = resolvePhase({ work_status: "完了", estimate_status: "了承済" });
  assert.equal(r.index, 4);
  assert.equal(r.phase, "作業完了");
});

// ---- 飛びケース（3系統が独立で前段を飛ばす）----
test("飛び: 完了 / 発行済（了承を飛ばして完了）→ 作業完了(4)", () => {
  assert.equal(
    resolvePhase({ work_status: "完了", estimate_status: "発行済" }).index,
    4,
  );
});

test("飛び: 完了 / 未作成（見積なしで完了）→ 作業完了(4)", () => {
  assert.equal(
    resolvePhase({ work_status: "完了", estimate_status: "未作成" }).index,
    4,
  );
});

test("飛び: 作業中 / 未作成（見積なしで作業中）→ 作業中(3)", () => {
  assert.equal(
    resolvePhase({ work_status: "作業中", estimate_status: "未作成" }).index,
    3,
  );
});

test("飛び: 作業中 / 発行済（了承前に作業中）→ 作業中(3)", () => {
  assert.equal(
    resolvePhase({ work_status: "作業中", estimate_status: "発行済" }).index,
    3,
  );
});

// work_status が最優先（estimate より作業の到達点が高ければそちらを採る）
test("優先: 完了 は estimate に関わらず最大(4)", () => {
  for (const estimate_status of ["未作成", "発行済", "了承済"] as const) {
    assert.equal(
      resolvePhase({ work_status: "完了", estimate_status }).index,
      4,
    );
  }
});
