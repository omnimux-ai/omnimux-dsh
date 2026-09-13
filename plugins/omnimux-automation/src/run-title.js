const RUN_STAMP_OPTIONS = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
};
const zonedRunStampFormatters = /* @__PURE__ */ new Map();
function runStampFormatter(timeZone) {
  const cached = zonedRunStampFormatters.get(timeZone);
  if (cached !== void 0) return cached;
  const formatter = new Intl.DateTimeFormat("en-CA", { ...RUN_STAMP_OPTIONS, timeZone });
  zonedRunStampFormatters.set(timeZone, formatter);
  return formatter;
}
function formatRunStamp(iso, timeZone) {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  if (timeZone === void 0) {
    const date = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    const time = `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
    return `${date} ${time}`;
  }
  try {
    const parts = runStampFormatter(timeZone).formatToParts(value);
    const part = (type) => parts.find((item) => item.type === type)?.value;
    const [year, month, day, hour, minute] = ["year", "month", "day", "hour", "minute"].map((type) => part(type));
    if ([year, month, day, hour, minute].some((item) => item === void 0)) return iso;
    return `${year}-${month}-${day} ${hour}:${minute}`;
  } catch {
    return iso;
  }
}
function automationSessionTitle(taskName, iso, timeZone) {
  return `${formatRunStamp(iso, timeZone)} - ${taskName}`;
}
export {
  automationSessionTitle,
  formatRunStamp
};
