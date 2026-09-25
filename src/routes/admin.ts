import { Router, type Response } from 'express'
import bcrypt from 'bcryptjs'
import { q, q1, transacao } from '../lib/db'
import { exigeAdmin, exigeAdminOuCoordenador } from '../lib/auth'
import { lerLinhas } from '../lib/importacao'
import {
  atribuirDisciplinas,
  atribuicaoAtual,
  disciplinasComDono,
  lerItens,
  MAX_DISCIPLINAS,
} from '../lib/atribuicao'
import { paraCSV } from '../lib/csv'
import { carregarEnsalamento, gerarEnsalamento, invalidarEnsalamento } from '../lib/ensalamento'
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
// Baseline: painel, quadro de turmas e ensalamento (gerar/apagar salas) são visíveis pro
// admin e pro coordenador. Cada rota de gestão (cadastro, oferta, professores, turma de
// outro dono, manutenção) recebe exigeAdmin por cima, individualmente, mais abaixo.
rotasAdmin.use(exigeAdminOuCoordenador)

function validaDia(valor: string): Dia | null {
  const dia = String(valor ?? '').toUpperCase()
  return (DIAS as readonly string[]).includes(dia) ? (dia as Dia) : null
}

/* ------------------------------- Painel geral ----------------------------- */

rotasAdmin.get('/dashboard', async (_req, res) => {
  const turmas = await q<any>(
    `SELECT t.id, t.curso, t.dia_semana, t.turno, t.ensalar, t.gabarito, t.professor_id,
            u.nome AS professor_nome,
            (SELECT COUNT(*)::int FROM aluno a WHERE a.turma_id = t.id) AS total_alunos
       FROM turma t
       LEFT JOIN usuario u ON u.id = t.professor_id`,
  )

  // Resumo por professor: quantas disciplinas (turmas) ele tem, quantas ainda estão sem
  // aluno cadastrado e quantas com gabarito incompleto — pra ver de cara quem falta
  // cobrar sem precisar abrir turma por turma. "Geral" é a mesma conta somando todo mundo.
  const semGabaritoTurma = (t: any) => !normalizaGabarito(t.gabarito).every((g: string) => g !== '')
  const porProfessorMapa = new Map<string, { id: string; nome: string; turmas: number; semAluno: number; semGabarito: number }>()
  for (const t of turmas) {
    if (!t.professor_id) continue
    if (!porProfessorMapa.has(t.professor_id)) {
      porProfessorMapa.set(t.professor_id, {
        id: t.professor_id,
        nome: t.professor_nome,
        turmas: 0,
        semAluno: 0,
        semGabarito: 0,
      })
    }
    const p = porProfessorMapa.get(t.professor_id)!
    p.turmas++
    if (t.total_alunos === 0) p.semAluno++
    if (semGabaritoTurma(t)) p.semGabarito++
  }
  const porProfessor = [...porProfessorMapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const resumoGeral = {
    turmas: turmas.length,
    semAluno: turmas.filter((t) => t.total_alunos === 0).length,
    semGabarito: turmas.filter(semGabaritoTurma).length,
  }

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
      professores: await contagem("SELECT COUNT(*) AS n FROM usuario WHERE papel IN ('PROFESSOR','COORDENADOR')"),
      turmas: turmas.length,
      alunos: await contagem('SELECT COUNT(*) AS n FROM aluno'),
      semDia: turmas.filter((t) => !t.dia_semana).length,
      semGabarito: turmas.filter((t) => !normalizaGabarito(t.gabarito).every((g) => g !== '')).length,
      semProfessor: turmas.filter((t) => !t.professor_id).length,
    },
    porDia,
    porProfessor,
    resumoGeral,
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
  const disciplinas = await q<any>(
    `SELECT d.id, d.numero, d.nome,
            d.ofertada_diurno  AS "ofertadaDiurno",
            d.ofertada_noturno AS "ofertadaNoturno",
            d.ensalar_diurno   AS "ensalarDiurno",
            d.ensalar_noturno  AS "ensalarNoturno",
            (SELECT COUNT(*)::int FROM turma t WHERE t.disciplina_id = d.id) AS turmas,
            (SELECT COUNT(*)::int FROM turma t WHERE t.disciplina_id = d.id AND t.turno = 'DIURNO')
              AS "turmasDiurno",
            (SELECT COUNT(*)::int FROM turma t WHERE t.disciplina_id = d.id AND t.turno = 'NOTURNO')
              AS "turmasNoturno"
       FROM disciplina d ORDER BY d.numero ASC`,
  )
  res.json({ disciplinas })
})

/**
 * Define a oferta do semestre — agora por turno: uma disciplina pode ser oferecida só
 * de dia, só à noite, nos dois ou em nenhum. Só as disciplinas marcadas em cada turno
 * aparecem para o professor escolher naquele turno. O que já foi atribuído continua
 * valendo — desmarcar não apaga turma.
 *
 * "Entra na mistura" também é decidido aqui, por disciplina e por turno — a turma
 * diurna de uma disciplina pode entrar na mistura e a noturna dela não, por exemplo.
 * Todas as turmas daquele turno, de qualquer professor, passam a valer o mesmo na hora.
 */
rotasAdmin.put('/disciplinas/ofertadas', exigeAdmin, async (req, res) => {
  let diurno = Array.isArray(req.body?.diurno) ? req.body.diurno.map(Number).filter(Number.isInteger) : []
  let noturno = Array.isArray(req.body?.noturno) ? req.body.noturno.map(Number).filter(Number.isInteger) : []
  const ensalarDiurno = Array.isArray(req.body?.ensalarDiurno)
    ? req.body.ensalarDiurno.map(Number).filter(Number.isInteger)
    : []
  const ensalarNoturno = Array.isArray(req.body?.ensalarNoturno)
    ? req.body.ensalarNoturno.map(Number).filter(Number.isInteger)
    : []

  // Não dá pra desligar a oferta de um turno que já tem turma nele — ficaria uma turma
  // de verdade (com professor, com alunos) marcada como "fora da oferta", o que é uma
  // inconsistência. A tela já trava isso, mas força de novo aqui pra ninguém conseguir
  // criar essa inconsistência direto pela API.
  const comTurmaDiurno = await q<{ id: number }>(
    `SELECT DISTINCT d.id FROM disciplina d
       JOIN turma t ON t.disciplina_id = d.id AND t.turno = 'DIURNO'`,
  )
  const comTurmaNoturno = await q<{ id: number }>(
    `SELECT DISTINCT d.id FROM disciplina d
       JOIN turma t ON t.disciplina_id = d.id AND t.turno = 'NOTURNO'`,
  )
  diurno = [...new Set([...diurno, ...comTurmaDiurno.map((d) => d.id)])]
  noturno = [...new Set([...noturno, ...comTurmaNoturno.map((d) => d.id)])]

  await q(
    `UPDATE disciplina
        SET ofertada_diurno  = (id = ANY($1::int[])),
            ofertada_noturno = (id = ANY($2::int[])),
            ensalar_diurno   = (id = ANY($3::int[])),
            ensalar_noturno  = (id = ANY($4::int[]))`,
    [diurno, noturno, ensalarDiurno, ensalarNoturno],
  )

  // "Optativa Complementar" e "Optativa Profissional" mudam de assunto a cada semestre —
  // o texto digitado vira o complemento do nome ("Optativa Complementar — Libras"). Só
  // mexe no nome de quem já é uma dessas duas (nome-base antes do " — "), pra ninguém
  // conseguir renomear outra disciplina por aqui.
  const complementos = Array.isArray(req.body?.complementos) ? req.body.complementos : []
  for (const c of complementos) {
    const id = Number(c?.id)
    if (!Number.isInteger(id)) continue
    const texto = String(c?.texto ?? '').trim().slice(0, 80)
    await q(
      `UPDATE disciplina
          SET nome = split_part(nome, ' — ', 1) || CASE WHEN $2 <> '' THEN ' — ' || $2 ELSE '' END
        WHERE id = $1 AND split_part(nome, ' — ', 1) IN ('Optativa Complementar', 'Optativa Profissional')`,
      [id, texto],
    )
  }

  // propaga pra todas as turmas já existentes daquelas disciplinas — sem isso a tela
  // mudaria a "preferência" mas as provas já marcadas continuariam com o valor antigo.
  const afetadas = await q<any>(
    `UPDATE turma t
        SET ensalar = CASE WHEN t.turno = 'DIURNO' THEN d.ensalar_diurno ELSE d.ensalar_noturno END,
            atualizado_em = now()
       FROM disciplina d
      WHERE d.id = t.disciplina_id
        AND t.ensalar IS DISTINCT FROM (CASE WHEN t.turno = 'DIURNO' THEN d.ensalar_diurno ELSE d.ensalar_noturno END)
      RETURNING t.dia_semana, t.turno`,
  )
  if (afetadas.length) {
    await invalidarEnsalamento(afetadas.map((t) => ({ dia: t.dia_semana, turno: t.turno })))
  }

  const total = Number(
    (await q1<{ n: string }>(
      'SELECT COUNT(*) AS n FROM disciplina WHERE ofertada_diurno OR ofertada_noturno',
    ))!.n,
  )
  res.json({ ok: true, ofertadas: total })
})

/**
 * Cria mais uma optativa do mesmo tipo — pode ter várias "Optativa Complementar" ou
 * "Optativa Profissional" rodando no mesmo semestre. Nasce com um nome temporário
 * único ("Optativa Complementar — #61"); o admin troca o texto no campinho e salva a
 * oferta pra dar o nome de verdade.
 */
rotasAdmin.post('/disciplinas/optativa', exigeAdmin, async (req, res) => {
  const tipo = req.body?.tipo === 'PROFISSIONAL' ? 'Optativa Profissional' : 'Optativa Complementar'

  const [d] = await q<any>(
    `INSERT INTO disciplina (numero, nome)
     SELECT COALESCE(MAX(numero), 0) + 1, $1 || ' — #' || (COALESCE(MAX(numero), 0) + 1)
       FROM disciplina
     RETURNING id, numero, nome,
               ofertada_diurno  AS "ofertadaDiurno",
               ofertada_noturno AS "ofertadaNoturno",
               ensalar_diurno   AS "ensalarDiurno",
               ensalar_noturno  AS "ensalarNoturno"`,
    [tipo],
  )
  res.status(201).json({ disciplina: { ...d, turmas: 0 } })
})

/** Remove uma optativa criada a mais — só deixa apagar se ninguém pegou turma dela. */
rotasAdmin.delete('/disciplinas/:id', exigeAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ erro: 'Id inválido' })

  const apagada = await q<any>(
    `DELETE FROM disciplina d
      WHERE d.id = $1
        AND split_part(d.nome, ' — ', 1) IN ('Optativa Complementar', 'Optativa Profissional')
        AND NOT EXISTS (SELECT 1 FROM turma t WHERE t.disciplina_id = d.id)
      RETURNING id`,
    [id],
  )
  if (!apagada.length) {
    return res.status(400).json({ erro: 'Só dá pra remover optativa sem turma vinculada.' })
  }
  res.json({ ok: true })
})

/* -------------------------------- Usuários -------------------------------- */

rotasAdmin.get('/usuarios', exigeAdmin, async (_req, res) => {
  const usuarios = await q<any>(
    `SELECT u.id, u.nome, u.email, u.papel, u.ativo,
            (SELECT COUNT(*)::int FROM turma t WHERE t.professor_id = u.id) AS turmas
       FROM usuario u ORDER BY u.papel ASC, u.nome ASC`,
  )
  res.json({ usuarios })
})

rotasAdmin.post('/usuarios', exigeAdmin, async (req, res) => {
  const nome = String(req.body?.nome ?? '').trim()
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const senha = String(req.body?.senha ?? '')
  const papel = ['ADMIN', 'COORDENADOR'].includes(req.body?.papel) ? req.body.papel : 'PROFESSOR'

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

rotasAdmin.put('/usuarios/:id', exigeAdmin, async (req, res) => {
  const campos: string[] = []
  const valores: unknown[] = []
  const push = (coluna: string, valor: unknown) => {
    valores.push(valor)
    campos.push(`${coluna} = $${valores.length}`)
  }

  if (req.body?.nome) push('nome', String(req.body.nome).trim())
  if (req.body?.email) push('email', String(req.body.email).trim().toLowerCase())
  if (typeof req.body?.ativo === 'boolean') push('ativo', req.body.ativo)
  // Papel também dá pra trocar por aqui — é como promove um professor a coordenador
  // (ou volta atrás): PROFESSOR ganha o quadro/painel de leitura + gerar/apagar salas,
  // mas continua só editando a própria turma. Nunca deixa alguém se rebaixar sozinho.
  if (req.body?.papel && ['ADMIN', 'PROFESSOR', 'COORDENADOR'].includes(req.body.papel)) {
    if (req.params.id === req.usuario!.id) {
      return res.status(400).json({ erro: 'Você não pode mudar o seu próprio papel' })
    }
    push('papel', req.body.papel)
  }
  if (req.body?.senha) {
    const senha = String(req.body.senha)
    if (senha.length < 6) return res.status(400).json({ erro: 'A senha precisa ter ao menos 6 caracteres' })
    push('senha_hash', await bcrypt.hash(senha, 10))
  }
  if (!campos.length) return res.status(400).json({ erro: 'Nada para atualizar' })

  valores.push(req.params.id)
  const [usuario] = await q<any>(
    `UPDATE usuario SET ${campos.join(', ')} WHERE id = $${valores.length} RETURNING id, nome, email, papel, ativo`,
    valores,
  )
  if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado' })
  res.json({ usuario })
})

rotasAdmin.delete('/usuarios/:id', exigeAdmin, async (req, res) => {
  if (req.params.id === req.usuario!.id) return res.status(400).json({ erro: 'Você não pode remover a si mesmo' })
  await q('DELETE FROM usuario WHERE id = $1', [req.params.id])
  res.json({ ok: true })
})

/* --------------------------------- Turmas --------------------------------- */

rotasAdmin.post('/turmas', exigeAdmin, async (req, res) => {
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
rotasAdmin.post('/importar', exigeAdmin, async (req, res) => {
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
rotasAdmin.get('/atribuicao', exigeAdmin, async (_req, res) => {
  res.json({
    disciplinas: await disciplinasComDono(),
    professores: await atribuicaoAtual(),
    maximo: MAX_DISCIPLINAS,
  })
})

/** O administrador preenchendo pelo professor — mesma regra do que ele faria sozinho. */
rotasAdmin.post('/atribuicao/:professorId', exigeAdmin, async (req, res) => {
  // COORDENADOR também leciona (é professor com poderes extras de visualização e de
  // gerar salas) — sem ele aqui, salvar a grade de um coordenador dava "não encontrado"
  // e a alteração não chegava ao banco.
  const professor = await q1<any>(
    "SELECT id FROM usuario WHERE id = $1 AND papel IN ('PROFESSOR','ADMIN','COORDENADOR')",
    [req.params.professorId],
  )
  if (!professor) return res.status(404).json({ erro: 'Professor não encontrado' })

  const resultado = await atribuirDisciplinas(professor.id, lerItens(req.body?.itens))
  res.json({ ok: true, ...resultado })
})

rotasAdmin.put('/turmas/:id/professor', exigeAdmin, async (req, res) => {
  const professorId = req.body?.professorId ? String(req.body.professorId) : null
  const [turma] = await q<any>(
    'UPDATE turma SET professor_id = $1, atualizado_em = now() WHERE id = $2 RETURNING id, professor_id',
    [professorId, req.params.id],
  )
  if (!turma) return res.status(404).json({ erro: 'Turma não encontrada' })
  res.json({ ok: true, turma })
})

/* Excluir turma pede a senha do próprio admin logado (mesma checagem de /auth/senha) —
   é só pra evitar apagar sem querer ao clicar no "×" sem pensar, não é um controle de
   acesso à parte (quem chega até aqui já é admin). */
rotasAdmin.delete('/turmas/:id', exigeAdmin, async (req, res) => {
  const senha = String(req.body?.senha ?? '')
  if (!senha) return res.status(400).json({ erro: 'Confirme sua senha para excluir a turma' })

  const admin = await q1<{ senha_hash: string }>('SELECT senha_hash FROM usuario WHERE id = $1', [req.usuario!.id])
  if (!admin || !(await bcrypt.compare(senha, admin.senha_hash))) {
    return res.status(400).json({ erro: 'Senha incorreta' })
  }

  await q('DELETE FROM turma WHERE id = $1', [req.params.id])
  res.json({ ok: true })
})

/** Equivale ao "Apagar A5:B53" da planilha: zera os alunos de todas as turmas. */
rotasAdmin.post('/limpar-alunos', exigeAdmin, async (req, res) => {
  if (req.body?.confirmacao !== 'APAGAR') return res.status(400).json({ erro: 'Confirmação inválida' })

  const removidos = await q('DELETE FROM aluno RETURNING id')
  await q('DELETE FROM ensalamento')
  res.json({ ok: true, removidos: removidos.length })
})

/**
 * Zera o cadastro: apaga todas as contas de PROFESSOR e todas as turmas (com os
 * alunos, os gabaritos e as salas). Contas de administrador e as 60 disciplinas
 * ficam. Serve para recomeçar o semestre sem catar um a um.
 */
rotasAdmin.post('/limpar-professores', exigeAdmin, async (req, res) => {
  if (req.body?.confirmacao !== 'APAGAR') return res.status(400).json({ erro: 'Confirmação inválida' })

  const resumo = await transacao(async (exec) => {
    const professores = await exec<{ id: string }>(
      "SELECT id FROM usuario WHERE papel = 'PROFESSOR'",
    )
    const ids = professores.map((p) => p.id)

    const alunos = await exec('SELECT id FROM aluno')
    // toda turma nasce de um professor: sem eles, nenhuma turma faz sentido.
    // Apagar a turma leva junto os alunos e as alocações (cascata do banco).
    const turmas = await exec('DELETE FROM turma RETURNING id')
    if (ids.length) await exec('DELETE FROM usuario WHERE id = ANY($1::uuid[])', [ids])

    return { professores: ids.length, turmas: turmas.length, alunos: alunos.length }
  })

  // qualquer distribuição existente perdeu o chão
  await q('DELETE FROM ensalamento')
  res.json({ ok: true, ...resumo })
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
rotasAdmin.get('/export/resumo.csv', exigeAdmin, async (_req, res) => {
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
rotasAdmin.get('/export/gabaritos.csv', exigeAdmin, async (_req, res) => {
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
rotasAdmin.get('/export/salas/:dia/:turno', exigeAdmin, async (req, res) => {
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
