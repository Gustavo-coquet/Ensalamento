import { Router } from 'express'
import { q, q1 } from '../lib/db'
import { exigeLogin, turmaPermitida } from '../lib/auth'
import { atribuirDisciplinas, disciplinasComDono, lerItens, MAX_DISCIPLINAS } from '../lib/atribuicao'
import { invalidarPorTurma } from '../lib/ensalamento'
import {
  chaveNome,
  normalizaNome,
  normalizaGabarito,
  validaTurno,
  CURSOS,
  DIAS,
  QTD_QUESTOES,
} from '../lib/texto'

export const rotasTurmas = Router()
rotasTurmas.use(exigeLogin)

/** Turmas visíveis: administrador vê todas, professor vê as dele. */
rotasTurmas.get('/', async (req, res) => {
  const usuario = req.usuario!
  const soDoProfessor = usuario.papel === 'ADMIN' ? '' : 'WHERE t.professor_id = $1'
  const params = usuario.papel === 'ADMIN' ? [] : [usuario.id]

  const linhas = await q<any>(
    `SELECT t.id, t.curso, t.dia_semana, t.ensalar, t.turno, t.gabarito, t.atualizado_em,
            d.numero, d.nome AS disciplina,
            u.id AS professor_id, u.nome AS professor_nome, u.email AS professor_email,
            (SELECT COUNT(*)::int FROM aluno a WHERE a.turma_id = t.id) AS total_alunos
       FROM turma t
       JOIN disciplina d ON d.id = t.disciplina_id
       LEFT JOIN usuario u ON u.id = t.professor_id
       ${soDoProfessor}
      ORDER BY d.numero ASC`,
    params,
  )

  res.json({
    turmas: linhas.map((t) => ({
      id: t.id,
      disciplina: t.disciplina,
      numero: t.numero,
      professor: t.professor_id ? { id: t.professor_id, nome: t.professor_nome, email: t.professor_email } : null,
      curso: t.curso,
      diaSemana: t.dia_semana,
      ensalar: t.ensalar,
      turno: t.turno,
      totalAlunos: t.total_alunos,
      gabaritoCompleto: normalizaGabarito(t.gabarito).every((g) => g !== ''),
      atualizadoEm: t.atualizado_em,
    })),
  })
})

/** Catálogo de disciplinas com o dono atual — para o professor escolher as dele. */
rotasTurmas.get('/disciplinas/catalogo', async (_req, res) => {
  res.json({ disciplinas: await disciplinasComDono(), maximo: MAX_DISCIPLINAS })
})

/**
 * O professor define sozinho o que leciona: cada disciplina com o seu dia e turno.
 * A lista enviada é o conjunto final — o que ele tirar volta a ficar sem dono.
 */
rotasTurmas.post('/minhas-disciplinas', async (req, res) => {
  const resultado = await atribuirDisciplinas(req.usuario!.id, lerItens(req.body?.itens))
  res.json({ ok: true, ...resultado })
})

rotasTurmas.get('/:id', async (req, res) => {
  const turma = await turmaPermitida(req.usuario!, req.params.id)
  if (!turma) return res.status(404).json({ erro: 'Turma não encontrada' })

  const alunos = await q<any>(
    'SELECT id, matricula, nome FROM aluno WHERE turma_id = $1 ORDER BY nome_chave ASC',
    [turma.id],
  )

  res.json({
    turma: {
      id: turma.id,
      disciplina: turma.disciplina,
      numero: turma.numero,
      professor: turma.professor_id ? { id: turma.professor_id, nome: turma.professor } : null,
      curso: turma.curso,
      diaSemana: turma.dia_semana,
      ensalar: turma.ensalar,
      turno: turma.turno,
      gabarito: normalizaGabarito(turma.gabarito),
    },
    alunos,
  })
})

/** Configuração da turma: dia, curso, turno e se entra na mistura de salas. */
rotasTurmas.put('/:id', async (req, res) => {
  const turma = await turmaPermitida(req.usuario!, req.params.id)
  if (!turma) return res.status(404).json({ erro: 'Turma não encontrada' })

  const dia = req.body?.diaSemana ? String(req.body.diaSemana) : null
  const curso = req.body?.curso ? String(req.body.curso) : turma.curso

  if (dia && !DIAS.includes(dia as any)) return res.status(400).json({ erro: 'Dia inválido' })
  if (!CURSOS.includes(curso as any)) return res.status(400).json({ erro: 'Curso inválido' })

  const ensalar = typeof req.body?.ensalar === 'boolean' ? req.body.ensalar : turma.ensalar

  const turno = req.body?.turno ? validaTurno(req.body.turno) : turma.turno
  if (!turno) return res.status(400).json({ erro: 'Turno inválido' })

  const [atualizada] = await q<any>(
    `UPDATE turma SET dia_semana = $1, curso = $2, ensalar = $3, turno = $4, atualizado_em = now()
      WHERE id = $5 RETURNING id, dia_semana, curso, ensalar, turno`,
    [dia, curso, ensalar, turno, turma.id],
  )

  await invalidarPorTurma([turma.id])
  res.json({ ok: true, turma: atualizada })
})

rotasTurmas.put('/:id/gabarito', async (req, res) => {
  const turma = await turmaPermitida(req.usuario!, req.params.id)
  if (!turma) return res.status(404).json({ erro: 'Turma não encontrada' })

  const gabarito = normalizaGabarito(req.body?.gabarito)
  await q('UPDATE turma SET gabarito = $1, atualizado_em = now() WHERE id = $2', [gabarito, turma.id])
  res.json({ ok: true, gabarito })
})

/** Aceita "matrícula<TAB>nome", "matrícula;nome", "matrícula,nome" ou "matrícula nome". */
export function parseLinhas(texto: string) {
  const alunos: { matricula: string; nome: string }[] = []
  const erros: string[] = []

  texto.split(/\r?\n/).forEach((linha, i) => {
    const bruta = linha.trim()
    if (!bruta) return

    // a matrícula começa por dígito — evita confundir uma linha de texto solto com um aluno
    const m =
      bruta.match(/^(\d[0-9A-Za-z._-]*)\s*[\t;,]\s*(.+)$/) || bruta.match(/^(\d[0-9A-Za-z._-]*)\s+(.+)$/)

    if (!m) {
      erros.push(`Linha ${i + 1}: "${bruta.slice(0, 40)}" — não consegui separar matrícula e nome`)
      return
    }

    const nome = normalizaNome(m[2])
    if (!nome) return erros.push(`Linha ${i + 1}: nome vazio`)
    alunos.push({ matricula: m[1].trim(), nome })
  })

  return { alunos, erros }
}

/** Importa alunos colados da planilha. modo="substituir" apaga os atuais antes. */
rotasTurmas.post('/:id/alunos/importar', async (req, res) => {
  const turma = await turmaPermitida(req.usuario!, req.params.id)
  if (!turma) return res.status(404).json({ erro: 'Turma não encontrada' })

  const { alunos, erros } = parseLinhas(String(req.body?.texto ?? ''))
  if (!alunos.length) return res.status(400).json({ erro: 'Nenhum aluno reconhecido', detalhes: erros })

  // deduplica por matrícula dentro do próprio texto colado
  const unicos = new Map<string, { matricula: string; nome: string }>()
  for (const a of alunos) unicos.set(a.matricula, a)

  if (req.body?.modo === 'substituir') {
    await q('DELETE FROM aluno WHERE turma_id = $1', [turma.id])
  }

  const lista = [...unicos.values()]
  const inseridos = await q<{ inserido: boolean }>(
    `INSERT INTO aluno (turma_id, matricula, nome, nome_chave)
     SELECT $1, v.matricula, v.nome, v.chave
       FROM UNNEST($2::text[], $3::text[], $4::text[]) AS v(matricula, nome, chave)
     ON CONFLICT (turma_id, matricula)
     DO UPDATE SET nome = EXCLUDED.nome, nome_chave = EXCLUDED.nome_chave
     RETURNING (xmax = 0) AS inserido`,
    [
      turma.id,
      lista.map((a) => a.matricula),
      lista.map((a) => a.nome),
      lista.map((a) => chaveNome(a.nome)),
    ],
  )

  const novos = inseridos.filter((r) => r.inserido).length
  const total = Number((await q1<{ n: string }>('SELECT COUNT(*) AS n FROM aluno WHERE turma_id = $1', [turma.id]))!.n)

  await invalidarPorTurma([turma.id])
  res.json({ ok: true, inseridos: novos, atualizados: inseridos.length - novos, total, erros })
})

rotasTurmas.post('/:id/alunos', async (req, res) => {
  const turma = await turmaPermitida(req.usuario!, req.params.id)
  if (!turma) return res.status(404).json({ erro: 'Turma não encontrada' })

  const matricula = String(req.body?.matricula ?? '').trim()
  const nome = normalizaNome(String(req.body?.nome ?? ''))
  if (!matricula || !nome) return res.status(400).json({ erro: 'Informe matrícula e nome' })

  const existente = await q1('SELECT id FROM aluno WHERE turma_id = $1 AND matricula = $2', [turma.id, matricula])
  if (existente) return res.status(409).json({ erro: 'Já existe um aluno com essa matrícula nesta turma' })

  const [aluno] = await q<any>(
    `INSERT INTO aluno (turma_id, matricula, nome, nome_chave)
     VALUES ($1, $2, $3, $4) RETURNING id, matricula, nome`,
    [turma.id, matricula, nome, chaveNome(nome)],
  )
  await invalidarPorTurma([turma.id])
  res.status(201).json({ aluno })
})

rotasTurmas.delete('/:id/alunos/:alunoId', async (req, res) => {
  const turma = await turmaPermitida(req.usuario!, req.params.id)
  if (!turma) return res.status(404).json({ erro: 'Turma não encontrada' })

  await q('DELETE FROM aluno WHERE id = $1 AND turma_id = $2', [req.params.alunoId, turma.id])
  await invalidarPorTurma([turma.id])
  res.json({ ok: true })
})

rotasTurmas.delete('/:id/alunos', async (req, res) => {
  const turma = await turmaPermitida(req.usuario!, req.params.id)
  if (!turma) return res.status(404).json({ erro: 'Turma não encontrada' })

  const removidos = await q('DELETE FROM aluno WHERE turma_id = $1 RETURNING id', [turma.id])
  await invalidarPorTurma([turma.id])
  res.json({ ok: true, removidos: removidos.length })
})

export { QTD_QUESTOES }
