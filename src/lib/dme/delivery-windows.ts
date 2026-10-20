const windowPattern = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})-(\d{2}):(\d{2})$/;

function localDate(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function validateDeliveryWindows(windows: string[], timeZone: string, now = new Date()) {
  let today: string;
  try { today = localDate(now, timeZone); } catch { throw new Error("Enter a valid IANA time zone"); }
  if (windows.length === 0 || windows.length > 5 || new Set(windows).size !== windows.length) throw new Error("Provide one to five distinct delivery windows");
  for (const window of windows) {
    const match = windowPattern.exec(window);
    if (!match) throw new Error("Use YYYY-MM-DD HH:mm-HH:mm for each delivery window");
    const [, date, startHour, startMinute, endHour, endMinute] = match;
    const parsedDate = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date || date < today
      || Number(startHour) > 23 || Number(endHour) > 23 || Number(startMinute) > 59 || Number(endMinute) > 59
      || `${startHour}:${startMinute}` >= `${endHour}:${endMinute}`) throw new Error("Delivery windows must have a valid future date and end after they start");
  }
  return windows;
}

export function suggestedDeliveryWindows(timeZone = "America/Chicago", now = new Date()) {
  const today = localDate(now, timeZone);
  const day = new Date(`${today}T12:00:00Z`);
  const dates: string[] = [];
  while (dates.length < 3) {
    day.setUTCDate(day.getUTCDate() + 1);
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
    dates.push(day.toISOString().slice(0, 10));
  }
  return [`${dates[0]} 09:00-12:00`, `${dates[1]} 13:00-16:00`, `${dates[2]} 10:00-13:00`];
}
