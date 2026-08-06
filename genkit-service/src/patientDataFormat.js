export function formatMedications(data) {
  if (data.length === 0) return "오늘 등록된 복약 일정이 없습니다.";

  const entries = data.map((item) => {
    const state = item.taken ? "복용 완료" : "복용 전";
    return `${item.scheduled_time} ${item.drug_name} ${item.dosage} (${state})`;
  });
  return `오늘 복약 일정은 다음과 같습니다. ${entries.join("; ")}`;
}

function resultTime(result) {
  return new Date(result.released_at || result.confirmed_at || 0).getTime();
}

export function formatCaseResult(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return "아직 공개된 검사 결과가 없습니다.";
  }

  const latest = [...data].sort((a, b) => resultTime(b) - resultTime(a))[0];
  let text = `최근 공개된 검사 결과는 ${latest.final_subtype}입니다.`;
  if (latest.final_note?.trim()) {
    text += ` 의료진 안내는 다음과 같습니다: ${latest.final_note.trim()}`;
  }
  return text;
}
