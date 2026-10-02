/** CSS Modules values are `string | undefined` under `noUncheckedIndexedAccess`. */
export function cssClass(value: string | undefined, name: string): string {
  if (!value) throw new Error(`dsh-ui-kit: missing CSS module class "${name}"`);
  return value;
}
