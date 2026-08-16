import { q, transacao } from './db'
import { invalidarEnsalamento } from './ensalamento'
import { validaTurno, CURSOS, DIAS, type CursoNome, type Dia, type Turno } from './texto'

/** Cada disciplina do professor carrega o próprio curso, dia, turno e mistura. */
export type ItemAtribuicao = {
  disciplinaId: number
  curso: CursoNome
  dia: Dia | null
  turno: Turno
  ensalar: boolean
}

export const MAX_DISCIPLINAS = 10

export type ResultadoAtribuicao = {
  vinculadas: number
  criadas: number
  liberadas: number
  /** disciplina que já é de outro professor */
  ocupadas: { disciplina: string; professor: string }[]
  /** disciplina que não está sendo ofertada neste semestre */
  naoOfertadas: string[]
  /** duas disciplinas dele no mesmo dia e turno */
  conflitos: string[]
}

/** Aceita o que vem do navegador e devolve só o que é válido. */
export function lerItens(entrada: unknown): ItemAtribuicao[] {
  const bruto = Array.isArray(entrada) ? entrada : []
  const vistos = new Set<number>()
  const saida: ItemAtribuicao[] = []

  for (const item of bruto) {
    const disciplinaId = Number((item as any)?.disciplinaId)
    if (!Number.isInteger(disciplinaId) || disciplinaId <= 0 || vistos.has(disciplinaId)) continue
    vistos.add(disciplinaId)

    const diaBruto = String((item as any)?.dia ?? '').toUpperCase()
    const dia = (DIAS as readonly string[]).includes(diaBruto) ? (diaBruto as Dia) : null

    const cursoBruto = String((item as any)?.curso ?? '').toUpperCase()
    const curso = (CURSOS as readonly string[]).includes(cursoBruto)
      ? (cursoBruto as CursoNome)
      : 'CICLO_BASICO'

    saida.push({
      disciplinaId,
      curso,
      dia,
      turno: validaTurno((item as any)?.turno) ?? 'NOTURNO',
      ensalar: (item as any)?.ensalar !== false,
    })
  }

  return saida.slice(0, MAX_DISCIPLINAS)
}

/**
 * Define quais disciplinas pertencem a um professor, cada uma com seu dia e turno.
 *
 * A lista enviada vira o conjunto final: o que estava com ele e não veio na lista
 * é liberado (a turma continua existindo, só fica sem professor). Disciplina que já
 * é de outra pessoa não é tomada — volta em `ocupadas` para avisar na tela.
 */
export async function atribuirDisciplinas(
  professorId: string,
  itens: ItemAtribuicao[],
): Promise<ResultadoAtribuicao> {
  const existentes = await q<any>(
    `SELECT t.id, t.disciplina_id, t.professor_id, t.dia_semana, t.turno,
            d.nome AS disciplina, COALESCE(u.nome, '') AS dono
       FROM turma t
       JOIN disciplina d  ON d.id = t.disciplina_id
       LEFT JOIN usuario u ON u.id = t.professor_id`,
  )

  // uma disciplina pode ter mais de uma turma: vale a dele, senão a que tem dono
  const porDisciplina = new Map<number, any>()
  for (const t of existentes) {
    const atual = porDisciplina.get(t.disciplina_id)
    const melhor =
      !atual ||
      t.professor_id === professorId ||
      (!atual.professor_id && t.professor_id && atual.professor_id !== professorId)
    if (melhor) porDisciplina.set(t.disciplina_id, t)
  }

  const catalogo = new Map<number, any>(
    (await q<any>('SELECT id, nome, ativa FROM disciplina')).map((d) => [d.id, d]),
  )

  const jaDele = new Set(
    existentes.filter((t) => t.professor_id === professorId).map((t) => t.disciplina_id),
  )

  const ocupadas: ResultadoAtribuicao['ocupadas'] = []
  const naoOfertadas: string[] = []
  const conflitos: string[] = []
  const paraVincular: ItemAtribuicao[] = []
  const agenda = new Map<string, string>() // "DIA|TURNO" -> nome da disciplina

  for (const item of itens) {
    const disciplina = catalogo.get(item.disciplinaId)
    if (!disciplina) continue

    // disciplina fora da oferta do semestre só continua se já era dele
    if (!disciplina.ativa && !jaDele.has(item.disciplinaId)) {
      naoOfertadas.push(disciplina.nome)
      continue
    }

    const turma = porDisciplina.get(item.disciplinaId)
    if (turma && turma.professor_id && turma.professor_id !== professorId) {
      ocupadas.push({ disciplina: turma.disciplina, professor: turma.dono })
      continue
    }

    // ninguém dá duas aulas no mesmo dia e turno
    if (item.dia) {
      const chave = `${item.dia}|${item.turno}`
      const jaOcupado = agenda.get(chave)
      if (jaOcupado) {
        conflitos.push(`${disciplina.nome} choca com ${jaOcupado}`)
        continue
      }
      agenda.set(chave, disciplina.nome)
    }

    paraVincular.push(item)
  }

  const escolhidas = new Set(paraVincular.map((i) => i.disciplinaId))
  const paraLiberar = existentes
    .filter((t) => t.professor_id === professorId && !escolhidas.has(t.disciplina_id))
    .map((t) => t.id)

  let criadas = 0

  await transacao(async (exec) => {
    for (const item of paraVincular) {
      const turma = porDisciplina.get(item.disciplinaId)
      if (turma) {
        await exec(
          `UPDATE turma SET professor_id = $1, curso = $2, dia_semana = $3, turno = $4,
                            ensalar = $5, atualizado_em = now()
            WHERE id = $6`,
          [professorId, item.curso, item.dia, item.turno, item.ensalar, turma.id],
        )
      } else {
        await exec(
          `INSERT INTO turma (disciplina_id, professor_id, curso, dia_semana, turno, ensalar)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [item.disciplinaId, professorId, item.curso, item.dia, item.turno, item.ensalar],
        )
        criadas++
      }
    }

    if (paraLiberar.length) {
      await exec(
        'UPDATE turma SET professor_id = NULL, atualizado_em = now() WHERE id = ANY($1::uuid[])',
        [paraLiberar],
      )
    }
  })

  // tudo o que foi mexido derruba as salas já geradas daquele dia+turno
  const afetados = [
    ...existentes
      .filter((t) => t.professor_id === professorId)
      .map((t) => ({ dia: t.dia_semana as string | null, turno: t.turno as string })),
    ...paraVincular.map((i) => ({ dia: i.dia as string | null, turno: i.turno as string })),
    ...paraLiberar
      .map((id) => existentes.find((t) => t.id === id))
      .filter(Boolean)
      .map((t: any) => ({ dia: t.dia_semana as string | null, turno: t.turno as string })),
  ]
  await invalidarEnsalamento(afetados)

  return {
    vinculadas: paraVincular.length,
    criadas,
    liberadas: paraLiberar.length,
    ocupadas,
    naoOfertadas,
    conflitos,
  }
}

/**
 * Disciplinas com o dono atual — para montar as listas de escolha nas telas.
 * Uma linha por disciplina, mesmo que ela tenha mais de uma turma.
 */
export async function disciplinasComDono() {
  return q<any>(
    `SELECT * FROM (
       SELECT DISTINCT ON (d.id)
              d.id, d.numero, d.nome, d.ativa,
              t.professor_id       AS "professorId",
              COALESCE(u.nome, '') AS "professorNome"
         FROM disciplina d
         LEFT JOIN turma t   ON t.disciplina_id = d.id
         LEFT JOIN usuario u ON u.id = t.professor_id
        ORDER BY d.id, (t.professor_id IS NULL) ASC, t.criado_em ASC
     ) x
     ORDER BY numero ASC`,
  )
}

/** O que cada professor leciona hoje, já no formato das telas. */
export async function atribuicaoAtual() {
  const professores = await q<any>(
    `SELECT id, nome, email, papel FROM usuario
      WHERE papel IN ('PROFESSOR','ADMIN')
      ORDER BY papel DESC, nome ASC`,
  )

  const turmas = await q<any>(
    `SELECT t.professor_id, t.disciplina_id, t.curso, t.dia_semana, t.turno, t.ensalar,
            d.nome AS disciplina, d.numero
       FROM turma t
       JOIN disciplina d ON d.id = t.disciplina_id
      WHERE t.professor_id IS NOT NULL
      ORDER BY d.numero ASC`,
  )

  return professores.map((p) => {
    // se a mesma disciplina tiver duas turmas, mostra uma linha só
    const vistas = new Set<number>()
    const itens = []

    for (const t of turmas) {
      if (t.professor_id !== p.id || vistas.has(t.disciplina_id)) continue
      vistas.add(t.disciplina_id)
      itens.push({
        disciplinaId: t.disciplina_id,
        disciplina: t.disciplina,
        numero: t.numero,
        curso: t.curso,
        dia: t.dia_semana,
        turno: t.turno,
        ensalar: t.ensalar,
      })
    }

    return { id: p.id, nome: p.nome, email: p.email, papel: p.papel, itens }
  })
}
