import assert from "node:assert/strict";
import test from "node:test";
import { formatCaseResult, formatMedications } from "../src/patientDataFormat.js";

test("검사결과의 final_subtype과 final_note를 표시한다", () => {
  const text = formatCaseResult([
    { final_subtype: "LUSC", final_note: "이전 결과", released_at: "2026-01-01T00:00:00Z" },
    { final_subtype: "LUAD", final_note: "추적 진료가 필요합니다.", released_at: "2026-02-01T00:00:00Z" },
  ]);
  assert.equal(text, "최근 공개된 검사 결과는 LUAD입니다. 의료진 안내는 다음과 같습니다: 추적 진료가 필요합니다.");
});

test("검사결과가 없으면 공개 결과가 없다고 안내한다", () => {
  assert.equal(formatCaseResult([]), "아직 공개된 검사 결과가 없습니다.");
});

test("final_note가 비어 있으면 안내 문장을 추가하지 않는다", () => {
  assert.equal(
    formatCaseResult([{ final_subtype: "LUAD", final_note: "", confirmed_at: "2026-02-01" }]),
    "최근 공개된 검사 결과는 LUAD입니다."
  );
});

test("복약 serializer의 확인된 필드를 표시한다", () => {
  const text = formatMedications([
    { drug_name: "약A", dosage: "1정", scheduled_time: "2026-02-01T09:00:00Z", taken: false },
  ]);
  assert.match(text, /약A/);
  assert.match(text, /1정/);
  assert.match(text, /09:00:00/);
  assert.match(text, /복용 전/);
});
