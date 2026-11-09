export function newId(prefix: string): string {
  let hex = '';
  for (let i = 0; i < 8; i++) hex += Math.floor(Math.random() * 16).toString(16);
  return `${prefix}_${hex}`;
}
