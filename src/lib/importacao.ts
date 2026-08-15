import { chaveNome, normalizaNome, normalizaTurno, DIAS, type Dia, type Turno } from './texto'

/**
 * Lê a lista colada pelo administrador no cadastro em lote.
 * Colunas separadas por TAB, ";" ou "|". Dois formatos, reconhecidos linha a linha
 * pela posição do e-mail:
 *
 *   1) só o professor      → PROFESSOR ; E-MAIL ; SENHA
 *      (ele entra depois e escolhe as próprias disciplinas, dia e turno)
 *
 *   2) já com a disciplina → DISCIPLINA ; PROFESSOR ; E-MAIL ; SENHA ; DIA ; TURNO
 *      (as três primeiras obrigatórias; dia e turno podem ficar em branco)
 *
 * Sem senha, entra a senha padrão da tela.
 */

export type LinhaLida = {
  linha: number
  /** vazio quando a linha cadastra só o professor */
  disciplina: string
  professor: string
  email: string
  senha: string
  dia: Dia | null
  turno: Turno
  erro?: string
}

const PARECE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Aceita "terça", "TERCA", "terça-feira", "ter" — devolve null se não reconhecer. */
export function normalizaDia(entrada: unknown): Dia | null {
  const bruto = chaveNome(String(entrada ?? '')).replace(/[^A-Z]/g, '')
  if (!bruto) return null
  const inicio = bruto.slice(0, 3)
  return DIAS.find((d) => d.startsWith(inicio)) ?? null
}

function separaColunas(linha: string): string[] {
  const sep = linha.includes('\t') ? '\t' : linha.includes(';') ? ';' : linha.includes('|') ? '|' : null
  if (!sep) return [linha.trim()]
  return linha.split(sep).map((c) => c.trim())
}

const CABECALHOS = ['DISCIPLINA', 'MATERIA', 'PROFESSOR', 'EMAIL', 'E-MAIL']

export function lerLinhas(texto: string, senhaPadrao: string): LinhaLida[] {
  const saida: LinhaLida[] = []

  texto.split(/\r?\n/).forEach((bruto, indice) => {
    const linha = indice + 1
    if (!bruto.trim()) return

    const col = separaColunas(bruto)

    // ignora a linha de cabeçalho, se a pessoa colar junto
    if (CABECALHOS.includes(chaveNome(col[0] ?? ''))) return

    // e-mail na 2ª coluna = linha de professor avulso; na 3ª = linha com disciplina
    const soProfessor = PARECE_EMAIL.test((col[1] ?? '').trim())

    const [disciplina, professor, email, senha, dia, turno] = soProfessor
      ? ['', col[0] ?? '', col[1] ?? '', col[2] ?? '', '', '']
      : [col[0] ?? '', col[1] ?? '', col[2] ?? '', col[3] ?? '', col[4] ?? '', col[5] ?? '']

    const registro: LinhaLida = {
      linha,
      disciplina: normalizaNome(disciplina),
      professor: normalizaNome(professor),
      email: email.trim().toLowerCase(),
      senha: senha.trim() || senhaPadrao,
      dia: dia.trim() ? normalizaDia(dia) : null,
      turno: turno.trim() ? normalizaTurno(turno) : 'NOTURNO',
    }

    if (!registro.professor) registro.erro = 'Falta o nome do professor'
    else if (!registro.email) registro.erro = 'Falta o e-mail'
    else if (!PARECE_EMAIL.test(registro.email)) registro.erro = 'E-mail inválido'
    else if (registro.senha.length < 6) registro.erro = 'Senha inicial precisa de 6 caracteres'
    else if (dia.trim() && !registro.dia) registro.erro = `Dia não reconhecido: "${dia.trim()}"`

    saida.push(registro)
  })

  return saida
}

export type Disciplina = { id: number; numero: number; nome: string }

/**
 * Acha a disciplina pelo número ("12") ou pelo nome, ignorando acentos e caixa.
 * Devolve `ambigua` quando o texto casa com mais de uma — melhor avisar que chutar.
 */
export function acharDisciplina(
  busca: string,
  disciplinas: Disciplina[],
): { achou?: Disciplina; ambigua?: Disciplina[] } {
  const alvo = chaveNome(busca)
  if (!alvo) return {}

  if (/^\d+$/.test(alvo)) {
    const porNumero = disciplinas.find((d) => d.numero === Number(alvo))
    if (porNumero) return { achou: porNumero }
  }

  const exata = disciplinas.filter((d) => chaveNome(d.nome) === alvo)
  if (exata.length === 1) return { achou: exata[0] }

  const comeca = disciplinas.filter((d) => chaveNome(d.nome).startsWith(alvo))
  if (comeca.length === 1) return { achou: comeca[0] }
  if (comeca.length > 1) return { ambigua: comeca }

  const contem = disciplinas.filter((d) => chaveNome(d.nome).includes(alvo))
  if (contem.length === 1) return { achou: contem[0] }
  if (contem.length > 1) return { ambigua: contem }

  return {}
}
