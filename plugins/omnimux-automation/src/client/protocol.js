function unwrapRpcResult(value) {
  if (typeof value !== "object" || value === null || !("ok" in value)) {
    throw new Error("自动化主机返回了无效响应。");
  }
  const result = value;
  if (result.ok === true && "value" in result) return result.value;
  if (result.ok === false && "error" in result) {
    const error = result.error;
    throw new Error(error?.message ?? "自动化请求失败。");
  }
  throw new Error("自动化主机返回了无效响应。");
}
export {
  unwrapRpcResult
};
