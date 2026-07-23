/** 이번 주 월~일 (YYYY-MM-DD) */
export function currentWeekRange(now = new Date()): {
  monday: string;
  sunday: string;
} {
  const d = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
  );
  const offsetToMonday = (d.getUTCDay() + 6) % 7; // 월=0 ... 일=6
  d.setUTCDate(d.getUTCDate() - offsetToMonday);
  const monday = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  const sunday = d.toISOString().slice(0, 10);
  return { monday, sunday };
}
