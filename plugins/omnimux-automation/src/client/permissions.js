const BUILT_IN_PERMISSION_LABELS = /* @__PURE__ */ new Map([
  ["read-only", ["permission.readOnly", "Read Only"]],
  ["workspace-write", ["permission.workspaceWrite", "Workspace Write"]],
  ["danger-full-access", ["permission.fullAccess", "Full access"]]
]);
function permissionLabel(option, t) {
  const builtIn = BUILT_IN_PERMISSION_LABELS.get(option.value);
  if (builtIn !== void 0 && (option.name === option.value || option.name === builtIn[1])) {
    return t(builtIn[0]);
  }
  return option.name || option.value;
}
export {
  permissionLabel
};
