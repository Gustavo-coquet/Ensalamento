/* Telas do administrador: painel, turmas, professores, geração de salas e exportações. */

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

    <div class="cartao cantos" style="margin-bottom:22px"><div class="canto"></div>
      <div class="rotulo-secao" style="margin-bottom:14px">Distribuição por dia e turno</div>
      <table>
        <thead><tr><th>Dia</th><th>Turno</th><th>Turmas</th><th>Na mistura</th><th>Alunos</th><th>Salas previstas</th><th>Situação</th></tr></thead>
        <tbody>
          ${d.porDia
            .filter((linha) => linha.turmas > 0)
            .map((linha) => {
              const gerado = d.ensalamentos.find((e) => e.dia === linha.dia && e.turno === linha.turno)
              return `<tr>
                <td><strong>${esc(linha.rotulo)}</strong></td>
                <td class="texto-2 pequeno">${esc(linha.rotuloTurno)}</td>
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
            '<tr><td colspan="7" class="texto-3">Nenhuma turma com dia definido ainda.</td></tr>'}
        </tbody>
      </table>
    </div>

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
// Optativa Complementar/Profissional saem do quadro por período — elas valem pra
// qualquer curso e mudam de assunto todo semestre, então ficam num quadro só delas
// (ver montaQuadroOptativas), sem misturar com o período fixo da grade curricular.
const OPTATIVAS_BASE = new Set(['Optativa Complementar', 'Optativa Profissional'])

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
        return `<td>${itens
          .map(
            (t) => `<div style="margin-bottom:6px">
              <strong>${t.professor ? esc(nomeExibicao(t.professor.nome)) : '<span class="texto-3">sem professor</span>'}</strong><br />
              <span class="texto-3 pequeno">${esc(t.disciplina)}</span>
            </div>`,
          )
          .join('')}</td>`
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
 * Quadro à parte só das optativas (Complementar e Profissional). Elas não pertencem a
 * um curso fixo nem a um período fixo — servem pra qualquer curso e o assunto muda a
 * cada semestre — então ficam fora dos quadros por período, uma linha por optativa
 * (pode ter mais de uma "Optativa Complementar" rodando no mesmo semestre), com o dia
 * da semana nas colunas. Assim dá pra ver de cara se duas caem no mesmo dia — e,
 * dentro da célula, no mesmo turno — antes de bater de frente na agenda de alguém.
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
        return `<td>${itens
          .map(
            (t) => `<div style="margin-bottom:6px">
              <strong>${t.professor ? esc(nomeExibicao(t.professor.nome)) : '<span class="texto-3">sem professor</span>'}</strong><br />
              <span class="texto-3 pequeno">${esc(ROTULO_TURNO[t.turno] || t.turno)}</span>
            </div>`,
          )
          .join('')}</td>`
      }).join('')}
    </tr>`
  })

  return `<div class="cartao cantos quadro-turmas" style="margin-bottom:22px; overflow-x:auto"><div class="canto"></div>
    <div class="rotulo-secao" style="margin-bottom:6px">Optativas</div>
    <p class="pequeno texto-3" style="margin-bottom:14px">
      Ficam num quadro à parte porque valem pra quem quiser, de qualquer curso — assim dá
      pra ver de cara se duas caem no mesmo dia (e, na célula, no mesmo turno) antes de
      virar choque de horário.
    </p>
    <table>
      <thead><tr><th></th>${DIAS.map((d) => `<th>${esc(ROTULO_DIA[d].slice(0, 3))}</th>`).join('')}</tr></thead>
      <tbody>${linhas.join('')}</tbody>
    </table>
  </div>`
}

/** Quatro quadros por período (Civil-manhã, Produção-manhã, Civil-noite, Produção-noite)
 * mais um quadro à parte só das optativas. */
function montaQuadroTurmas(turmas) {
  return [
    montaQuadroCursoTurno(turmas, 'ENG_CIVIL', 'DIURNO', 'Eng. Civil'),
    montaQuadroCursoTurno(turmas, 'ENG_PRODUCAO', 'DIURNO', 'Eng. de Produção'),
    montaQuadroCursoTurno(turmas, 'ENG_CIVIL', 'NOTURNO', 'Eng. Civil'),
    montaQuadroCursoTurno(turmas, 'ENG_PRODUCAO', 'NOTURNO', 'Eng. de Produção'),
    montaQuadroOptativas(turmas),
  ].join('')
}

/* ---------------------------------- turmas ---------------------------------- */

/**
 * Um bloco (Diurno ou Noturno) da lista de turmas: mostra toda disciplina ofertada
 * naquele turno (marcada em Cadastro em lote), mesmo que ainda ninguém tenha pego —
 * nesse caso entra uma linha avisando "sem professor cadastrado", sem dia/curso porque
 * isso só existe depois que alguém leciona.
 */
function blocoTurmasPorTurno(disciplinas, turmas, turno, titulo) {
  const chaveOferta = turno === 'DIURNO' ? 'ofertadaDiurno' : 'ofertadaNoturno'
  const ofertadas = disciplinas.filter((d) => d[chaveOferta])
  if (!ofertadas.length) return ''

  const linhas = []
  for (const d of ofertadas) {
    const doTurno = turmas.filter((t) => t.numero === d.numero && t.turno === turno)
    if (!doTurno.length) {
      linhas.push(`<tr>
        <td class="texto-3">${d.numero}</td>
        <td>${esc(d.nome)}</td>
        <td colspan="5"><span class="pill alerta">sem professor cadastrado</span></td>
        <td></td>
      </tr>`)
      continue
    }
    for (const t of doTurno) {
      const marcas = []
      if (!t.ensalar) marcas.push('<span class="pill off">fora da mistura</span>')
      if (!t.gabaritoCompleto) marcas.push('<span class="pill alerta">gabarito</span>')
      if (!t.diaSemana) marcas.push('<span class="pill alerta">sem dia</span>')
      if (!marcas.length) marcas.push('<span class="pill ok">ok</span>')
      linhas.push(`<tr style="cursor:pointer" data-abrir="${t.id}">
        <td class="texto-3">${t.numero}</td>
        <td>${esc(t.disciplina)}</td>
        <td class="texto-2">${t.professor ? esc(nomeExibicao(t.professor.nome)) : '<span class="pill alerta">sem professor</span>'}</td>
        <td class="texto-2 pequeno">${esc(ROTULO_CURSO[t.curso] || t.curso)}</td>
        <td class="texto-2 pequeno">${t.diaSemana ? esc(ROTULO_DIA[t.diaSemana]) : '—'}</td>
        <td>${t.totalAlunos}</td>
        <td style="display:flex;gap:4px;flex-wrap:wrap">${marcas.join('')}</td>
        <td><button class="mini" data-excluir="${t.id}" title="Excluir turma">×</button></td>
      </tr>`)
    }
  }

  const semProfessor = ofertadas.filter((d) => !turmas.some((t) => t.numero === d.numero && t.turno === turno)).length

  return `<div class="cartao cantos" style="margin-bottom:22px"><div class="canto"></div>
    <div class="rotulo-secao" style="margin-bottom:6px">${esc(titulo)}</div>
    <p class="pequeno texto-3" style="margin-bottom:14px">
      ${ofertadas.length} disciplina${ofertadas.length === 1 ? '' : 's'} ofertada${ofertadas.length === 1 ? '' : 's'} neste turno
      ${semProfessor ? ` · <span class="cor-mistura-noturno">${semProfessor} sem professor cadastrado</span>` : ''}
    </p>
    <table>
      <thead><tr>
        <th style="width:40px">Nº</th><th>Disciplina</th><th>Professor</th>
        <th>Curso</th><th>Dia</th><th style="width:70px">Alunos</th>
        <th>Situação</th><th style="width:44px"></th>
      </tr></thead>
      <tbody>${linhas.join('')}</tbody>
    </table>
  </div>`
}

async function viewAdminTurmas() {
  const [{ turmas }, { disciplinas }] = await Promise.all([api('/turmas'), api('/admin/disciplinas')])

  el('conteudo').innerHTML = `
    <div class="rotulo-secao">Turmas</div>
    <h2 class="titulo">${turmas.length} turma${turmas.length === 1 ? '' : 's'} cadastrada${turmas.length === 1 ? '' : 's'}</h2>
    <p class="pequeno texto-3" style="margin:-10px 0 20px">
      As turmas nascem quando um professor escolhe as disciplinas dele — em
      <em>Cadastro em lote</em> você faz isso por ele, se precisar. As listas abaixo mostram
      toda disciplina ofertada este semestre, separada por turno — mesmo quem ainda não
      tem professor.
    </p>

    ${montaQuadroTurmas(turmas)}

    ${blocoTurmasPorTurno(disciplinas, turmas, 'DIURNO', 'Manhã (diurno)')}
    ${blocoTurmasPorTurno(disciplinas, turmas, 'NOTURNO', 'Noite (noturno)')}

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

  document.querySelectorAll('[data-excluir]').forEach((b) => {
    b.onclick = async (ev) => {
      ev.stopPropagation()
      if (!confirm('Excluir esta turma e todos os alunos dela?')) return
      await api(`/admin/turmas/${b.dataset.excluir}`, { method: 'DELETE' })
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
        <div style="display:flex;align-items:flex-end">
          <button class="acao" id="e-gerar" style="width:100%">Criar salas</button>
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

  el('e-gerar').onclick = async () => {
    const alvo = `${ROTULO_DIA[diaSelecionado]} — ${ROTULO_TURNO[turnoSelecionado].toLowerCase()}`
    if (!confirm(`Gerar as salas de ${alvo}? Isso substitui a distribuição anterior desse dia e turno.`)) return
    try {
      const r = await api(`/admin/ensalamento/${diaSelecionado}/${turnoSelecionado}`, {
        method: 'POST',
        body: { capacidade: Number(el('e-cap').value) || 15 },
      })
      desenhaSalas(r.ensalamento)
      avisar(`${r.ensalamento.totalSalas} salas criadas para ${r.ensalamento.totalAlunos} alunos.`)
    } catch (e) {
      avisar(e.message, 'erro')
    }
  }

  try {
    const r = await api(`/admin/ensalamento/${diaSelecionado}/${turnoSelecionado}`)
    desenhaSalas(r.ensalamento)
  } catch {
    el('e-resultado').innerHTML =
      '<div class="cartao cantos"><div class="canto"></div><div class="vazio">Nenhuma sala gerada para este dia e turno ainda.</div></div>'
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

  const ofertadasDiurno = new Set(disciplinas.filter((d) => d.ofertadaDiurno).map((d) => d.id))
  const ofertadasNoturno = new Set(disciplinas.filter((d) => d.ofertadaNoturno).map((d) => d.id))
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
              ${d.turmas ? `<span class="pill neutro">${d.turmas} turma${d.turmas === 1 ? '' : 's'}</span>` : ''}</span>
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
              <input type="checkbox" data-oferta-diurno="${d.id}" ${diurno ? 'checked' : ''} />
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
              <input type="checkbox" data-oferta-noturno="${d.id}" ${noturno ? 'checked' : ''} />
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
        c.checked ? ofertadasDiurno.add(id) : ofertadasDiurno.delete(id)
        corrigeMistura(id)
        desenhaOferta()
      }
    })

    el('o-lista').querySelectorAll('[data-oferta-noturno]').forEach((c) => {
      c.onchange = () => {
        const id = Number(c.dataset.ofertaNoturno)
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
    ofertadasDiurno.clear()
    disciplinas.forEach((d) => corrigeMistura(d.id))
    desenhaOferta()
  }
  el('o-todas-n').onclick = () => {
    disciplinas.forEach((d) => ofertadasNoturno.add(d.id))
    desenhaOferta()
  }
  el('o-nenhuma-n').onclick = () => {
    ofertadasNoturno.clear()
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
                          }</td>
                          <td class="texto-2 pequeno">${esc(p.email)}</td>
                          <td class="texto-2 pequeno mono">${senha ? esc(senha) : '<span class="texto-3">—</span>'}</td>
                          <td style="line-height:2">${resumo(p)}</td>
                          <td style="text-align:right;white-space:nowrap">
                            <button class="secundaria" data-editar="${p.id}" style="padding:5px 12px">
                              ${aberto ? 'fechar' : 'editar'}
                            </button>
                            <button class="secundaria" data-senha="${p.id}" style="padding:5px 10px;font-size:12px">senha</button>
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
