import { q, transacao } from './db'
import { validaTurno, DIAS, type Dia, type Turno } from './texto'

/** Cada disciplina do professor carrega o próprio dia e turno. */
export type ItemAtribuicao = {
  disciplinaId: number
  dia: Dia | null
  turno: Turno
}

export const MAX_DISCIPLINAS = 10

export type ResultadoAtribuicao = {
  vinculadas: number
  criadas: number
  liberadas: number
  ocupadas: { disciplina: string; professor: string }[]
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

    saida.push({ disciplinaId, dia, turno: validaTurno((item as any)?.turno) ?? 'NOTURNO' })
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
    `SELECT t.id, t.disciplina_id, t.professor_id, d.nome AS disciplina,
            COALESCE(u.nome, '') AS dono
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

  const ocupadas: ResultadoAtribuicao['ocupadas'] = []
  const paraVincular: ItemAtribuicao[] = []

  for (const item of itens) {
    const turma = porDisciplina.get(item.disciplinaId)
    if (turma && turma.professor_id && turma.professor_id !== professorId) {
      ocupadas.push({ disciplina: turma.disciplina, professor: turma.dono })
      continue
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
          `UPDATE turma SET professor_id = $1, dia_semana = $2, turno = $3, atualizado_em = now()
            WHERE id = $4`,
          [professorId, item.dia, item.turno, turma.id],
        )
      } else {
        await exec(
          `INSERT INTO turma (disciplina_id, professor_id, dia_semana, turno) VALUES ($1,$2,$3,$4)`,
          [item.disciplinaId, professorId, item.dia, item.turno],
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

  return { vinculadas: paraVincular.length, criadas, liberadas: paraLiberar.length, ocupadas }
}

/**
 * Disciplinas com o dono atual — para montar as listas de escolha nas telas.
 * Uma linha por disciplina, mesmo que ela tenha mais de uma turma.
 */
export async function disciplinasComDono() {
  return q<any>(
    `SELECT * FROM (
       SELECT DISTINCT ON (d.id)
              d.id, d.numero, d.nome,
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
    `SELECT t.professor_id, t.disciplina_id, t.dia_semana, t.turno, d.nome AS disciplina, d.numero
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
        dia: t.dia_semana,
        turno: t.turno,
      })
    }

    return { id: p.id, nome: p.nome, email: p.email, papel: p.papel, itens }
  })
}
