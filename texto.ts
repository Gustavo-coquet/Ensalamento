/** Remove acentos, colapsa espaços e põe em MAIÚSCULAS — usado para ordenar alfabeticamente. */
export function chaveNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

/** Deixa o nome em Caixa Alta como na planilha original. */
export function normalizaNome(nome: string): string {
  return nome.replace(/\s+/g, ' ').trim()
}

export const DIAS = ['SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA'] as const
export type Dia = (typeof DIAS)[number]

export const CURSOS = ['CICLO_BASICO', 'ENG_PRODUCAO', 'ENG_CIVIL'] as const
export type CursoNome = (typeof CURSOS)[number]

export const TURNOS = ['DIURNO', 'NOTURNO'] as const
export type Turno = (typeof TURNOS)[number]

export const ROTULO_DIA: Record<string, string> = {
  SEGUNDA: 'Segunda-feira',
  TERCA: 'Terça-feira',
  QUARTA: 'Quarta-feira',
  QUINTA: 'Quinta-feira',
  SEXTA: 'Sexta-feira',
}

export const ROTULO_CURSO: Record<string, string> = {
  CICLO_BASICO: 'Eng. Ciclo Básico',
  ENG_PRODUCAO: 'Eng. de Produção',
  ENG_CIVIL: 'Eng. Civil',
}

export const ROTULO_TURNO: Record<string, string> = {
  DIURNO: 'Diurno',
  NOTURNO: 'Noturno',
}

/**
 * Aceita o que vier (inclusive os textos livres antigos: MATUTINO, TARDE, MANHÃ…)
 * e devolve sempre DIURNO ou NOTURNO. Na dúvida, NOTURNO — que era o padrão.
 */
export function normalizaTurno(entrada: unknown): Turno {
  const bruto = chaveNome(String(entrada ?? ''))
  if (bruto === 'NOTURNO' || bruto === 'NOITE') return 'NOTURNO'
  if (bruto) return 'DIURNO'
  return 'NOTURNO'
}

/** Só aceita exatamente DIURNO ou NOTURNO — usado para validar o que vem da tela. */
export function validaTurno(entrada: unknown): Turno | null {
  const valor = String(entrada ?? '').trim().toUpperCase()
  return (TURNOS as readonly string[]).includes(valor) ? (valor as Turno) : null
}

export const ALTERNATIVAS = ['A', 'B', 'C', 'D', 'E'] as const
export const QTD_QUESTOES = 10

/** Garante um array de 10 posições contendo "" ou uma alternativa válida. */
export function normalizaGabarito(entrada: unknown): string[] {
  const bruto = Array.isArray(entrada) ? entrada : []
  const saida: string[] = []
  for (let i = 0; i < QTD_QUESTOES; i++) {
    const v = String(bruto[i] ?? '').trim().toUpperCase()
    saida.push((ALTERNATIVAS as readonly string[]).includes(v) ? v : '')
  }
  return saida
}
