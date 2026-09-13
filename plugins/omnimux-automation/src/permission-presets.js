function normalizePermissionPreset(input, names) {
  if (typeof input !== "string") return void 0;
  const raw = input.trim();
  if (raw === "") return void 0;
  const value = raw === "full-access" ? "danger-full-access" : raw;
  return names.includes(value) ? value : void 0;
}
export {
  normalizePermissionPreset
};
