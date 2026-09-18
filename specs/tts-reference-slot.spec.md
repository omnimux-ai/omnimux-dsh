# Spec: seed-audio-1.0 补充可选参考音频输入槽位（打通参考音频克隆）

- 需求背景：主力模型 `seed-audio-1.0` 在网关底层实测原生支持参考音频克隆（传 `references` 200 出片）；但契约层此前漏配了 `reference_audio` 输入槽，导致带参考音频提交时被 SubmitGuard 拦截。
- 风险级别：R2（模型契约输入槽补充）

## 1. 验收标准
1. **AC-1 契约槽位补充**：`seed-audio-1.0` 的 `text_to_speech` inputs 补充 `reference_audio`（type: audio, role: reference, min: 0, max: 1）。
2. **AC-2 无参考音兼容**：无参考音频时（min: 0）正常按纯文本内置音色提交，不受影响。
3. **AC-3 有参考音通过**：有参考音频输入时，通过 SubmitGuard 校验，规范构造请求并完成网关真实出片。
4. **AC-4 门禁全绿**：`pnpm verify:model-contracts` 严格模式通过。
