/** CSV com ; e BOM — abre certinho no Excel em português. */
export function paraCSV(cabecalho: string[], linhas: (string | number)[][]): string {
  const escapa = (v: string | number) => {
    const s = String(v ?? '')
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const corpo = [cabecalho, ...linhas].map((l) => l.map(escapa).join(';')).join('\r\n')
  return '\ufeff' + corpo
}
