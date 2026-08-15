import { q, transacao } from './db'
import type { Dia, Turno } from './texto'

export type ResultadoAtribuicao = {
  vinculadas: number
  criadas: number
  liberadas: number
  ocupadas: { disciplina: string; professor: string }[]
}

/**
 * Define quais disciplinas pertencem a um professor.
 *
 * A lista enviada vira o conjunto final: o que estava com ele e não veio na lista
 * é liberado (a turma continua existindo, só fica sem professor). Disciplina que já
 * é de outra pessoa não é tomada — volta na lista `ocupadas` para avisar na tela.
 *
 * `dia` e `turno` são aplicados às turmas da lista; passar `null` mantém o que já estava.
 */
export async function atribuirDisciplinas(
  professorId: string,
  disciplinaIds: number[],
  dia: Dia | null,
  turno: Turno | null,
): Promise<ResultadoAtribuicao> {
  const alvos = [...new Set(disciplinaIds.filter((n) => Number.isInteger(n) && n > 0))]

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
  const paraVincular: number[] = []

  for (const id of alvos) {
    const turma = porDisciplina.get(id)
    if (turma && turma.professor_id && turma.professor_id !== professorId) {
      ocupadas.push({ disciplina: turma.disciplina, professor: turma.dono })
      continue
    }
    paraVincular.push(id)
  }

  const doProfessor = existentes.filter((t) => t.professor_id === professorId)
  const paraLiberar = doProfessor.filter((t) => !alvos.includes(t.disciplina_id)).map((t) => t.id)

  let criadas = 0

  await transacao(async (exec) => {
    for (const id of paraVincular) {
      const turma = porDisciplina.get(id)
      if (turma) {
        await exec(
          `UPDATE turma SET professor_id = $1,
                            dia_semana = COALESCE($2, dia_semana),
                            turno = COALESCE($3, turno),
                            atualizado_em = now()
            WHERE id = $4`,
          [professorId, dia, turno, turma.id],
        )
      } else {
        await exec(
          `INSERT INTO turma (disciplina_id, professor_id, dia_semana, turno)
           VALUES ($1, $2, $3, COALESCE($4, 'NOTURNO'))`,
          [id, professorId, dia, turno],
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
 * Disciplinas com o dono atual — para montar a lista de escolha nas telas.
 * Uma linha por disciplina, mesmo que ela tenha mais de uma turma: nesse caso
 * vale a turma que tem professor (a mais antiga entre elas).
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
