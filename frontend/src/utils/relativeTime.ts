/**
 * dateStr 시각을 now 기준 상대 시간 문자열로 변환한다. ("3시간 5분 전", "방금 전" 등)
 * now를 인자로 받아서 상위에서 주기적으로 갱신되는 시계 상태(now)와 함께 쓰면
 * 화면이 자동으로 갱신되는 살아있는 "경과 시간" 표시를 만들 수 있다.
 *
 * 큰 단위와 그 다음 작은 단위를 함께 표시해서 (예: "3시간 5분 전", "2일 4시간 전")
 * 갱신 주기(30초~1분)마다 화면에 변화가 보이도록 한다.
 */
export function formatRelativeTime(dateStr: string | null | undefined, now: Date): string {
  if (!dateStr) return "";
  const target = new Date(dateStr).getTime();
  if (Number.isNaN(target)) return "";

  const diffMs = now.getTime() - target;
  if (diffMs < 0) return "방금 전";

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  // 1분 미만: "방금 전"
  if (diffMs < minute) return "방금 전";

  // 1시간 미만: "13분 전"
  if (diffMs < hour) {
    const minutes = Math.floor(diffMs / minute);
    return `${minutes}분 전`;
  }

  // 1일 미만: "3시간 5분 전" (분 단위까지 표시해서 갱신 효과가 보이도록)
  if (diffMs < day) {
    const hours = Math.floor(diffMs / hour);
    const minutes = Math.floor((diffMs % hour) / minute);
    return minutes > 0 ? `${hours}시간 ${minutes}분 전` : `${hours}시간 전`;
  }

  // 1주 미만: "2일 4시간 전"
  if (diffMs < week) {
    const days = Math.floor(diffMs / day);
    const hours = Math.floor((diffMs % day) / hour);
    return hours > 0 ? `${days}일 ${hours}시간 전` : `${days}일 전`;
  }

  // 1달 미만: "2주 3일 전"
  if (diffMs < month) {
    const weeks = Math.floor(diffMs / week);
    const days = Math.floor((diffMs % week) / day);
    return days > 0 ? `${weeks}주 ${days}일 전` : `${weeks}주 전`;
  }

  // 1년 미만: "3개월 12일 전"
  if (diffMs < year) {
    const months = Math.floor(diffMs / month);
    const days = Math.floor((diffMs % month) / day);
    return days > 0 ? `${months}개월 ${days}일 전` : `${months}개월 전`;
  }

  // 1년 이상: "2년 3개월 전"
  const years = Math.floor(diffMs / year);
  const months = Math.floor((diffMs % year) / month);
  return months > 0 ? `${years}년 ${months}개월 전` : `${years}년 전`;
}
