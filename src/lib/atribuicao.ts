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
  // Chave por disciplina+dia+turno (não só disciplina): o mesmo professor pode ter a
  // mesma disciplina em duas vagas diferentes (ex.: manhã e noite), então dedup só por
  // disciplinaId descartava a segunda vaga silenciosamente.
  const vistos = new Set<string>()
  const saida: ItemAtribuicao[] = []

  for (const item of bruto) {
    const disciplinaId = Number((item as any)?.disciplinaId)
    if (!Number.isInteger(disciplinaId) || disciplinaId <= 0) continue

    const diaBruto = String((item as any)?.dia ?? '').toUpperCase()
    const dia = (DIAS as readonly string[]).includes(diaBruto) ? (diaBruto as Dia) : null

    const turno = validaTurno((item as any)?.turno) ?? 'NOTURNO'

    const chave = `${disciplinaId}|${dia ?? ''}|${turno}`
    if (vistos.has(chave)) continue
    vistos.add(chave)

    const cursoBruto = String((item as any)?.curso ?? '').toUpperCase()
    const curso = (CURSOS as readonly string[]).includes(cursoBruto)
      ? (cursoBruto as CursoNome)
      : 'CICLO_BASICO'

    saida.push({
      disciplinaId,
      curso,
      dia,
      turno,
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

  /* Pool das turmas que já são do professor, por disciplina. Uma disciplina pode ter mais
     de uma turma dele (ex.: turma de manhã e turma à noite) — cada item que ele mandar
     reaproveita uma turma do pool (é só reagendar); o que sobrar no pool no final é porque
     ele não mandou mais nenhum item pra essa disciplina, então perde o professor. */
  const poolPorDisciplina = new Map<number, any[]>()
  for (const t of existentes) {
    if (t.professor_id !== professorId) continue
    if (!poolPorDisciplina.has(t.disciplina_id)) poolPorDisciplina.set(t.disciplina_id, [])
    poolPorDisciplina.get(t.disciplina_id)!.push(t)
  }

  /* Vaga = disciplina + dia + turno. Se ESSA vaga exata já é de outro professor, ninguém
     mais pode pegá-la — mas o mesmo professor pode ter a mesma disciplina em mais de uma
     vaga (uma de manhã, outra à noite, por exemplo), então o choque é por vaga, não mais
     pela disciplina inteira. */
  const donoDaVaga = new Map<string, any>()
  for (const t of existentes) {
    if (!t.professor_id || t.professor_id === professorId) continue
    donoDaVaga.set(`${t.disciplina_id}|${t.dia_semana ?? ''}|${t.turno}`, t)
  }

  const catalogo = new Map<number, any>(
    (
      await q<any>(
        'SELECT id, nome, ofertada_diurno, ofertada_noturno, ensalar_diurno, ensalar_noturno FROM disciplina',
      )
    ).map((d) => [d.id, d]),
  )

  const ocupadas: ResultadoAtribuicao['ocupadas'] = []
  const naoOfertadas: string[] = []
  const conflitos: string[] = []
  const paraVincular: ItemAtribuicao[] = []
  const agenda = new Map<string, string>() // "DIA|TURNO" -> nome da disciplina

  for (const item of itens) {
    const disciplina = catalogo.get(item.disciplinaId)
    if (!disciplina) continue

    // a oferta agora é por turno: nem toda disciplina de noite abre de dia, e vice-versa.
    // Quem já era dele nesse turno continua valendo mesmo que a oferta seja desligada depois.
    const ofertadaNesseTurno = item.turno === 'DIURNO' ? disciplina.ofertada_diurno : disciplina.ofertada_noturno
    const jaDeleNesseTurno = (poolPorDisciplina.get(item.disciplinaId) ?? []).some(
      (t) => t.turno === item.turno,
    )
    if (!ofertadaNesseTurno && !jaDeleNesseTurno) {
      naoOfertadas.push(`${disciplina.nome} (${item.turno === 'DIURNO' ? 'diurno' : 'noturno'})`)
      continue
    }

    const vaga = donoDaVaga.get(`${item.disciplinaId}|${item.dia ?? ''}|${item.turno}`)
    if (vaga) {
      ocupadas.push({ disciplina: vaga.disciplina, professor: vaga.dono })
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

  let criadas = 0
  let paraLiberar: string[] = []

  await transacao(async (exec) => {
    for (const item of paraVincular) {
      // "entra na mistura" agora é decidido por disciplina e por turno (tela de Oferta
      // do semestre) — a turma diurna dessa disciplina pode entrar e a noturna não.
      const disc = catalogo.get(item.disciplinaId)
      const ensalar = (item.turno === 'DIURNO' ? disc?.ensalar_diurno : disc?.ensalar_noturno) !== false

      // reaproveita uma turma que já é dele nessa disciplina, se sobrar alguma no pool
      const pool = poolPorDisciplina.get(item.disciplinaId)
      const turma = pool && pool.length ? pool.shift() : null
      if (turma) {
        await exec(
          `UPDATE turma SET professor_id = $1, curso = $2, dia_semana = $3, turno = $4,
                            ensalar = $5, atualizado_em = now()
            WHERE id = $6`,
          [professorId, item.curso, item.dia, item.turno, ensalar, turma.id],
        )
      } else {
        await exec(
          `INSERT INTO turma (disciplina_id, professor_id, curso, dia_semana, turno, ensalar)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [item.disciplinaId, professorId, item.curso, item.dia, item.turno, ensalar],
        )
        criadas++
      }
    }

    // sobrou turma do professor sem item correspondente: ele não pediu mais essa vaga
    paraLiberar = [...poolPorDisciplina.values()].flat().map((t) => t.id)
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
 *
 * O "dono" é por TURNO, não pela disciplina inteira: a mesma disciplina pode ter um
 * professor de manhã e outro à noite (cada turno é uma vaga separada, igual já vale em
 * `atribuirDisciplinas`). Antes essa função dava um dono só pra disciplina toda, o que
 * bloqueava um segundo professor de pegar o turno livre mesmo quando ele estava
 * disponível — corrigido aqui pra casar com a regra de verdade.
 */
export async function disciplinasComDono() {
  return q<any>(
    `SELECT d.id, d.numero, d.nome,
            d.ofertada_diurno  AS "ofertadaDiurno",
            d.ofertada_noturno AS "ofertadaNoturno",
            d.ensalar_diurno   AS "ensalarDiurno",
            d.ensalar_noturno  AS "ensalarNoturno",
            diurno.professor_id  AS "professorIdDiurno",
            COALESCE(du.nome, '') AS "professorNomeDiurno",
            noturno.professor_id AS "professorIdNoturno",
            COALESCE(nu.nome, '') AS "professorNomeNoturno"
       FROM disciplina d
       LEFT JOIN LATERAL (
         SELECT t.professor_id FROM turma t
          WHERE t.disciplina_id = d.id AND t.turno = 'DIURNO' AND t.professor_id IS NOT NULL
          ORDER BY t.criado_em ASC LIMIT 1
       ) diurno ON true
       LEFT JOIN usuario du ON du.id = diurno.professor_id
       LEFT JOIN LATERAL (
         SELECT t.professor_id FROM turma t
          WHERE t.disciplina_id = d.id AND t.turno = 'NOTURNO' AND t.professor_id IS NOT NULL
          ORDER BY t.criado_em ASC LIMIT 1
       ) noturno ON true
       LEFT JOIN usuario nu ON nu.id = noturno.professor_id
      ORDER BY d.numero ASC`,
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
    // uma linha por vaga (disciplina+dia+turno) — a mesma disciplina pode aparecer em
    // duas linhas quando o professor dá aula dela em dois turnos/dias diferentes.
    const vistas = new Set<string>()
    const itens = []

    for (const t of turmas) {
      if (t.professor_id !== p.id) continue
      const chave = `${t.disciplina_id}|${t.dia_semana ?? ''}|${t.turno}`
      if (vistas.has(chave)) continue
      vistas.add(chave)
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
