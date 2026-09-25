/* Telas do administrador: painel, turmas, professores, geração de salas e exportações. */

/** Uma tabela "Distribuição por dia" de um turno só (Diurno ou Noturno) — sem coluna de
 * turno porque já está no título do bloco. */
function montaTabelaPorDia(d, turno, titulo) {
  const linhas = d.porDia.filter((linha) => linha.turno === turno && linha.turmas > 0)

  return `<div class="cartao cantos" style="margin-bottom:22px"><div class="canto"></div>
    <div class="rotulo-secao" style="margin-bottom:14px">Distribuição por dia — ${esc(titulo)}</div>
    <table>
      <thead><tr><th>Dia</th><th>Turmas</th><th>Na mistura</th><th>Alunos</th><th>Salas previstas</th><th>Situação</th></tr></thead>
      <tbody>
        ${
          linhas
            .map((linha) => {
              const gerado = d.ensalamentos.find((e) => e.dia === linha.dia && e.turno === linha.turno)
              return `<tr>
                <td><strong>${esc(linha.rotulo)}</strong></td>
                <td>${linha.turmas}</td>
                <td>${linha.turmasEnsaladas}</td>
                <td>${linha.alunos}</td>
                <td class="texto-2">${linha.salasPrevistas || '—'}</td>
                <td>${
                  !gerado
                    ? '<span class="pill neutro">não gerado</span>'
                    : gerado.desatualizado
                      ? '<span class="pill alerta">desatualizado — gere de novo</span>'
                      : `<span class="pill ok">${gerado.totalSalas} sala${gerado.totalSalas === 1 ? '' : 's'} gerada${gerado.totalSalas === 1 ? '' : 's'}</span>`
                }</td>
              </tr>`
            })
            .join('') ||
          '<tr><td colspan="6" class="texto-3">Nenhuma turma com dia definido ainda.</td></tr>'
        }
      </tbody>
    </table>
  </div>`
}

/** Resumo por professor: quantas disciplinas (turmas) ele tem e as pendências de cada
 * uma (sem aluno cadastrado, gabarito incompleto) — pra saber quem cobrar sem abrir
 * turma por turma. A linha "Geral" no topo é a mesma conta somando todo mundo. */
function montaResumoPorProfessor(d) {
  // Cada dimensão (aluno, gabarito) mostra o próprio selo — vermelho/laranja quando falta
  // alguma coisa, verde quando aquela dimensão está 100% ok, mesmo que a outra não esteja.
  const selo = (n, rotuloFalta, rotuloOk) =>
    n
      ? `<span class="pill alerta" style="margin:1px 4px 1px 0">${n} ${rotuloFalta}</span>`
      : `<span class="pill ok" style="margin:1px 4px 1px 0">${rotuloOk}</span>`

  const linha = (nome, p, destaque = false) => `
    <tr>
      <td>${destaque ? `<strong>${esc(nome)}</strong>` : esc(nome)}</td>
      <td>${p.turmas} disciplina${p.turmas === 1 ? '' : 's'} cadastrada${p.turmas === 1 ? '' : 's'}</td>
      <td>
        ${
          p.turmas
            ? `${selo(p.semAluno, 'sem aluno cadastrado', '100% com aluno cadastrado')}
               ${selo(p.semGabarito, 'sem gabarito', '100% com gabarito completo')}
               ${selo(p.semProva, 'sem prova anexada', '100% com prova anexada')}`
            : '<span class="pill neutro">sem disciplina cadastrada</span>'
        }
      </td>
    </tr>`

  return `<div class="cartao cantos" style="margin-bottom:22px"><div class="canto"></div>
    <div class="rotulo-secao" style="margin-bottom:14px">Resumo por professor</div>
    <table>
      <thead><tr><th>Professor</th><th>Disciplinas</th><th>Pendências</th></tr></thead>
      <tbody>
        ${linha('Geral (todo o curso)', d.resumoGeral, true)}
        ${
          d.porProfessor.length
            ? d.porProfessor.map((p) => linha(nomeExibicao(p.nome), p)).join('')
            : '<tr><td colspan="3" class="texto-3">Nenhum professor com disciplina cadastrada ainda.</td></tr>'
        }
      </tbody>
    </table>
  </div>`
}

async function viewPainel() {
  const d = await api('/admin/dashboard')

  const metrica = (valor, rotulo) => `
    <div class="cartao cantos metrica"><div class="canto"></div>
      <div class="valor">${valor}</div><div class="rotulo">${rotulo}</div>
    </div>`

  const pendencias = []
  if (d.totais.semProfessor) pendencias.push(`${d.totais.semProfessor} turma(s) sem professor vinculado`)
  if (d.totais.semDia) pendencias.push(`${d.totais.semDia} turma(s) sem dia de prova`)
  if (d.totais.semGabarito) pendencias.push(`${d.totais.semGabarito} turma(s) com gabarito incompleto`)

  el('conteudo').innerHTML = `
    <div class="rotulo-secao">Painel</div>
    <h2 class="titulo">Visão geral do semestre</h2>

    <div class="grade g4" style="margin-bottom:22px">
      ${metrica(d.totais.turmas, 'turmas')}
      ${metrica(d.totais.alunos, 'alunos')}
      ${metrica(d.totais.professores, 'professores')}
      ${metrica(d.totais.disciplinas, 'disciplinas')}
    </div>

    ${
      pendencias.length
        ? `<div class="aviso info"><strong>Pendências antes de gerar as salas:</strong><br />${pendencias.join('<br />')}</div>`
        : '<div class="aviso ok">Tudo preenchido — pode gerar as salas.</div>'
    }

    ${montaResumoPorProfessor(d)}

    ${montaTabelaPorDia(d, 'DIURNO', 'Manhã (diurno)')}
    ${montaTabelaPorDia(d, 'NOTURNO', 'Noite (noturno)')}

    <div class="cartao cantos"><div class="canto"></div>
      <div class="rotulo-secao" style="margin-bottom:14px">Exportações</div>
      <div class="linha-botoes">
        <button class="secundaria" onclick="baixar('/admin/export/resumo.csv')">Resumo geral (cartão-resposta)</button>
        <button class="secundaria" onclick="baixar('/admin/export/gabaritos.csv')">Gabaritos</button>
      </div>
      <p class="pequeno texto-3" style="margin-top:12px">
        O resumo sai com CURSO, DISCIPLINA, PROFESSOR, RA, CÓDIGO DE BARRAS, NOME e TURNO —
        o mesmo formato que a planilha gerava.
      </p>
    </div>`
}

/* ------------------------------ quadro de turmas ----------------------------- */

/**
 * Monta o quadro visual (período × dia da semana) de um curso, num turno só. O Ciclo
 * Básico entra nos quadros dos dois cursos — a mesma turma pode aparecer em Eng. Civil
 * e em Eng. Produção, com o mesmo professor repetido, porque quem preenche escolhe o
 * curso na hora. Cada período tem sua própria faixa de cor, intercalando clara/escura,
 * pra ficar fácil de acompanhar a linha com o olho.
 */
/**
 * Célula de uma turma dentro dos quadros: professor + disciplina (ou turno, no quadro
 * de optativas) centralizados, com duas linhas embaixo — bolinha + texto, uma embaixo
 * da outra — pra "tem aluno cadastrado" (mais importante, é o que interessa pra prova
 * acontecer) e "gabarito completo" (menos importante). Cada bolinha verde quando ok e
 * vermelha quando falta. Nome do professor e da disciplina ficam acinzentados quando a
 * turma está fora da mistura de salas — cor discreta, que não compete com o vermelho das
 * bolinhas de pendência. Centraliza aqui pra não repetir em cada quadro.
 */
function celulaTurma(t, linhaSecundaria = nomeCompactoDisciplina(t.disciplina)) {
  const okAlunos = t.totalAlunos > 0
  const okGabarito = t.gabaritoCompleto

  // Coordenador vê o quadro inteiro, mas só abre (pra editar gabarito/alunos) a turma
  // que é dele — igual um professor comum. Excluir turma continua exclusivo do admin.
  const ehDona = !!(t.professor && usuarioAtual && t.professor.id === usuarioAtual.id)
  const podeAbrir = ehAdmin() || ehDona
  const podeExcluir = ehAdmin()

  const linhaStatus = (ok, rotuloOk, rotuloFalta) => `
    <div class="pequeno" style="display:flex;align-items:center;gap:5px">
      <span class="bolinha ${ok ? 'bolinha-ok' : 'bolinha-erro'}"></span>
      <span class="${ok ? 'texto-3' : 'texto-bolinha-erro'}">${ok ? rotuloOk : rotuloFalta}</span>
    </div>`

  return `<div class="celula-turma" style="margin-bottom:8px;text-align:center;cursor:${podeAbrir ? 'pointer' : 'default'}"
      ${podeAbrir ? `data-abrir="${t.id}"` : ''}
      ${t.ensalar ? '' : 'title="Fora da mistura de salas"'}>
    <strong class="linha-1 ${t.ensalar ? '' : 'texto-nao-misturada'}" title="${t.professor ? esc(nomeExibicao(t.professor.nome)) : ''}">${
      t.professor ? esc(nomeCompactoProfessor(t.professor.nome)) : '<span class="texto-3">sem professor</span>'
    }</strong>
    <span class="pequeno linha-1 nome-disciplina ${t.ensalar ? '' : 'texto-nao-misturada'}" title="${esc(t.disciplina)}">${esc(linhaSecundaria)}</span>
    <div style="display:inline-flex;flex-direction:column;align-items:flex-start;gap:2px;margin-top:4px">
      ${linhaStatus(okAlunos, 'Turma cadastrada', 'Sem aluno cadastrado')}
      ${linhaStatus(okGabarito, 'Gabarito cadastrado', 'Gabarito incompleto')}
    </div>
    ${
      podeExcluir
        ? `<div><button class="mini excluir-turma" data-excluir="${t.id}" title="Excluir turma">×</button></div>`
        : ''
    }
  </div>`
}

// Optativa Profissional sai do quadro por período — ela é só do 8º/9º período de Civil
// e Produção, então duas seções dela colidiam de olhar (fica um quadro só dela, ver
// montaQuadroOptativas). A Optativa Complementar continua no quadro normal, no 1º
// período do Ciclo Básico, junto com as outras disciplinas.
const OPTATIVAS_BASE = new Set(['Optativa Profissional'])

function montaQuadroCursoTurno(turmas, curso, turno, rotuloCurso) {
  const indice = indicePeriodos(curso)
  const relevantes = turmas.filter(
    (t) =>
      (t.curso === 'CICLO_BASICO' || t.curso === curso) &&
      t.turno === turno &&
      !OPTATIVAS_BASE.has(t.disciplina.split(' — ')[0]),
  )

  // período -> dia -> turma[]
  const porPeriodo = new Map()
  for (const t of relevantes) {
    // disciplina com nome completado (ex.: "Optativa Complementar — Libras") ainda
    // precisa achar o período pelo nome-base, antes do " — ".
    const periodo = indice.get(chaveSimples(t.disciplina.split(' — ')[0]))
    if (!periodo) continue
    if (!porPeriodo.has(periodo)) porPeriodo.set(periodo, new Map())
    const bucket = porPeriodo.get(periodo)
    const dia = t.diaSemana || ''
    if (!bucket.has(dia)) bucket.set(dia, [])
    bucket.get(dia).push(t)
  }

  const periodos = [...porPeriodo.keys()].sort((a, b) => a - b)
  if (!periodos.length) return ''

  const linhas = periodos.map((periodo, i) => {
    const porDia = porPeriodo.get(periodo)
    return `<tr class="${i % 2 === 0 ? 'linha-periodo-a' : 'linha-periodo-b'}">
      <td class="texto-2" style="white-space:nowrap"><strong>${periodo}º Período</strong></td>
      ${DIAS.map((dia) => {
        const itens = porDia.get(dia) || []
        if (!itens.length) return '<td></td>'
        return `<td>${itens.map((t) => celulaTurma(t)).join('')}</td>`
      }).join('')}
    </tr>`
  })

  return `<div class="cartao cantos quadro-turmas" style="margin-bottom:22px; overflow-x:auto"><div class="canto"></div>
    <div class="rotulo-secao" style="margin-bottom:14px">${esc(rotuloCurso)} · ${ROTULO_TURNO[turno]}</div>
    <table>
      <thead><tr><th></th>${DIAS.map((d) => `<th>${esc(ROTULO_DIA[d].slice(0, 3))}</th>`).join('')}</tr></thead>
      <tbody>${linhas.join('')}</tbody>
    </table>
  </div>`
}

/**
 * Quadro à parte só da Optativa Profissional. Ela é comum a Eng. Civil e Eng. Produção
 * (8º/9º período dos dois), então ficava esquisita dentro do quadro de um curso só —
 * aqui é uma linha por optativa (pode ter mais de uma "Optativa Profissional" rodando
 * no mesmo semestre), com o dia da semana nas colunas. Assim dá pra ver de cara se duas
 * caem no mesmo dia — e, dentro da célula, no mesmo turno — antes de bater de frente na
 * agenda de alguém.
 */
function montaQuadroOptativas(turmas) {
  const relevantes = turmas.filter((t) => OPTATIVAS_BASE.has(t.disciplina.split(' — ')[0]))
  if (!relevantes.length) return ''

  const porOptativa = new Map()
  for (const t of relevantes) {
    if (!porOptativa.has(t.disciplina)) porOptativa.set(t.disciplina, new Map())
    const bucket = porOptativa.get(t.disciplina)
    const dia = t.diaSemana || ''
    if (!bucket.has(dia)) bucket.set(dia, [])
    bucket.get(dia).push(t)
  }

  const nomes = [...porOptativa.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const linhas = nomes.map((nome, i) => {
    const porDia = porOptativa.get(nome)
    return `<tr class="${i % 2 === 0 ? 'linha-periodo-a' : 'linha-periodo-b'}">
      <td class="texto-2" style="white-space:nowrap"><strong>${esc(nome)}</strong></td>
      ${DIAS.map((dia) => {
        const itens = porDia.get(dia) || []
        if (!itens.length) return '<td></td>'
        return `<td>${itens.map((t) => celulaTurma(t, ROTULO_TURNO[t.turno] || t.turno)).join('')}</td>`
      }).join('')}
    </tr>`
  })

  return `<div class="cartao cantos quadro-turmas" style="margin-bottom:22px; overflow-x:auto"><div class="canto"></div>
    <div class="rotulo-secao" style="margin-bottom:6px">Optativa Profissional</div>
    <p class="pequeno texto-3" style="margin-bottom:14px">
      Fica num quadro à parte porque é comum a Civil e Produção — assim dá pra ver de
      cara se duas seções caem no mesmo dia (e, na célula, no mesmo turno) antes de
      virar choque de horário.
    </p>
    <table>
      <thead><tr><th></th>${DIAS.map((d) => `<th>${esc(ROTULO_DIA[d].slice(0, 3))}</th>`).join('')}</tr></thead>
      <tbody>${linhas.join('')}</tbody>
    </table>
  </div>`
}

/** Quatro quadros por período (Civil-noite, Produção-noite, Civil-manhã, Produção-manhã —
 * noturno primeiro) mais um quadro à parte só das optativas. */
function montaQuadroTurmas(turmas) {
  return [
    montaQuadroCursoTurno(turmas, 'ENG_CIVIL', 'NOTURNO', 'Eng. Civil'),
    montaQuadroCursoTurno(turmas, 'ENG_PRODUCAO', 'NOTURNO', 'Eng. de Produção'),
    montaQuadroCursoTurno(turmas, 'ENG_CIVIL', 'DIURNO', 'Eng. Civil'),
    montaQuadroCursoTurno(turmas, 'ENG_PRODUCAO', 'DIURNO', 'Eng. de Produção'),
    montaQuadroOptativas(turmas),
  ].join('')
}

/* ---------------------------------- turmas ---------------------------------- */

/**
 * Disciplinas ofertadas num turno que ainda não têm professor/turma — a única coisa que
 * os quadros por período não conseguem mostrar (não tem turma pra desenhar). O resto
 * (professor, gabarito, alunos, mistura) já está nos quadros, então essa lista virou só
 * isso, pra não duplicar informação.
 */
function blocoSemProfessorPorTurno(disciplinas, turmas, turno, titulo) {
  const chaveOferta = turno === 'DIURNO' ? 'ofertadaDiurno' : 'ofertadaNoturno'
  const semProfessor = disciplinas.filter(
    (d) => d[chaveOferta] && !turmas.some((t) => t.numero === d.numero && t.turno === turno),
  )
  if (!semProfessor.length) return ''

  const linhas = semProfessor
    .map(
      (d) => `<tr>
        <td class="texto-3">${d.numero}</td>
        <td>${esc(d.nome)}</td>
      </tr>`,
    )
    .join('')

  return `<div class="cartao cantos" style="margin-bottom:22px"><div class="canto"></div>
    <div class="rotulo-secao" style="margin-bottom:6px">Sem professor cadastrado — ${esc(titulo)}</div>
    <p class="pequeno texto-3" style="margin-bottom:14px">
      ${semProfessor.length} disciplina${semProfessor.length === 1 ? '' : 's'} ofertada${semProfessor.length === 1 ? '' : 's'}
      neste turno que ainda ninguém escolheu — configure em <em>Cadastro em lote</em>.
    </p>
    <table>
      <thead><tr><th style="width:40px">Nº</th><th>Disciplina</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
  </div>`
}

async function viewAdminTurmas() {
  // ?todas=1: pro coordenador ver todas as turmas aqui (sem o parâmetro ele só veria as
  // dele, igual em "Minhas turmas") — pro admin não muda nada, ele já via todas.
  const [{ turmas }, { disciplinas }] = await Promise.all([api('/turmas?todas=1'), api('/admin/disciplinas')])

  el('conteudo').innerHTML = `
    <div class="rotulo-secao">Turmas</div>
    <h2 class="titulo">${turmas.length} turma${turmas.length === 1 ? '' : 's'} cadastrada${turmas.length === 1 ? '' : 's'}</h2>
    <p class="pequeno texto-3" style="margin:-10px 0 20px">
      As turmas nascem quando um professor escolhe as disciplinas dele — em
      <em>Cadastro em lote</em> você faz isso por ele, se precisar. Clique numa turma nos
      quadros abaixo pra abrir ela. Duas bolinhas por turma: a primeira é se já tem
      <strong>aluno cadastrado</strong>, a segunda se o <strong>gabarito</strong> está
      completo — <strong class="texto-bolinha-ok">verde</strong> quando ok,
      <strong class="texto-bolinha-erro">vermelha</strong> quando falta. Professor e
      disciplina em <strong class="texto-fora-mistura">laranja</strong> estão fora da
      mistura de salas.
    </p>

    ${montaQuadroTurmas(turmas)}

    ${blocoSemProfessorPorTurno(disciplinas, turmas, 'DIURNO', 'Manhã (diurno)')}
    ${blocoSemProfessorPorTurno(disciplinas, turmas, 'NOTURNO', 'Noite (noturno)')}

    ${
      !disciplinas.some((d) => d.ofertadaDiurno || d.ofertadaNoturno)
        ? '<div class="cartao cantos"><div class="canto"></div><div class="vazio">Nenhuma disciplina ofertada ainda — configure em Cadastro em lote → Oferta do semestre.</div></div>'
        : ''
    }`

  document.querySelectorAll('[data-abrir]').forEach((tr) => {
    tr.onclick = (ev) => {
      if (ev.target.dataset.excluir) return
      irPara(`turma/${tr.dataset.abrir}`)
    }
  })

  // Excluir turma pede a senha do próprio admin antes de apagar — evita clicar no "×"
  // sem querer e perder a turma e os alunos dela sem chance de voltar atrás.
  document.querySelectorAll('[data-excluir]').forEach((b) => {
    b.onclick = async (ev) => {
      ev.stopPropagation()
      const senha = prompt('Digite sua senha para excluir esta turma e todos os alunos dela:')
      if (senha === null) return
      if (!senha) { avisar('Informe a senha para excluir.', 'erro'); return }
      try {
        await api(`/admin/turmas/${b.dataset.excluir}`, { method: 'DELETE', body: { senha } })
      } catch (e) {
        avisar(e.message || 'Não foi possível excluir a turma.', 'erro')
        return
      }
      await viewAdminTurmas()
      avisar('Turma excluída.')
    }
  })
}

/* -------------------------------- ensalamento ------------------------------- */

let diaSelecionado = 'SEGUNDA'
let turnoSelecionado = 'NOTURNO'
let ordenacaoSalas = 'alfabetica'

async function viewSalas() {
  const painel = await api('/admin/dashboard')
  const info = painel.porDia.find((p) => p.dia === diaSelecionado && p.turno === turnoSelecionado)

  el('conteudo').innerHTML = `
    <div class="rotulo-secao nao-imprime">Ensalamento</div>
    <h2 class="titulo nao-imprime">Gerar salas</h2>

    <div class="cartao cantos nao-imprime" style="margin-bottom:22px"><div class="canto"></div>
      <div class="grade g4" style="margin-bottom:16px">
        <label class="campo" style="margin:0"><span>Dia da prova</span>
          <select id="e-dia">
            ${DIAS.map((d) => `<option value="${d}"${d === diaSelecionado ? ' selected' : ''}>${ROTULO_DIA[d]}</option>`).join('')}
          </select>
        </label>
        <label class="campo" style="margin:0"><span>Turno</span>
          ${selectTurnos(turnoSelecionado, 'id="e-turno"')}
        </label>
        <label class="campo" style="margin:0"><span>Alunos por sala (máximo)</span>
          <input id="e-cap" type="number" min="2" max="60" value="15" />
        </label>
        <div style="display:flex;align-items:flex-end;gap:8px">
          <button class="acao" id="e-gerar" style="width:100%">Criar salas</button>
          <button class="secundaria perigo" id="e-apagar" style="width:100%">Apagar salas geradas</button>
        </div>
      </div>
      <p class="pequeno texto-3" id="e-info">
        ${info.alunos} aluno(s) na mistura de ${esc(info.rotulo)} — ${esc(info.rotuloTurno.toLowerCase())}
        · ${info.turmasEnsaladas} turma(s).
        Cada turno é ensalado separado, então ninguém do diurno cai numa sala do noturno.
      </p>
    </div>

    <div id="e-resultado"></div>`

  el('e-dia').onchange = () => {
    diaSelecionado = el('e-dia').value
    viewSalas()
  }

  el('e-turno').onchange = () => {
    turnoSelecionado = el('e-turno').value
    viewSalas()
  }

  const semSalas = () => {
    el('e-resultado').innerHTML =
      '<div class="cartao cantos"><div class="canto"></div><div class="vazio">Nenhuma sala gerada para este dia e turno ainda.</div></div>'
  }

  el('e-gerar').onclick = async () => {
    const alvo = `${ROTULO_DIA[diaSelecionado]} — ${ROTULO_TURNO[turnoSelecionado].toLowerCase()}`
    if (!confirm(`Gerar as salas de ${alvo}? Isso substitui a distribuição anterior desse dia e turno.`)) return
    try {
      const r = await api(`/admin/ensalamento/${diaSelecionado}/${turnoSelecionado}`, {
        method: 'POST',
        body: { capacidade: Number(el('e-cap').value) || 15 },
      })
      desenhaSalas(r.ensalamento)
      avisar(`${r.ensalamento.totalSalas} salas criadas para ${r.ensalamento.totalAlunos} alunos. Baixando o PDF…`)
      // além de mostrar na tela, já entrega o PDF pronto para imprimir (uma sala por folha)
      baixar(`/admin/ensalamento/${diaSelecionado}/${turnoSelecionado}/pdf?ordem=${ordenacaoSalas}`)
    } catch (e) {
      avisar(e.message, 'erro')
    }
  }

  el('e-apagar').onclick = async () => {
    const alvo = `${ROTULO_DIA[diaSelecionado]} — ${ROTULO_TURNO[turnoSelecionado].toLowerCase()}`
    if (!confirm(`Apagar as salas geradas de ${alvo}? Só apaga a distribuição — as turmas e os alunos continuam.`)) return
    try {
      await api(`/admin/ensalamento/${diaSelecionado}/${turnoSelecionado}`, { method: 'DELETE' })
      semSalas()
      avisar('Salas apagadas.')
    } catch (e) {
      avisar(e.message, 'erro')
    }
  }

  try {
    const r = await api(`/admin/ensalamento/${diaSelecionado}/${turnoSelecionado}`)
    desenhaSalas(r.ensalamento)
  } catch {
    semSalas()
  }
}

function desenhaSalas(ensalamento) {
  const alvo = el('e-resultado')
  const porDisciplina = ordenacaoSalas === 'disciplina'

  const salas = ensalamento.salas
    .map((sala) => {
      const lista = porDisciplina ? sala.porDisciplina : sala.alunos
      return `
        <div class="sala">
          <header>
            <span>${esc(sala.rotulo)}</span>
            <small>${lista.length} alunos</small>
          </header>
          <ol>
            ${lista
              .map(
                (a) => `<li>
                  <span class="ra">${esc(a.matricula)}</span>
                  <span>${esc(a.nome)}</span>
                  <span class="disc">${esc(a.disciplina)}</span>
                </li>`,
              )
              .join('')}
          </ol>
          <div class="resumo">
            ${sala.resumo.map((r) => `<span>${esc(r.disciplina)} <strong>${r.quantidade}</strong></span>`).join('')}
          </div>
        </div>`
    })
    .join('')

  alvo.innerHTML = `
    <div class="cartao cantos" style="margin-bottom:18px"><div class="canto"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap">
        <div>
          <div class="rotulo-secao">${esc(ROTULO_DIA[ensalamento.diaSemana])} — ${esc(ROTULO_TURNO[ensalamento.turno] || ensalamento.turno)}</div>
          <h3 style="margin:0">${ensalamento.totalSalas} salas · ${ensalamento.totalAlunos} alunos</h3>
          <p class="pequeno texto-3" style="margin-top:4px">
            Gerado em ${new Date(ensalamento.criadoEm).toLocaleString('pt-BR')}
          </p>
        </div>
        <div class="linha-botoes nao-imprime">
          <button class="secundaria" id="o-alfa" ${!porDisciplina ? 'style="border-color:var(--acento)"' : ''}>Ordem alfabética</button>
          <button class="secundaria" id="o-disc" ${porDisciplina ? 'style="border-color:var(--acento)"' : ''}>Por disciplina</button>
          <button class="secundaria" onclick="window.print()">Imprimir</button>
          <button class="acao" onclick="baixar('/admin/ensalamento/${ensalamento.diaSemana}/${ensalamento.turno}/pdf?ordem=${ordenacaoSalas}')">PDF (1 sala por folha)</button>
          <button class="secundaria" onclick="baixar('/admin/export/salas/${ensalamento.diaSemana}/${ensalamento.turno}')">CSV</button>
        </div>
      </div>
    </div>
    <div class="salas">${salas}</div>`

  el('o-alfa').onclick = () => { ordenacaoSalas = 'alfabetica'; desenhaSalas(ensalamento) }
  el('o-disc').onclick = () => { ordenacaoSalas = 'disciplina'; desenhaSalas(ensalamento) }
}

/* ------------------------------ cadastro em lote ----------------------------- */

async function viewImportar() {
  const { disciplinas } = await api('/admin/disciplinas')

  el('conteudo').innerHTML = `
    <div class="rotulo-secao">Cadastro em lote</div>
    <h2 class="titulo">Cadastrar professores</h2>

    <div class="cartao cantos" style="margin-bottom:22px"><div class="canto"></div>
      <div class="rotulo-secao" style="margin-bottom:6px">Cole a lista</div>
      <p class="pequeno texto-3" style="margin-bottom:10px">
        Uma linha por professor, três colunas nesta ordem:<br />
        <span class="mono">NOME DO PROFESSOR ; E-MAIL ; SENHA</span>
      </p>
      <p class="pequeno texto-3" style="margin-bottom:12px">
        Separador: <strong>tabulação</strong> (colando direto do Excel),
        <strong>ponto e vírgula</strong> ou <strong>barra vertical</strong>.
        A senha é opcional — sem ela entra a senha padrão do campo abaixo.
        Professor que já existe é reaproveitado, sem mexer na senha dele.
        As disciplinas, o dia e o turno ficam para a grade logo abaixo, ou para o
        próprio professor preencher ao entrar.
      </p>

      <textarea id="i-texto" style="min-height:170px" placeholder="Ana Paula Moreira; ana.moreira@soulasalle.com.br
Ricardo Teixeira; ricardo.teixeira@soulasalle.com.br
Helena Vasques; helena.vasques@soulasalle.com.br; outrasenha"></textarea>

      <div class="grade g2" style="margin-top:14px">
        <label class="campo" style="margin:0"><span>Senha padrão (quando a coluna vier vazia)</span>
          <input id="i-senha" value="000000" />
        </label>
        <div style="display:flex;align-items:flex-end;gap:10px">
          <button class="secundaria" id="i-conferir" style="flex:1">Conferir</button>
          <button class="acao" id="i-aplicar" style="flex:1">Cadastrar</button>
        </div>
      </div>
    </div>

    <div id="i-resultado"></div>

    <div id="i-grade" style="margin-top:22px"></div>

    <div class="cartao cantos" style="margin-top:22px"><div class="canto"></div>
      <div class="rotulo-secao" style="margin-bottom:6px">Oferta do semestre</div>
      <p class="pequeno texto-3" style="margin-bottom:12px">
        Marque, por disciplina, em qual turno ela é oferecida este semestre — <strong>diurno</strong>,
        <strong>noturno</strong>, os dois ou nenhum. Só o que estiver marcado aparece na lista de
        escolha dos professores <em>naquele turno</em>. Desmarcar não apaga nada: turma que já
        existe continua como está. Ao lado de cada turno tem uma caixinha
        <strong class="cor-mistura-diurno">mistura</strong> — decide se as turmas <em>daquele turno</em>
        dessa disciplina entram no sorteio de salas. Só aparece se o turno estiver ofertado
        (não dá pra misturar turma que não existe). Nas optativas, o campinho ao lado do nome
        é o assunto deste semestre — o que você digitar vira o final do nome dela (ex.:
        "Optativa Complementar — Libras").
      </p>

      <div class="linha-botoes" style="margin-bottom:12px;flex-wrap:wrap">
        <button class="secundaria" id="o-todas-d" style="padding:5px 12px;font-size:12px">marcar diurno (todas)</button>
        <button class="secundaria" id="o-nenhuma-d" style="padding:5px 12px;font-size:12px">desmarcar diurno</button>
        <button class="secundaria" id="o-todas-n" style="padding:5px 12px;font-size:12px">marcar noturno (todas)</button>
        <button class="secundaria" id="o-nenhuma-n" style="padding:5px 12px;font-size:12px">desmarcar noturno</button>
        <span class="pequeno texto-3" id="o-contagem"></span>
      </div>

      <div style="display:flex;gap:10px;align-items:center;padding:0 12px 6px;font-size:12px">
        <span class="texto-3" style="flex:1">Disciplina</span>
        <span class="texto-3" style="width:64px;text-align:center">Diurno</span>
        <span class="texto-3 cor-mistura-diurno" style="width:64px;text-align:center">Mistura</span>
        <span class="texto-3" style="width:64px;text-align:center">Noturno</span>
        <span class="texto-3 cor-mistura-noturno" style="width:64px;text-align:center">Mistura</span>
      </div>
      <div class="lista-oferta" id="o-lista"></div>

      <div class="linha-botoes" style="margin-top:10px">
        <button class="secundaria" id="o-add-complementar" style="padding:6px 14px;font-size:12px">
          + Optativa Complementar
        </button>
        <button class="secundaria" id="o-add-profissional" style="padding:6px 14px;font-size:12px">
          + Optativa Profissional
        </button>
      </div>

      <button class="acao" id="o-salvar" style="margin-top:14px">Salvar oferta</button>
    </div>`

  async function enviar(modo) {
    const texto = el('i-texto').value
    if (!texto.trim()) return avisar('Cole a lista primeiro.', 'erro')

    try {
      const r = await api('/admin/importar', {
        method: 'POST',
        body: { texto, senhaPadrao: el('i-senha').value, modo },
      })
      desenhaImportacao(r)
      if (r.aplicado) {
        const senhas = {}
        r.linhas.filter((l) => !l.erro).forEach((l) => (senhas[l.email] = l.senha))
        await montaGradeAtribuicao('i-grade', senhas)
        avisar(
          `${r.resumo.professoresNovos} professor(es) cadastrado(s)` +
            (r.resumo.professoresExistentes ? `, ${r.resumo.professoresExistentes} já existia(m).` : '.'),
        )
      }
    } catch (e) {
      avisar(e.message, 'erro')
    }
  }

  /* ------------------------------ oferta do semestre ----------------------------- */

  // Disciplina que já tem turma cadastrada NAQUELE turno não pode ter a oferta desligada
  // dele — ficaria uma turma de verdade (com professor, com aluno) marcada como "fora
  // da oferta", que foi exatamente a inconsistência que apareceu em Física Geral e
  // Experimental I. Essas travam sempre marcadas; o servidor também impede de novo no
  // salvamento, caso alguém tente contornar a tela.
  const travadasDiurno = new Set(disciplinas.filter((d) => d.turmasDiurno > 0).map((d) => d.id))
  const travadasNoturno = new Set(disciplinas.filter((d) => d.turmasNoturno > 0).map((d) => d.id))

  const ofertadasDiurno = new Set(disciplinas.filter((d) => d.ofertadaDiurno || travadasDiurno.has(d.id)).map((d) => d.id))
  const ofertadasNoturno = new Set(disciplinas.filter((d) => d.ofertadaNoturno || travadasNoturno.has(d.id)).map((d) => d.id))
  const misturaDiurno = new Set(disciplinas.filter((d) => d.ensalarDiurno !== false).map((d) => d.id))
  const misturaNoturno = new Set(disciplinas.filter((d) => d.ensalarNoturno !== false).map((d) => d.id))

  function atualizaContagem() {
    el('o-contagem').textContent =
      `${ofertadasDiurno.size} diurno · ${ofertadasNoturno.size} noturno · de ${disciplinas.length} disciplinas`
  }

  // Não dá pra ensalar turno que a disciplina nem oferece — some com a marcação
  // pra ninguém confundir "desligado" com "não existe".
  function corrigeMistura(id) {
    if (!ofertadasDiurno.has(id)) misturaDiurno.delete(id)
    if (!ofertadasNoturno.has(id)) misturaNoturno.delete(id)
  }
  disciplinas.forEach((d) => corrigeMistura(d.id))

  // "Optativa Complementar" e "Optativa Profissional" mudam de assunto a cada semestre —
  // um campinho ao lado deixa digitar o nome específico, que vira o final do nome dela
  // ("Optativa Complementar — Libras"). O nome digitado é guardado aqui, não em d.nome,
  // até salvar.
  function nomeBase(nome) {
    const i = nome.indexOf(' — ')
    return i === -1 ? nome : nome.slice(0, i)
  }
  const OPTATIVAS = new Set(['Optativa Complementar', 'Optativa Profissional'])
  const complementos = new Map(
    disciplinas
      .filter((d) => OPTATIVAS.has(nomeBase(d.nome)))
      .map((d) => [d.id, d.nome.includes(' — ') ? d.nome.slice(d.nome.indexOf(' — ') + 3) : '']),
  )

  function desenhaOferta() {
    el('o-lista').innerHTML = disciplinas
      .map((d) => {
        const diurno = ofertadasDiurno.has(d.id)
        const noturno = ofertadasNoturno.has(d.id)
        const fora = !diurno && !noturno
        const editavel = complementos.has(d.id)
        return `
          <label class="item-oferta ${fora ? 'fora' : ''}" style="display:flex;gap:10px;align-items:center">
            <span style="flex:1;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span><span class="num">${d.numero}</span> ${esc(editavel ? nomeBase(d.nome) : d.nome)}
              ${
                d.turmas
                  ? `<span class="pill neutro" title="${d.turmasDiurno} de dia · ${d.turmasNoturno} de noite">
                       ${d.turmas} turma${d.turmas === 1 ? '' : 's'}
                     </span>`
                  : ''
              }</span>
              ${
                editavel
                  ? `<input type="text" data-complemento="${d.id}" value="${esc(complementos.get(d.id))}"
                       placeholder="nome deste semestre" style="flex:1;min-width:140px;max-width:260px;padding:5px 9px;font-size:13px" />
                     ${
                       d.turmas
                         ? ''
                         : `<button type="button" class="mini" data-remover-optativa="${d.id}" title="Remover esta optativa">×</button>`
                     }`
                  : ''
              }
            </span>
            <span style="width:64px;text-align:center">
              <input type="checkbox" data-oferta-diurno="${d.id}" ${diurno ? 'checked' : ''}
                ${travadasDiurno.has(d.id) ? 'disabled title="Já tem turma cadastrada de dia — não dá pra tirar da oferta sem excluir a turma primeiro"' : ''} />
            </span>
            <span style="width:64px;text-align:center">
              ${
                diurno
                  ? `<input type="checkbox" class="chk-mistura-diurno" data-mistura-diurno="${d.id}"
                       ${misturaDiurno.has(d.id) ? 'checked' : ''} title="Entra no sorteio de salas (diurno)" />`
                  : ''
              }
            </span>
            <span style="width:64px;text-align:center">
              <input type="checkbox" data-oferta-noturno="${d.id}" ${noturno ? 'checked' : ''}
                ${travadasNoturno.has(d.id) ? 'disabled title="Já tem turma cadastrada de noite — não dá pra tirar da oferta sem excluir a turma primeiro"' : ''} />
            </span>
            <span style="width:64px;text-align:center">
              ${
                noturno
                  ? `<input type="checkbox" class="chk-mistura-noturno" data-mistura-noturno="${d.id}"
                       ${misturaNoturno.has(d.id) ? 'checked' : ''} title="Entra no sorteio de salas (noturno)" />`
                  : ''
              }
            </span>
          </label>`
      })
      .join('')

    atualizaContagem()

    el('o-lista').querySelectorAll('[data-oferta-diurno]').forEach((c) => {
      c.onchange = () => {
        const id = Number(c.dataset.ofertaDiurno)
        if (travadasDiurno.has(id)) return desenhaOferta() // já tem turma — não desliga
        c.checked ? ofertadasDiurno.add(id) : ofertadasDiurno.delete(id)
        corrigeMistura(id)
        desenhaOferta()
      }
    })

    el('o-lista').querySelectorAll('[data-oferta-noturno]').forEach((c) => {
      c.onchange = () => {
        const id = Number(c.dataset.ofertaNoturno)
        if (travadasNoturno.has(id)) return desenhaOferta() // já tem turma — não desliga
        c.checked ? ofertadasNoturno.add(id) : ofertadasNoturno.delete(id)
        corrigeMistura(id)
        desenhaOferta()
      }
    })

    el('o-lista').querySelectorAll('[data-mistura-diurno]').forEach((c) => {
      c.onchange = () => {
        const id = Number(c.dataset.misturaDiurno)
        c.checked ? misturaDiurno.add(id) : misturaDiurno.delete(id)
      }
    })

    el('o-lista').querySelectorAll('[data-mistura-noturno]').forEach((c) => {
      c.onchange = () => {
        const id = Number(c.dataset.misturaNoturno)
        c.checked ? misturaNoturno.add(id) : misturaNoturno.delete(id)
      }
    })

    el('o-lista').querySelectorAll('[data-complemento]').forEach((inp) => {
      inp.oninput = () => complementos.set(Number(inp.dataset.complemento), inp.value)
    })

    el('o-lista').querySelectorAll('[data-remover-optativa]').forEach((b) => {
      b.onclick = async () => {
        const id = Number(b.dataset.removerOptativa)
        if (!confirm('Remover esta optativa da lista?')) return
        try {
          await api(`/admin/disciplinas/${id}`, { method: 'DELETE' })
        } catch (e) {
          return avisar(e.message, 'erro')
        }
        const i = disciplinas.findIndex((d) => d.id === id)
        if (i !== -1) disciplinas.splice(i, 1)
        ofertadasDiurno.delete(id)
        ofertadasNoturno.delete(id)
        misturaDiurno.delete(id)
        misturaNoturno.delete(id)
        complementos.delete(id)
        desenhaOferta()
      }
    })
  }

  desenhaOferta()

  async function acrescentaOptativa(tipo) {
    const { disciplina } = await api('/admin/disciplinas/optativa', { method: 'POST', body: { tipo } })
    disciplinas.push(disciplina)
    complementos.set(disciplina.id, disciplina.nome.slice(disciplina.nome.indexOf(' — ') + 3))
    // nasce sem turno ofertado e com mistura ligada por padrão — igual toda disciplina nova
    if (disciplina.ensalarDiurno !== false) misturaDiurno.add(disciplina.id)
    if (disciplina.ensalarNoturno !== false) misturaNoturno.add(disciplina.id)
    desenhaOferta()
  }
  el('o-add-complementar').onclick = () => acrescentaOptativa('COMPLEMENTAR')
  el('o-add-profissional').onclick = () => acrescentaOptativa('PROFISSIONAL')

  el('o-todas-d').onclick = () => {
    disciplinas.forEach((d) => ofertadasDiurno.add(d.id))
    desenhaOferta()
  }
  el('o-nenhuma-d').onclick = () => {
    // preserva quem já tem turma de dia — "desmarcar todas" não pode criar a mesma
    // inconsistência que a trava individual evita.
    ofertadasDiurno.clear()
    travadasDiurno.forEach((id) => ofertadasDiurno.add(id))
    disciplinas.forEach((d) => corrigeMistura(d.id))
    desenhaOferta()
  }
  el('o-todas-n').onclick = () => {
    disciplinas.forEach((d) => ofertadasNoturno.add(d.id))
    desenhaOferta()
  }
  el('o-nenhuma-n').onclick = () => {
    ofertadasNoturno.clear()
    travadasNoturno.forEach((id) => ofertadasNoturno.add(id))
    disciplinas.forEach((d) => corrigeMistura(d.id))
    desenhaOferta()
  }

  el('o-salvar').onclick = async () => {
    try {
      const r = await api('/admin/disciplinas/ofertadas', {
        method: 'PUT',
        body: {
          diurno: [...ofertadasDiurno],
          noturno: [...ofertadasNoturno],
          ensalarDiurno: [...misturaDiurno],
          ensalarNoturno: [...misturaNoturno],
          complementos: [...complementos].map(([id, texto]) => ({ id, texto: texto.trim() })),
        },
      })
      avisar(`${r.ofertadas} disciplina(s) na oferta deste semestre.`)
      // a grade de professores logo abaixo já tinha carregado as disciplinas antes desse
      // salvamento — sem recarregar ela aqui, "escolher disciplina" continuaria mostrando
      // a oferta antiga até a página inteira ser recarregada.
      await montaGradeAtribuicao('i-grade')
    } catch (e) {
      avisar(e.message, 'erro')
    }
  }

  el('i-conferir').onclick = () => enviar('simular')
  el('i-aplicar').onclick = () => {
    if (!confirm('Cadastrar as linhas válidas? As linhas com erro são ignoradas.')) return
    enviar('aplicar')
  }

  await montaGradeAtribuicao('i-grade')
}

function desenhaImportacao(r) {
  const marca = (l) => {
    if (l.erro) return `<span class="pill alerta">${esc(l.erro)}</span>`
    return l.acao === 'criar'
      ? '<span class="pill ok">cadastrar</span>'
      : '<span class="pill neutro">já existe — mantém a senha atual</span>'
  }

  el('i-resultado').innerHTML = `
    <div class="cartao cantos"><div class="canto"></div>
      <div class="rotulo-secao" style="margin-bottom:6px">
        ${r.aplicado ? 'Cadastro concluído' : 'Conferência (nada foi gravado ainda)'}
      </div>
      <h3 style="margin:0 0 14px">
        ${r.resumo.validas} linha${r.resumo.validas === 1 ? '' : 's'} ok
        ${r.resumo.erros ? `· ${r.resumo.erros} com problema` : ''}
      </h3>
      <table>
        <thead><tr>
          <th style="width:44px">#</th><th>Professor</th><th>E-mail</th>
          <th style="width:130px">Senha</th><th>Situação</th>
        </tr></thead>
        <tbody>
          ${r.linhas
            .map(
              (l) => `<tr>
                <td class="texto-3">${l.linha}</td>
                <td>${esc(nomeExibicao(l.professor))}</td>
                <td class="texto-2 pequeno">${esc(l.email)}</td>
                <td class="texto-2 pequeno mono">${esc(l.senha || '')}</td>
                <td>${marca(l)}</td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`
}

/* Grade opcional: o administrador pode preencher as disciplinas de cada professor,
   cada uma com o seu dia e o seu turno. Nada aqui é obrigatório — o professor faz
   sozinho ao entrar se ninguém preencher por ele. */
async function montaGradeAtribuicao(alvoId, senhasRecentes = {}) {
  const { professores, disciplinas, maximo } = await api('/admin/atribuicao')
  let abertoId = null

  function resumo(p) {
    if (!p.itens.length) return '<span class="texto-3">nenhuma disciplina</span>'
    return p.itens
      .map(
        (i) => `<span class="pill neutro" style="margin:2px 4px 2px 0">${esc(i.disciplina)}
          <span class="texto-3">${i.dia ? esc(ROTULO_DIA[i.dia].slice(0, 3)) : 'sem dia'}
          · ${esc((ROTULO_TURNO[i.turno] || '').slice(0, 3))}</span></span>`,
      )
      .join('')
  }

  function desenha() {
    el(alvoId).innerHTML = `
      <div class="cartao cantos"><div class="canto"></div>
        <div class="rotulo-secao" style="margin-bottom:6px">Professores cadastrados (${professores.length})</div>
        <p class="pequeno texto-3" style="margin-bottom:14px">
          Opcional: clique em <em>editar</em> para escolher as disciplinas de alguém — cada uma
          com o próprio dia e turno, até ${maximo} por professor. Quem não for preenchido faz
          isso sozinho ao entrar. A senha só aparece para quem você acabou de cadastrar acima.
        </p>
        ${
          professores.length
            ? `<table>
                <thead><tr>
                  <th style="width:190px">Professor</th><th style="width:230px">E-mail</th>
                  <th style="width:110px">Senha</th><th>Disciplinas</th><th style="width:190px"></th>
                </tr></thead>
                <tbody>
                  ${professores
                    .map((p) => {
                      const senha = senhasRecentes[p.email]
                      const aberto = abertoId === p.id
                      return `
                        <tr>
                          <td><strong>${esc(nomeExibicao(p.nome))}</strong>${
                            p.papel === 'ADMIN' ? ' <span class="pill ok">admin</span>' : ''
                          }${p.papel === 'COORDENADOR' ? ' <span class="pill ok">coordenador</span>' : ''}</td>
                          <td class="texto-2 pequeno">${esc(p.email)}</td>
                          <td class="texto-2 pequeno mono">${senha ? esc(senha) : '<span class="texto-3">—</span>'}</td>
                          <td style="line-height:2">${resumo(p)}</td>
                          <td style="text-align:right;white-space:nowrap">
                            <button class="secundaria" data-editar="${p.id}" style="padding:5px 12px">
                              ${aberto ? 'fechar' : 'editar'}
                            </button>
                            <button class="secundaria" data-senha="${p.id}" style="padding:5px 10px;font-size:12px">senha</button>
                            ${
                              p.papel !== 'ADMIN'
                                ? `<button class="secundaria" data-papel="${p.id}" data-novo-papel="${
                                    p.papel === 'COORDENADOR' ? 'PROFESSOR' : 'COORDENADOR'
                                  }" style="padding:5px 10px;font-size:12px" title="Turma continua igual — só muda o que ele enxerga e se pode gerar/apagar salas">
                                    ${p.papel === 'COORDENADOR' ? 'tirar coordenação' : 'tornar coordenador'}
                                  </button>`
                                : ''
                            }
                            <button class="mini" data-apagar="${p.id}" title="Remover professor">×</button>
                          </td>
                        </tr>
                        ${aberto ? `<tr><td colspan="5" id="ed-corpo-${p.id}" style="padding-top:0"></td></tr>` : ''}`
                    })
                    .join('')}
                </tbody>
              </table>`
            : '<div class="vazio">Nenhum professor ainda. Cole a lista acima.</div>'
        }
      </div>`

    document.querySelectorAll('[data-editar]').forEach((b) => {
      b.onclick = () => {
        abertoId = abertoId === b.dataset.editar ? null : b.dataset.editar
        desenha()
      }
    })

    document.querySelectorAll('[data-senha]').forEach((b) => {
      b.onclick = async () => {
        const senha = prompt('Nova senha para este professor (mínimo 6 caracteres):')
        if (!senha) return
        try {
          await api(`/admin/usuarios/${b.dataset.senha}`, { method: 'PUT', body: { senha } })
          avisar('Senha redefinida.')
        } catch (e) {
          avisar(e.message, 'erro')
        }
      }
    })

    document.querySelectorAll('[data-papel]').forEach((b) => {
      b.onclick = async () => {
        const novo = b.dataset.novoPapel
        const rotulo = novo === 'COORDENADOR' ? 'coordenador' : 'professor'
        if (!confirm(`Tornar esta pessoa ${rotulo}?`)) return
        try {
          await api(`/admin/usuarios/${b.dataset.papel}`, { method: 'PUT', body: { papel: novo } })
          await montaGradeAtribuicao(alvoId, senhasRecentes)
          avisar(`Agora é ${rotulo}.`)
        } catch (e) {
          avisar(e.message, 'erro')
        }
      }
    })

    document.querySelectorAll('[data-apagar]').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('Remover este professor? As disciplinas dele ficam sem dono.')) return
        try {
          await api(`/admin/usuarios/${b.dataset.apagar}`, { method: 'DELETE' })
          await montaGradeAtribuicao(alvoId, senhasRecentes)
          avisar('Professor removido.')
        } catch (e) {
          avisar(e.message, 'erro')
        }
      }
    })

    if (abertoId) {
      const p = professores.find((x) => x.id === abertoId)
      editorDisciplinas({
        alvo: el(`ed-corpo-${p.id}`),
        maximo,
        titulo: `Disciplinas de ${p.nome}`,
        ajuda:
          'Cada linha é uma disciplina com o seu próprio dia e turno. Quem já tem dono NAQUELE ' +
          'turno aparece com o nome da pessoa e não pode ser escolhido — o outro turno da mesma ' +
          'disciplina pode estar livre.',
        disciplinas: disciplinas.filter(
          (d) => d.ofertadaDiurno || d.ofertadaNoturno || p.itens.some((i) => i.disciplinaId === d.id),
        ),
        itens: p.itens.map((i) => ({ disciplinaId: i.disciplinaId, dia: i.dia || '', turno: i.turno })),
        professorId: p.id,
        salvar: (itens) => api(`/admin/atribuicao/${p.id}`, { method: 'POST', body: { itens } }),
        aoTerminar: () => montaGradeAtribuicao(alvoId, senhasRecentes),
      })
    }
  }

  desenha()
}

/* --------------------------------- manutenção -------------------------------- */

async function viewManutencao() {
  el('conteudo').innerHTML = `
    <div class="rotulo-secao">Manutenção</div>
    <h2 class="titulo">Fim de semestre</h2>

    <div class="cartao cantos" style="max-width:560px"><div class="canto"></div>
      <h3>Apagar todos os alunos</h3>
      <p class="texto-2 pequeno" style="margin-bottom:16px">
        Equivale ao “Apagar A5:B53” da planilha: remove os alunos de todas as turmas e
        descarta as salas já geradas. As turmas, os professores e os gabaritos continuam.
      </p>
      <button class="secundaria perigo" id="m-limpar">Apagar alunos de todas as turmas</button>
    </div>

    <div class="cartao cantos" style="max-width:560px;margin-top:22px"><div class="canto"></div>
      <h3>Apagar todos os professores</h3>
      <p class="texto-2 pequeno" style="margin-bottom:10px">
        Remove de uma vez todas as contas de professor e <strong>todas as turmas</strong> —
        com os alunos, os gabaritos e as salas geradas. Serve para recomeçar o semestre
        do zero antes de colar a nova lista em <em>Cadastro em lote</em>.
      </p>
      <p class="pequeno texto-3" style="margin-bottom:16px">
        A sua conta de administrador e as 60 disciplinas continuam intactas.
      </p>
      <button class="secundaria perigo" id="m-professores">Apagar todos os professores</button>
    </div>`

  el('m-limpar').onclick = async () => {
    if (prompt('Isso não tem volta. Digite APAGAR para confirmar:') !== 'APAGAR') return
    const r = await api('/admin/limpar-alunos', { method: 'POST', body: { confirmacao: 'APAGAR' } })
    avisar(`${r.removidos} aluno(s) removido(s).`)
  }

  el('m-professores').onclick = async () => {
    if (!confirm('Apagar TODOS os professores e as turmas deles? Isso não tem volta.')) return
    if (prompt('Digite APAGAR para confirmar:') !== 'APAGAR') return
    try {
      const r = await api('/admin/limpar-professores', { method: 'POST', body: { confirmacao: 'APAGAR' } })
      avisar(`${r.professores} professor(es), ${r.turmas} turma(s) e ${r.alunos} aluno(s) removidos.`)
    } catch (e) {
      avisar(e.message, 'erro')
    }
  }
}
