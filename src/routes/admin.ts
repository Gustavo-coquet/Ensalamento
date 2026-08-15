import { Router, type Response } from 'express'
import bcrypt from 'bcryptjs'
import { q, q1, transacao } from '../lib/db'
import { exigeAdmin } from '../lib/auth'
import { lerLinhas } from '../lib/importacao'
import {
  atribuirDisciplinas,
  atribuicaoAtual,
  disciplinasComDono,
  lerItens,
  MAX_DISCIPLINAS,
} from '../lib/atribuicao'
import { paraCSV } from '../lib/csv'
import { carregarEnsalamento, gerarEnsalamento } from '../lib/ensalamento'
import {
  CURSOS,
  DIAS,
  TURNOS,
  ROTULO_CURSO,
  ROTULO_DIA,
  ROTULO_TURNO,
  normalizaGabarito,
  validaTurno,
  QTD_QUESTOES,
  type Dia,
} from '../lib/texto'

export const rotasAdmin = Router()
rotasAdmin.use(exigeAdmin)

function validaDia(valor: string): Dia | null {
  const dia = String(valor ?? '').toUpperCase()
  return (DIAS as readonly string[]).includes(dia) ? (dia as Dia) : null
}

/* ------------------------------- Painel geral ----------------------------- */

rotasAdmin.get('/dashboard', async (_req, res) => {
  const turmas = await q<any>(
    `SELECT t.id, t.curso, t.dia_semana, t.turno, t.ensalar, t.gabarito, t.professor_id,
            (SELECT COUNT(*)::int FROM aluno a WHERE a.turma_id = t.id) AS total_alunos
       FROM turma t`,
  )

  // uma linha por combinação de dia + turno: é essa a unidade de geração de salas
  const porDia = DIAS.flatMap((dia) =>
    TURNOS.map((turno) => {
      const doBloco = turmas.filter((t) => t.dia_semana === dia && t.turno === turno)
      const ensaladas = doBloco.filter((t) => t.ensalar)
      const alunos = ensaladas.reduce((s, t) => s + t.total_alunos, 0)
      return {
        dia,
        turno,
        rotulo: ROTULO_DIA[dia],
        rotuloTurno: ROTULO_TURNO[turno],
        turmas: doBloco.length,
        turmasEnsaladas: ensaladas.length,
        alunos,
        salasPrevistas: alunos ? Math.ceil(alunos / 15) : 0,
      }
    }),
  )

  const contagem = async (sql: string) => Number((await q1<{ n: string }>(sql))!.n)

  // um ensalamento só vale enquanto bate com os alunos que estão no banco agora:
  // "alunosVigentes" conta quem continua alocado, e comparamos com quem é elegível hoje
  const ensalamentos = await q<any>(
    `SELECT e.dia_semana, e.turno, e.total_alunos, e.total_salas, e.criado_em,
            (SELECT COUNT(*)::int
               FROM sala s JOIN sala_aluno sa ON sa.sala_id = s.id
              WHERE s.ensalamento_id = e.id) AS alunos_vigentes
       FROM ensalamento e ORDER BY e.criado_em DESC`,
  )

  const elegiveis = (dia: string, turno: string) =>
    turmas
      .filter((t) => t.dia_semana === dia && t.turno === turno && t.ensalar)
      .reduce((s, t) => s + t.total_alunos, 0)

  res.json({
    totais: {
      disciplinas: await contagem('SELECT COUNT(*) AS n FROM disciplina'),
      professores: await contagem("SELECT COUNT(*) AS n FROM usuario WHERE papel = 'PROFESSOR'"),
      turmas: turmas.length,
      alunos: await contagem('SELECT COUNT(*) AS n FROM aluno'),
      semDia: turmas.filter((t) => !t.dia_semana).length,
      semGabarito: turmas.filter((t) => !normalizaGabarito(t.gabarito).every((g) => g !== '')).length,
      semProfessor: turmas.filter((t) => !t.professor_id).length,
    },
    porDia,
    ensalamentos: ensalamentos.map((e) => ({
      dia: e.dia_semana,
      turno: e.turno,
      rotulo: ROTULO_DIA[e.dia_semana],
      rotuloTurno: ROTULO_TURNO[e.turno],
      totalAlunos: e.alunos_vigentes,
      totalSalas: e.total_salas,
      criadoEm: e.criado_em,
      // sem ninguém alocado, ou com número diferente do que é elegível hoje, não vale mais
      desatualizado:
        e.alunos_vigentes === 0 || e.alunos_vigentes !== elegiveis(e.dia_semana, e.turno),
    })),
  })
})

/* ------------------------------- Disciplinas ------------------------------ */

rotasAdmin.get('/disciplinas', async (_req, res) => {
  res.json({ disciplinas: await q('SELECT id, numero, nome FROM disciplina ORDER BY numero ASC') })
})

/* -------------------------------- Usuários -------------------------------- */

rotasAdmin.get('/usuarios', async (_req, res) => {
  const usuarios = await q<any>(
    `SELECT u.id, u.nome, u.email, u.papel, u.ativo,
            (SELECT COUNT(*)::int FROM turma t WHERE t.professor_id = u.id) AS turmas
       FROM usuario u ORDER BY u.papel ASC, u.nome ASC`,
  )
  res.json({ usuarios })
})

rotasAdmin.post('/usuarios', async (req, res) => {
  const nome = String(req.body?.nome ?? '').trim()
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const senha = String(req.body?.senha ?? '')
  const papel = req.body?.papel === 'ADMIN' ? 'ADMIN' : 'PROFESSOR'

  if (!nome || !email) return res.status(400).json({ erro: 'Informe nome e e-mail' })
  if (senha.length < 6) return res.status(400).json({ erro: 'A senha precisa ter ao menos 6 caracteres' })
  if (await q1('SELECT id FROM usuario WHERE email = $1', [email])) {
    return res.status(409).json({ erro: 'Já existe um usuário com esse e-mail' })
  }

  const [usuario] = await q<any>(
    'INSERT INTO usuario (nome, email, senha_hash, papel) VALUES ($1,$2,$3,$4) RETURNING id, nome, email, papel',
    [nome, email, await bcrypt.hash(senha, 10), papel],
  )
  res.status(201).json({ usuario })
})

rotasAdmin.put('/usuarios/:id', async (req, res) => {
  const campos: string[] = []
  const valores: unknown[] = []
  const push = (coluna: string, valor: unknown) => {
    valores.push(valor)
    campos.push(`${coluna} = $${valores.length}`)
  }

  if (req.body?.nome) push('nome', String(req.body.nome).trim())
  if (req.body?.email) push('email', String(req.body.email).trim().toLowerCase())
  if (typeof req.body?.ativo === 'boolean') push('ativo', req.body.ativo)
  if (req.body?.senha) {
    const senha = String(req.body.senha)
    if (senha.length < 6) return res.status(400).json({ erro: 'A senha precisa ter ao menos 6 caracteres' })
    push('senha_hash', await bcrypt.hash(senha, 10))
  }
  if (!campos.length) return res.status(400).json({ erro: 'Nada para atualizar' })

  valores.push(req.params.id)
  const [usuario] = await q<any>(
    `UPDATE usuario SET ${campos.join(', ')} WHERE id = $${valores.length} RETURNING id, nome, email, ativo`,
    valores,
  )
  if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado' })
  res.json({ usuario })
})

rotasAdmin.delete('/usuarios/:id', async (req, res) => {
  if (req.params.id === req.usuario!.id) return res.status(400).json({ erro: 'Você não pode remover a si mesmo' })
  await q('DELETE FROM usuario WHERE id = $1', [req.params.id])
  res.json({ ok: true })
})

/* --------------------------------- Turmas --------------------------------- */

rotasAdmin.post('/turmas', async (req, res) => {
  const disciplinaId = Number(req.body?.disciplinaId)
  const professorId = req.body?.professorId ? String(req.body.professorId) : null
  const curso = String(req.body?.curso ?? 'CICLO_BASICO')
  const dia = req.body?.diaSemana ? String(req.body.diaSemana) : null
  const turno = validaTurno(req.body?.turno ?? 'NOTURNO')

  if (!(await q1('SELECT id FROM disciplina WHERE id = $1', [disciplinaId]))) {
    return res.status(400).json({ erro: 'Disciplina inválida' })
  }
  if (!(CURSOS as readonly string[]).includes(curso)) return res.status(400).json({ erro: 'Curso inválido' })
  if (dia && !validaDia(dia)) return res.status(400).json({ erro: 'Dia inválido' })
  if (!turno) return res.status(400).json({ erro: 'Turno inválido' })

  const [turma] = await q<any>(
    `INSERT INTO turma (disciplina_id, professor_id, curso, dia_semana, turno)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [disciplinaId, professorId, curso, dia, turno],
  )
  res.status(201).json({ turma })
})

/**
 * Cadastro em lote de professores: uma linha por pessoa, com NOME ; E-MAIL ; SENHA.
 * Cria quem ainda não existe e reaproveita quem já existe (sem mexer na senha dele).
 * Disciplinas, dia e turno ficam para a grade de atribuição ou para o próprio professor.
 *
 * Com `modo: 'simular'` nada é gravado — serve para conferir antes de aplicar.
 */
rotasAdmin.post('/importar', async (req, res) => {
  const texto = String(req.body?.texto ?? '')
  const senhaPadrao = String(req.body?.senhaPadrao ?? '').trim() || '000000'
  const aplicar = req.body?.modo === 'aplicar'

  if (senhaPadrao.length < 6) {
    return res.status(400).json({ erro: 'A senha padrão precisa de pelo menos 6 caracteres' })
  }

  const linhas = lerLinhas(texto, senhaPadrao)
  if (!linhas.length) return res.status(400).json({ erro: 'Nenhuma linha reconhecida' })

  const usuarios = await q<any>('SELECT id, email, nome FROM usuario')
  const porEmail = new Map<string, any>(usuarios.map((u) => [String(u.email).toLowerCase(), u]))

  const resultado = linhas.map((l) => ({
    linha: l.linha,
    professor: l.professor,
    email: l.email,
    senha: l.senha,
    acao: (l.erro ? '' : porEmail.has(l.email) ? 'existente' : 'criar') as 'criar' | 'existente' | '',
    erro: l.erro,
  }))

  // o mesmo e-mail duas vezes na lista cadastraria a pessoa uma vez só
  const vistos = new Map<string, number>()
  for (const r of resultado) {
    if (r.erro) continue
    const antes = vistos.get(r.email)
    if (antes) r.erro = `E-mail repetido (já apareceu na linha ${antes})`
    else vistos.set(r.email, r.linha)
  }

  const validas = resultado.filter((r) => !r.erro)

  if (aplicar && validas.length) {
    await transacao(async (exec) => {
      for (const r of validas) {
        if (porEmail.has(r.email)) continue
        const hash = await bcrypt.hash(r.senha, 10)
        const [criado] = await exec<{ id: string }>(
          `INSERT INTO usuario (nome, email, senha_hash, papel) VALUES ($1,$2,$3,'PROFESSOR')
           RETURNING id`,
          [r.professor, r.email, hash],
        )
        porEmail.set(r.email, { id: criado.id, email: r.email, nome: r.professor })
      }
    })
  }

  res.json({
    aplicado: aplicar,
    resumo: {
      linhas: resultado.length,
      validas: validas.length,
      erros: resultado.length - validas.length,
      professoresNovos: validas.filter((r) => r.acao === 'criar').length,
      professoresExistentes: validas.filter((r) => r.acao === 'existente').length,
    },
    linhas: resultado,
  })
})

/** Grade de atribuição: professores + o que cada um já leciona (com dia e turno). */
rotasAdmin.get('/atribuicao', async (_req, res) => {
  res.json({
    disciplinas: await disciplinasComDono(),
    professores: await atribuicaoAtual(),
    maximo: MAX_DISCIPLINAS,
  })
})

/** O administrador preenchendo pelo professor — mesma regra do que ele faria sozinho. */
rotasAdmin.post('/atribuicao/:professorId', async (req, res) => {
  const professor = await q1<any>("SELECT id FROM usuario WHERE id = $1 AND papel IN ('PROFESSOR','ADMIN')", [
    req.params.professorId,
  ])
  if (!professor) return res.status(404).json({ erro: 'Professor não encontrado' })

  const resultado = await atribuirDisciplinas(professor.id, lerItens(req.body?.itens))
  res.json({ ok: true, ...resultado })
})

rotasAdmin.put('/turmas/:id/professor', async (req, res) => {
  const professorId = req.body?.professorId ? String(req.body.professorId) : null
  const [turma] = await q<any>(
    'UPDATE turma SET professor_id = $1, atualizado_em = now() WHERE id = $2 RETURNING id, professor_id',
    [professorId, req.params.id],
  )
  if (!turma) return res.status(404).json({ erro: 'Turma não encontrada' })
  res.json({ ok: true, turma })
})

rotasAdmin.delete('/turmas/:id', async (req, res) => {
  await q('DELETE FROM turma WHERE id = $1', [req.params.id])
  res.json({ ok: true })
})

/** Equivale ao "Apagar A5:B53" da planilha: zera os alunos de todas as turmas. */
rotasAdmin.post('/limpar-alunos', async (req, res) => {
  if (req.body?.confirmacao !== 'APAGAR') return res.status(400).json({ erro: 'Confirmação inválida' })

  const removidos = await q('DELETE FROM aluno RETURNING id')
  await q('DELETE FROM ensalamento')
  res.json({ ok: true, removidos: removidos.length })
})

/* ------------------------------- Ensalamento ------------------------------ */

rotasAdmin.post('/ensalamento/:dia/:turno', async (req, res) => {
  const dia = validaDia(req.params.dia)
  const turno = validaTurno(req.params.turno)
  if (!dia) return res.status(400).json({ erro: 'Dia inválido' })
  if (!turno) return res.status(400).json({ erro: 'Turno inválido' })

  const capacidade = Math.max(2, Math.min(60, Number(req.body?.capacidade) || 15))
  const resultado = await gerarEnsalamento(dia, turno, capacidade)

  if (!resultado || resultado.totalAlunos === 0) {
    return res.status(400).json({
      erro: `Nenhum aluno marcado para ensalar em ${ROTULO_DIA[dia]} — ${ROTULO_TURNO[turno].toLowerCase()}`,
    })
  }
  res.json({ ensalamento: resultado })
})

rotasAdmin.get('/ensalamento/:dia/:turno', async (req, res) => {
  const dia = validaDia(req.params.dia)
  const turno = validaTurno(req.params.turno)
  if (!dia) return res.status(400).json({ erro: 'Dia inválido' })
  if (!turno) return res.status(400).json({ erro: 'Turno inválido' })

  const resultado = await carregarEnsalamento(dia, turno)
  if (!resultado) return res.status(404).json({ erro: 'Ainda não há salas geradas para este dia e turno' })
  res.json({ ensalamento: resultado })
})

rotasAdmin.delete('/ensalamento/:dia/:turno', async (req, res) => {
  const dia = validaDia(req.params.dia)
  const turno = validaTurno(req.params.turno)
  if (!dia) return res.status(400).json({ erro: 'Dia inválido' })
  if (!turno) return res.status(400).json({ erro: 'Turno inválido' })

  await q('DELETE FROM ensalamento WHERE dia_semana = $1 AND turno = $2', [dia, turno])
  res.json({ ok: true })
})

/* ------------------------------- Exportações ------------------------------ */

function enviaCSV(res: Response, nome: string, conteudo: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`)
  res.send(conteudo)
}

/** RESUMO geral — mesmo formato que alimentava o leitor de cartão-resposta. */
rotasAdmin.get('/export/resumo.csv', async (_req, res) => {
  const linhas = await q<any>(
    `SELECT t.curso, t.turno, d.nome AS disciplina, d.numero,
            COALESCE(u.nome, '') AS professor, a.matricula, a.nome
       FROM aluno a
       JOIN turma t      ON t.id = a.turma_id
       JOIN disciplina d ON d.id = t.disciplina_id
       LEFT JOIN usuario u ON u.id = t.professor_id
      ORDER BY d.numero ASC, a.nome_chave ASC`,
  )

  enviaCSV(
    res,
    'resumo.csv',
    paraCSV(
      ['CURSO', 'DISCIPLINA', 'PROFESSOR', 'RA', 'CODIGO DE BARRAS', 'NOME', 'TURNO'],
      linhas.map((l) => [
        (ROTULO_CURSO[l.curso] ?? l.curso).toUpperCase(),
        l.disciplina.toUpperCase(),
        l.professor.toUpperCase(),
        l.matricula.toUpperCase(),
        `*${l.matricula.toUpperCase()}*`,
        l.nome.toUpperCase(),
        l.turno.toUpperCase(),
      ]),
    ),
  )
})

/** Gabaritos: uma linha por turma, 10 colunas de resposta. */
rotasAdmin.get('/export/gabaritos.csv', async (_req, res) => {
  const linhas = await q<any>(
    `SELECT d.numero, d.nome AS disciplina, COALESCE(u.nome,'') AS professor,
            t.dia_semana, t.turno, t.curso, t.ensalar, t.gabarito
       FROM turma t
       JOIN disciplina d ON d.id = t.disciplina_id
       LEFT JOIN usuario u ON u.id = t.professor_id
      ORDER BY d.numero ASC`,
  )

  enviaCSV(
    res,
    'gabaritos.csv',
    paraCSV(
      ['Nº', 'DISCIPLINA', 'PROFESSOR', 'CURSO', 'DIA', 'TURNO', 'NA MISTURA', ...Array.from({ length: QTD_QUESTOES }, (_, i) => `Q${i + 1}`)],
      linhas.map((l) => [
        l.numero,
        l.disciplina.toUpperCase(),
        l.professor.toUpperCase(),
        (ROTULO_CURSO[l.curso] ?? l.curso).toUpperCase(),
        l.dia_semana ? ROTULO_DIA[l.dia_semana] : '',
        (l.turno ?? '').toUpperCase(),
        l.ensalar ? 'SIM' : 'NAO',
        ...normalizaGabarito(l.gabarito),
      ]),
    ),
  )
})

/** Salas de um dia + turno: uma linha por aluno alocado. */
rotasAdmin.get('/export/salas/:dia/:turno', async (req, res) => {
  const dia = validaDia(req.params.dia)
  const turno = validaTurno(req.params.turno)
  if (!dia) return res.status(400).json({ erro: 'Dia inválido' })
  if (!turno) return res.status(400).json({ erro: 'Turno inválido' })

  const resultado = await carregarEnsalamento(dia, turno)
  if (!resultado) return res.status(404).json({ erro: 'Ainda não há salas geradas para este dia e turno' })

  const linhas: (string | number)[][] = []
  for (const sala of resultado.salas) {
    sala.alunos.forEach((a, i) => {
      linhas.push([
        sala.rotulo,
        i + 1,
        a.matricula.toUpperCase(),
        `*${a.matricula.toUpperCase()}*`,
        a.nome.toUpperCase(),
        a.disciplina.toUpperCase(),
        (ROTULO_CURSO[a.curso] ?? a.curso).toUpperCase(),
        a.professor.toUpperCase(),
      ])
    })
  }

  enviaCSV(
    res,
    `salas-${dia.toLowerCase()}-${turno.toLowerCase()}.csv`,
    paraCSV(['SALA', 'ORDEM', 'RA', 'CODIGO DE BARRAS', 'NOME', 'DISCIPLINA', 'CURSO', 'PROFESSOR'], linhas),
  )
})
