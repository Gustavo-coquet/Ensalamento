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
                  gerado
                    ? `<span class="pill ok">${gerado.totalSalas} sala${gerado.totalSalas === 1 ? '' : 's'} gerada${gerado.totalSalas === 1 ? '' : 's'}</span>`
                    : '<span class="pill neutro">não gerado</span>'
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

/* ---------------------------------- turmas ---------------------------------- */

async function viewAdminTurmas() {
  const [{ turmas }, { disciplinas }, { usuarios }] = await Promise.all([
    api('/turmas'),
    api('/admin/disciplinas'),
    api('/admin/usuarios'),
  ])

  const professores = usuarios.filter((u) => u.papel === 'PROFESSOR' || u.papel === 'ADMIN')

  el('conteudo').innerHTML = `
    <div class="rotulo-secao">Turmas</div>
    <h2 class="titulo">${turmas.length} turma${turmas.length === 1 ? '' : 's'} cadastrada${turmas.length === 1 ? '' : 's'}</h2>

    <div class="cartao cantos" style="margin-bottom:22px"><div class="canto"></div>
      <div class="rotulo-secao" style="margin-bottom:14px">Nova turma</div>
      <div class="grade g2">
        <label class="campo"><span>Disciplina</span>
          <select id="n-disciplina">
            ${disciplinas.map((d) => `<option value="${d.id}">${d.numero} — ${esc(d.nome)}</option>`).join('')}
          </select>
        </label>
        <label class="campo"><span>Professor</span>
          <select id="n-professor">
            <option value="">— definir depois —</option>
            ${professores.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}
          </select>
        </label>
        <label class="campo"><span>Curso</span>${selectCursos('CICLO_BASICO', 'id="n-curso"')}</label>
        <label class="campo"><span>Dia da prova</span>${selectDias('', 'id="n-dia"')}</label>
        <label class="campo"><span>Turno</span>${selectTurnos('NOTURNO', 'id="n-turno"')}</label>
      </div>
      <button class="acao" id="n-criar">+ Criar turma</button>
    </div>

    ${
      turmas.length
        ? `<div class="cartao cantos"><div class="canto"></div>
            <table>
              <thead><tr>
                <th style="width:40px">Nº</th><th>Disciplina</th><th>Professor</th>
                <th>Curso</th><th>Dia</th><th>Turno</th><th style="width:70px">Alunos</th>
                <th>Situação</th><th style="width:44px"></th>
              </tr></thead>
              <tbody>
                ${turmas
                  .map((t) => {
                    const marcas = []
                    if (!t.ensalar) marcas.push('<span class="pill off">fora da mistura</span>')
                    if (!t.gabaritoCompleto) marcas.push('<span class="pill alerta">gabarito</span>')
                    if (!t.diaSemana) marcas.push('<span class="pill alerta">sem dia</span>')
                    if (!marcas.length) marcas.push('<span class="pill ok">ok</span>')
                    return `<tr style="cursor:pointer" data-abrir="${t.id}">
                      <td class="texto-3">${t.numero}</td>
                      <td>${esc(t.disciplina)}</td>
                      <td class="texto-2">${t.professor ? esc(t.professor.nome) : '<span class="pill alerta">sem professor</span>'}</td>
                      <td class="texto-2 pequeno">${esc(ROTULO_CURSO[t.curso] || t.curso)}</td>
                      <td class="texto-2 pequeno">${t.diaSemana ? esc(ROTULO_DIA[t.diaSemana]) : '—'}</td>
                      <td class="texto-2 pequeno">${esc(ROTULO_TURNO[t.turno] || t.turno)}</td>
                      <td>${t.totalAlunos}</td>
                      <td style="display:flex;gap:4px;flex-wrap:wrap">${marcas.join('')}</td>
                      <td><button class="mini" data-excluir="${t.id}" title="Excluir turma">×</button></td>
                    </tr>`
                  })
                  .join('')}
              </tbody>
            </table>
          </div>`
        : '<div class="cartao cantos"><div class="canto"></div><div class="vazio">Nenhuma turma ainda. Crie a primeira acima.</div></div>'
    }`

  el('n-criar').onclick = async () => {
    try {
      await api('/admin/turmas', {
        method: 'POST',
        body: {
          disciplinaId: el('n-disciplina').value,
          professorId: el('n-professor').value || null,
          curso: el('n-curso').value,
          diaSemana: el('n-dia').value || null,
          turno: el('n-turno').value,
        },
      })
      await viewAdminTurmas()
      avisar('Turma criada.')
    } catch (e) {
      avisar(e.message, 'erro')
    }
  }

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

/* -------------------------------- professores ------------------------------- */

async function viewProfessores() {
  const { usuarios } = await api('/admin/usuarios')

  el('conteudo').innerHTML = `
    <div class="rotulo-secao">Professores</div>
    <h2 class="titulo">${usuarios.length} usuário${usuarios.length === 1 ? '' : 's'}</h2>

    <div class="cartao cantos" style="margin-bottom:22px"><div class="canto"></div>
      <div class="rotulo-secao" style="margin-bottom:14px">Novo usuário</div>
      <div class="grade g2">
        <label class="campo"><span>Nome</span><input id="u-nome" placeholder="Nome do professor" /></label>
        <label class="campo"><span>E-mail</span><input id="u-email" type="email" placeholder="prof.nome@soulasalle.com.br" /></label>
        <label class="campo"><span>Senha inicial</span><input id="u-senha" placeholder="mínimo 6 caracteres" /></label>
        <label class="campo"><span>Papel</span>
          <select id="u-papel">
            <option value="PROFESSOR">Professor</option>
            <option value="ADMIN">Administrador (vê tudo)</option>
          </select>
        </label>
      </div>
      <button class="acao" id="u-criar">+ Criar usuário</button>
    </div>

    <div class="cartao cantos"><div class="canto"></div>
      <table>
        <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th style="width:70px">Turmas</th><th style="width:150px"></th></tr></thead>
        <tbody>
          ${usuarios
            .map(
              (u) => `<tr>
                <td>${esc(u.nome)}</td>
                <td class="texto-2 pequeno">${esc(u.email)}</td>
                <td>${u.papel === 'ADMIN' ? '<span class="pill ok">administrador</span>' : '<span class="pill neutro">professor</span>'}</td>
                <td>${u.turmas}</td>
                <td style="text-align:right">
                  <button class="secundaria" style="padding:4px 10px;font-size:12px" data-senha="${u.id}">senha</button>
                  <button class="mini" data-apagar="${u.id}" title="Remover">×</button>
                </td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`

  el('u-criar').onclick = async () => {
    try {
      await api('/admin/usuarios', {
        method: 'POST',
        body: {
          nome: el('u-nome').value,
          email: el('u-email').value,
          senha: el('u-senha').value,
          papel: el('u-papel').value,
        },
      })
      await viewProfessores()
      avisar('Usuário criado.')
    } catch (e) {
      avisar(e.message, 'erro')
    }
  }

  document.querySelectorAll('[data-senha]').forEach((b) => {
    b.onclick = async () => {
      const senha = prompt('Nova senha para este usuário (mínimo 6 caracteres):')
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
      if (!confirm('Remover este usuário? As turmas dele ficam sem professor.')) return
      try {
        await api(`/admin/usuarios/${b.dataset.apagar}`, { method: 'DELETE' })
        await viewProfessores()
        avisar('Usuário removido.')
      } catch (e) {
        avisar(e.message, 'erro')
      }
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
    <h2 class="titulo">Professores e disciplinas de uma vez</h2>

    <div class="cartao cantos" style="margin-bottom:22px"><div class="canto"></div>
      <div class="rotulo-secao" style="margin-bottom:6px">Cole a lista</div>
      <p class="pequeno texto-3" style="margin-bottom:12px">
        Colunas separadas por <strong>tabulação</strong> (colando direto do Excel),
        <strong>ponto e vírgula</strong> ou <strong>barra vertical</strong>. Dois formatos,
        e dá para misturar os dois na mesma lista:
      </p>
      <p class="pequeno texto-3" style="margin-bottom:12px">
        <span class="mono">PROFESSOR ; E-MAIL ; SENHA</span> — cadastra só a pessoa.
        Ela entra no sistema e escolhe as próprias disciplinas, dia e turno.<br />
        <span class="mono">DISCIPLINA ; PROFESSOR ; E-MAIL ; SENHA ; DIA ; TURNO</span> — já deixa
        tudo pronto. A disciplina pode ser o nome (acento não importa) ou o número dela;
        dia e turno podem ficar em branco.
      </p>
      <p class="pequeno texto-3" style="margin-bottom:12px">
        Sem senha, entra a senha padrão do campo abaixo. Professor que já existe é
        reaproveitado e a senha dele não é alterada.
      </p>

      <textarea id="i-texto" style="min-height:190px" placeholder="Yago Chamoun; yago.chamoun@soulasalle.com.br; lasalle2026
Marina Ribeiro; marina.ribeiro@soulasalle.com.br
Cálculo Numérico; Paula Nunes; paula.nunes@soulasalle.com.br; ; terça; noturno"></textarea>

      <div class="grade g2" style="margin-top:14px">
        <label class="campo" style="margin:0"><span>Senha padrão (quando a coluna vier vazia)</span>
          <input id="i-senha" value="lasalle2026" />
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
      <div class="rotulo-secao" style="margin-bottom:10px">Disciplinas cadastradas (${disciplinas.length})</div>
      <p class="pequeno texto-3" style="margin-bottom:12px">
        São estes os nomes que o sistema reconhece. Pode usar o número no lugar do nome.
      </p>
      <div class="grade g3 pequeno texto-2">
        ${disciplinas
          .map((d) => `<div><span class="texto-3 mono">${d.numero}</span> ${esc(d.nome)}</div>`)
          .join('')}
      </div>
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
          `${r.resumo.professoresNovos} professor(es) novo(s), ` +
            `${r.resumo.turmasNovas} turma(s) criada(s), ${r.resumo.turmasAtualizadas} atualizada(s).`,
        )
      }
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

/* Grade opcional: o administrador pode ir preenchendo dia, turno e disciplinas
   pelos professores. Nada aqui é obrigatório — o professor faz sozinho se preferir. */
async function montaGradeAtribuicao(alvoId, senhasRecentes = {}) {
  const { professores, disciplinas } = await api('/admin/atribuicao')

  const estado = new Map(
    professores.map((p) => [
      p.id,
      { ids: new Set(p.disciplinaIds), dia: p.diaSemana || '', turno: p.turno || 'NOTURNO', aberto: false, busca: '' },
    ]),
  )

  function linhaProfessor(p) {
    const e = estado.get(p.id)
    const senha = senhasRecentes[p.email]

    const lista = e.aberto
      ? `<tr class="nao-imprime"><td colspan="6" style="padding-top:0">
          <label class="campo" style="max-width:320px"><span>Buscar disciplina</span>
            <input data-busca="${p.id}" value="${esc(e.busca)}" placeholder="digite parte do nome" />
          </label>
          <div class="lista-check">
            ${disciplinas
              .filter((d) => !e.busca || chaveSimples(`${d.numero} ${d.nome}`).includes(chaveSimples(e.busca)))
              .map((d) => {
                const deOutro = d.professorId && d.professorId !== p.id
                return `<label class="item-check ${deOutro ? 'ocupada' : ''}">
                    <input type="checkbox" data-prof="${p.id}" data-id="${d.id}"
                      ${e.ids.has(d.id) ? 'checked' : ''} ${deOutro ? 'disabled' : ''} />
                    <span><span class="texto-3 mono">${d.numero}</span> ${esc(d.nome)}
                    ${deOutro ? `<span class="pill neutro">${esc(d.professorNome)}</span>` : ''}</span>
                  </label>`
              })
              .join('')}
          </div>
          <div class="linha-botoes" style="margin-top:12px">
            <button class="acao" data-salvar="${p.id}">Salvar para ${esc(p.nome.split(' ')[0])}</button>
            <button class="secundaria" data-fechar="${p.id}">Fechar</button>
          </div>
        </td></tr>`
      : ''

    return `
      <tr>
        <td><strong>${esc(p.nome)}</strong>${p.papel === 'ADMIN' ? ' <span class="pill ok">admin</span>' : ''}</td>
        <td class="texto-2 pequeno">${esc(p.email)}</td>
        <td class="texto-2 pequeno mono">${senha ? esc(senha) : '<span class="texto-3">—</span>'}</td>
        <td>${selectDias(e.dia, `data-dia="${p.id}"`)}</td>
        <td>${selectTurnos(e.turno, `data-turno="${p.id}"`)}</td>
        <td><button class="secundaria" data-abrir-disc="${p.id}" style="white-space:nowrap">
          ${e.ids.size} disciplina${e.ids.size === 1 ? '' : 's'} ${e.aberto ? '▲' : '▼'}
        </button></td>
      </tr>
      ${lista}`
  }

  function desenha() {
    el(alvoId).innerHTML = `
      <div class="cartao cantos"><div class="canto"></div>
        <div class="rotulo-secao" style="margin-bottom:6px">Professores cadastrados (${professores.length})</div>
        <p class="pequeno texto-3" style="margin-bottom:14px">
          Opcional: se quiser adiantar o trabalho de alguém, escolha o dia, o turno e as
          disciplinas dele aqui. Quem não for preenchido faz isso sozinho ao entrar.
          A senha só aparece para quem você acabou de cadastrar nesta tela.
        </p>
        ${
          professores.length
            ? `<table>
                <thead><tr>
                  <th>Professor</th><th>E-mail</th><th style="width:120px">Senha</th>
                  <th style="width:170px">Dia da semana</th><th style="width:130px">Turno</th>
                  <th style="width:150px">Disciplinas</th>
                </tr></thead>
                <tbody>${professores.map(linhaProfessor).join('')}</tbody>
              </table>`
            : '<div class="vazio">Nenhum professor ainda. Cole a lista acima.</div>'
        }
      </div>`

    document.querySelectorAll('[data-abrir-disc]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.abrirDisc
        const abrindo = !estado.get(id).aberto
        estado.forEach((v) => (v.aberto = false))
        estado.get(id).aberto = abrindo
        desenha()
      }
    })

    document.querySelectorAll('[data-fechar]').forEach((b) => {
      b.onclick = () => {
        estado.get(b.dataset.fechar).aberto = false
        desenha()
      }
    })

    document.querySelectorAll('[data-busca]').forEach((i) => {
      i.oninput = () => {
        estado.get(i.dataset.busca).busca = i.value
        desenha()
        const campo = document.querySelector(`[data-busca="${i.dataset.busca}"]`)
        if (campo) { campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length) }
      }
    })

    document.querySelectorAll('[data-prof]').forEach((c) => {
      c.onchange = () => {
        const e = estado.get(c.dataset.prof)
        const id = Number(c.dataset.id)
        c.checked ? e.ids.add(id) : e.ids.delete(id)
      }
    })

    document.querySelectorAll('[data-dia]').forEach((s) => {
      s.onchange = () => (estado.get(s.dataset.dia).dia = s.value)
    })
    document.querySelectorAll('[data-turno]').forEach((s) => {
      s.onchange = () => (estado.get(s.dataset.turno).turno = s.value)
    })

    document.querySelectorAll('[data-salvar]').forEach((b) => {
      b.onclick = async () => {
        const id = b.dataset.salvar
        const e = estado.get(id)
        try {
          const r = await api(`/admin/atribuicao/${id}`, {
            method: 'POST',
            body: { disciplinaIds: [...e.ids], diaSemana: e.dia || null, turno: e.turno },
          })
          if (r.ocupadas?.length) {
            avisar(`Já tem dono: ${r.ocupadas.map((o) => `${o.disciplina} (${o.professor})`).join(', ')}`, 'info')
          }
          avisar(`${r.vinculadas} disciplina(s) vinculada(s).`)
          await montaGradeAtribuicao(alvoId, senhasRecentes)
        } catch (err) {
          avisar(err.message, 'erro')
        }
      }
    })
  }

  desenha()
}

function desenhaImportacao(r) {
  const marca = (linha) => {
    if (linha.erro) return `<span class="pill alerta">${esc(linha.erro)}</span>`
    const partes = []
    partes.push(
      linha.acaoProfessor === 'criar'
        ? '<span class="pill ok">professor novo</span>'
        : '<span class="pill neutro">professor já existia</span>',
    )
    if (!linha.disciplinaId) {
      partes.push('<span class="pill neutro">ele escolhe as disciplinas</span>')
    } else {
      partes.push(
        linha.acaoTurma === 'criar'
          ? '<span class="pill ok">turma nova</span>'
          : '<span class="pill neutro">turma atualizada</span>',
      )
    }
    return partes.join(' ')
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
          <th style="width:44px">#</th><th>Professor</th><th>E-mail</th><th>Senha</th>
          <th>Disciplina</th><th>Dia</th><th>Turno</th><th>Situação</th>
        </tr></thead>
        <tbody>
          ${r.linhas
            .map(
              (l) => `<tr>
                <td class="texto-3">${l.linha}</td>
                <td class="texto-2">${esc(l.professor)}</td>
                <td class="texto-2 pequeno">${esc(l.email)}</td>
                <td class="texto-2 pequeno mono">${esc(l.senha || '')}</td>
                <td>${esc(l.disciplinaNome || l.disciplinaTexto || '—')}</td>
                <td class="texto-2 pequeno">${l.dia ? esc(ROTULO_DIA[l.dia]) : '—'}</td>
                <td class="texto-2 pequeno">${l.disciplinaId ? esc(ROTULO_TURNO[l.turno] || '—') : '—'}</td>
                <td style="display:flex;gap:4px;flex-wrap:wrap">${marca(l)}</td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`
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
    </div>`

  el('m-limpar').onclick = async () => {
    if (prompt('Isso não tem volta. Digite APAGAR para confirmar:') !== 'APAGAR') return
    const r = await api('/admin/limpar-alunos', { method: 'POST', body: { confirmacao: 'APAGAR' } })
    avisar(`${r.removidos} aluno(s) removido(s).`)
  }
}
