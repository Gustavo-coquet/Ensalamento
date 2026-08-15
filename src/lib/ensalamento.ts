import { q, transacao } from './db'
import type { Dia } from './texto'

export type AlunoEnsalado = {
  alunoId: string
  matricula: string
  nome: string
  nomeChave: string
  disciplina: string
  curso: string
  professor: string
}

/**
 * Distribui `total` alunos no menor número de salas que respeita `capacidade`,
 * deixando-as o mais equilibradas possível.
 *
 * Ex.: 200 alunos com capacidade 15 → 14 salas: 4 com 15 e 10 com 14.
 */
export function calcularTamanhos(total: number, capacidade: number): number[] {
  if (total <= 0) return []
  const salas = Math.ceil(total / capacidade)
  const base = Math.floor(total / salas)
  const extras = total % salas
  return Array.from({ length: salas }, (_, i) => base + (i < extras ? 1 : 0))
}

/** Alunos elegíveis do dia (turmas com ensalar = true), já em ordem alfabética. */
export async function alunosDoDia(dia: Dia): Promise<AlunoEnsalado[]> {
  return (
    await q<any>(
      `SELECT a.id            AS "alunoId",
              a.matricula,
              a.nome,
              a.nome_chave    AS "nomeChave",
              d.nome          AS disciplina,
              t.curso,
              COALESCE(u.nome, '') AS professor
         FROM aluno a
         JOIN turma t      ON t.id = a.turma_id
         JOIN disciplina d ON d.id = t.disciplina_id
         LEFT JOIN usuario u ON u.id = t.professor_id
        WHERE t.dia_semana = $1 AND t.ensalar = TRUE
        ORDER BY a.nome_chave ASC, a.matricula ASC`,
      [dia],
    )
  ) as AlunoEnsalado[]
}

/**
 * Gera e grava o ensalamento do dia, substituindo a rodada anterior.
 * Sempre existe no máximo um ensalamento vigente por dia da semana.
 */
export async function gerarEnsalamento(dia: Dia, capacidade = 15) {
  const alunos = await alunosDoDia(dia)
  // sem ninguém para ensalar, não cria uma rodada vazia nem descarta a anterior
  if (!alunos.length) return null

  const tamanhos = calcularTamanhos(alunos.length, capacidade)

  await transacao(async (exec) => {
    await exec('DELETE FROM ensalamento WHERE dia_semana = $1', [dia])

    const [{ id: ensalamentoId }] = await exec<{ id: string }>(
      `INSERT INTO ensalamento (dia_semana, capacidade, total_alunos, total_salas)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [dia, capacidade, alunos.length, tamanhos.length],
    )

    let indice = 0
    for (let s = 0; s < tamanhos.length; s++) {
      const fatia = alunos.slice(indice, indice + tamanhos[s])
      indice += tamanhos[s]

      const [{ id: salaId }] = await exec<{ id: string }>(
        `INSERT INTO sala (ensalamento_id, numero, rotulo) VALUES ($1, $2, $3) RETURNING id`,
        [ensalamentoId, s + 1, `SALA ${s + 1}`],
      )

      if (fatia.length) {
        await exec(
          `INSERT INTO sala_aluno (sala_id, aluno_id, posicao)
           SELECT $1, valor.aluno_id, valor.posicao
             FROM UNNEST($2::uuid[], $3::int[]) AS valor(aluno_id, posicao)`,
          [salaId, fatia.map((a) => a.alunoId), fatia.map((_, i) => i + 1)],
        )
      }
    }
  })

  return carregarEnsalamento(dia)
}

export type SalaMontada = {
  numero: number
  rotulo: string
  alunos: AlunoEnsalado[]
  porDisciplina: AlunoEnsalado[]
  resumo: { disciplina: string; quantidade: number }[]
}

/** Lê o ensalamento vigente do dia e monta as duas visões + o resumo por disciplina. */
export async function carregarEnsalamento(dia: Dia) {
  const cabecalho = (
    await q<any>(
      `SELECT id, dia_semana, capacidade, total_alunos, total_salas, criado_em
         FROM ensalamento WHERE dia_semana = $1 ORDER BY criado_em DESC LIMIT 1`,
      [dia],
    )
  )[0]

  if (!cabecalho) return null

  const linhas = await q<any>(
    `SELECT s.numero        AS "salaNumero",
            s.rotulo        AS "salaRotulo",
            sa.posicao,
            a.id            AS "alunoId",
            a.matricula,
            a.nome,
            a.nome_chave    AS "nomeChave",
            d.nome          AS disciplina,
            t.curso,
            COALESCE(u.nome, '') AS professor
       FROM sala s
       LEFT JOIN sala_aluno sa ON sa.sala_id = s.id
       LEFT JOIN aluno a       ON a.id = sa.aluno_id
       LEFT JOIN turma t       ON t.id = a.turma_id
       LEFT JOIN disciplina d  ON d.id = t.disciplina_id
       LEFT JOIN usuario u     ON u.id = t.professor_id
      WHERE s.ensalamento_id = $1
      ORDER BY s.numero ASC, sa.posicao ASC`,
    [cabecalho.id],
  )

  const mapa = new Map<number, SalaMontada>()
  for (const l of linhas) {
    if (!mapa.has(l.salaNumero)) {
      mapa.set(l.salaNumero, {
        numero: l.salaNumero,
        rotulo: l.salaRotulo,
        alunos: [],
        porDisciplina: [],
        resumo: [],
      })
    }
    if (!l.alunoId) continue
    mapa.get(l.salaNumero)!.alunos.push({
      alunoId: l.alunoId,
      matricula: l.matricula,
      nome: l.nome,
      nomeChave: l.nomeChave,
      disciplina: l.disciplina,
      curso: l.curso,
      professor: l.professor,
    })
  }

  const salas = [...mapa.values()].sort((a, b) => a.numero - b.numero)

  for (const sala of salas) {
    sala.porDisciplina = [...sala.alunos].sort(
      (a, b) =>
        a.disciplina.localeCompare(b.disciplina, 'pt-BR') ||
        a.nomeChave.localeCompare(b.nomeChave, 'pt-BR'),
    )

    const contagem = new Map<string, number>()
    for (const a of sala.alunos) contagem.set(a.disciplina, (contagem.get(a.disciplina) ?? 0) + 1)
    sala.resumo = [...contagem.entries()]
      .map(([disciplina, quantidade]) => ({ disciplina, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade || a.disciplina.localeCompare(b.disciplina, 'pt-BR'))
  }

  return {
    id: cabecalho.id,
    diaSemana: cabecalho.dia_semana as Dia,
    capacidade: cabecalho.capacidade,
    totalAlunos: cabecalho.total_alunos,
    totalSalas: cabecalho.total_salas,
    criadoEm: cabecalho.criado_em,
    salas,
  }
}
