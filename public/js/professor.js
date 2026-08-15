/* Telas do professor: lista de turmas, preenchimento de alunos e gabarito. */

async function viewMinhasTurmas() {
  const { turmas } = await api('/turmas')
  const conteudo = el('conteudo')

  if (!turmas.length) {
    conteudo.innerHTML = `
      <div class="rotulo-secao">Minhas turmas</div>
      <h2 class="titulo">Escolha as suas disciplinas</h2>
      <div class="cartao cantos" style="margin-bottom:22px"><div class="canto"></div>
        <p class="texto-2">Você ainda não tem disciplinas vinculadas. Marque abaixo as que
        você leciona — depois é só entrar em cada uma para colar a lista de alunos e o gabarito.</p>
      </div>
      <div id="escolha-disciplinas"></div>`
    await montaEscolhaDisciplinas('escolha-disciplinas', viewMinhasTurmas)
    return
  }

  const cartoes = turmas.map((t) => {
    const pendencias = []
    if (!t.diaSemana) pendencias.push('<span class="pill alerta">sem dia</span>')
    if (!t.totalAlunos) pendencias.push('<span class="pill alerta">sem alunos</span>')
    if (!t.gabaritoCompleto) pendencias.push('<span class="pill alerta">gabarito incompleto</span>')
    if (!pendencias.length) pendencias.push('<span class="pill ok">pronta</span>')

    return `
      <div class="cartao cantos" style="cursor:pointer" data-turma="${t.id}">
        <div class="canto"></div>
        <div class="rotulo-secao">${esc(ROTULO_CURSO[t.curso] || t.curso)}</div>
        <h3 style="margin-bottom:8px">${esc(t.disciplina)}</h3>
        <div class="pequeno texto-3" style="margin-bottom:12px">
          ${t.diaSemana ? esc(ROTULO_DIA[t.diaSemana]) : 'dia não definido'}
          · ${esc(ROTULO_TURNO[t.turno] || t.turno)}
          · ${t.totalAlunos} aluno${t.totalAlunos === 1 ? '' : 's'}
          · ${t.ensalar ? 'entra na mistura' : 'fora da mistura'}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${pendencias.join('')}</div>
      </div>`
  })

  conteudo.innerHTML = `
    <div class="rotulo-secao">Minhas turmas</div>
    <h2 class="titulo">${turmas.length} turma${turmas.length === 1 ? '' : 's'} sob sua responsabilidade</h2>
    <div class="grade g2" style="margin-bottom:22px">${cartoes.join('')}</div>
    <div id="escolha-disciplinas"></div>`

  conteudo.querySelectorAll('[data-turma]').forEach((card) => {
    card.onclick = () => irPara(`turma/${card.dataset.turma}`)
  })

  await montaEscolhaDisciplinas('escolha-disciplinas', viewMinhasTurmas)
}

/**
 * Painel de escolha das disciplinas do próprio professor: busca, marca as dele,
 * mostra quais já são de outra pessoa e aplica dia/turno de uma vez.
 */
async function montaEscolhaDisciplinas(alvoId, aoSalvar) {
  const [{ disciplinas }, { turmas }] = await Promise.all([
    api('/turmas/disciplinas/catalogo'),
    api('/turmas'),
  ])

  const meus = new Set(turmas.map((t) => t.numero))
  const marcadas = new Set(disciplinas.filter((d) => meus.has(d.numero)).map((d) => d.id))
  const diaAtual = turmas.find((t) => t.diaSemana)?.diaSemana || ''
  const turnoAtual = turmas[0]?.turno || 'NOTURNO'

  el(alvoId).innerHTML = `
    <div class="cartao cantos"><div class="canto"></div>
      <div class="rotulo-secao" style="margin-bottom:6px">Minhas disciplinas</div>
      <p class="pequeno texto-3" style="margin-bottom:14px">
        Marque tudo o que você leciona. O dia e o turno escolhidos aqui valem para as
        disciplinas marcadas — dá para ajustar cada uma depois, individualmente.
      </p>

      <div class="grade g3" style="margin-bottom:14px">
        <label class="campo" style="margin:0"><span>Dia da prova</span>${selectDias(diaAtual, 'id="d-dia"')}</label>
        <label class="campo" style="margin:0"><span>Turno</span>${selectTurnos(turnoAtual, 'id="d-turno"')}</label>
        <label class="campo" style="margin:0"><span>Buscar disciplina</span>
          <input id="d-busca" placeholder="digite parte do nome" />
        </label>
      </div>

      <div id="d-lista" class="lista-check"></div>

      <div class="linha-botoes" style="margin-top:16px">
        <button class="acao" id="d-salvar">Salvar minhas disciplinas</button>
        <span class="pequeno texto-3" id="d-contagem"></span>
      </div>
    </div>`

  function desenha() {
    const busca = chaveSimples(el('d-busca').value)
    const visiveis = disciplinas.filter((d) => !busca || chaveSimples(`${d.numero} ${d.nome}`).includes(busca))

    el('d-lista').innerHTML =
      visiveis
        .map((d) => {
          const deOutro = d.professorId && !marcadas.has(d.id)
          return `
            <label class="item-check ${deOutro ? 'ocupada' : ''}">
              <input type="checkbox" data-id="${d.id}" ${marcadas.has(d.id) ? 'checked' : ''} ${deOutro ? 'disabled' : ''} />
              <span><span class="texto-3 mono">${d.numero}</span> ${esc(d.nome)}
              ${deOutro ? `<span class="pill neutro">${esc(d.professorNome)}</span>` : ''}</span>
            </label>`
        })
        .join('') || '<div class="vazio">Nada encontrado.</div>'

    el('d-contagem').textContent = `${marcadas.size} marcada(s)`

    el('d-lista').querySelectorAll('input[type=checkbox]').forEach((c) => {
      c.onchange = () => {
        const id = Number(c.dataset.id)
        c.checked ? marcadas.add(id) : marcadas.delete(id)
        el('d-contagem').textContent = `${marcadas.size} marcada(s)`
      }
    })
  }

  el('d-busca').oninput = desenha
  desenha()

  el('d-salvar').onclick = async () => {
    try {
      const r = await api('/turmas/minhas-disciplinas', {
        method: 'POST',
        body: {
          disciplinaIds: [...marcadas],
          diaSemana: el('d-dia').value || null,
          turno: el('d-turno').value,
        },
      })
      if (r.ocupadas?.length) {
        avisar(`Já tem dono: ${r.ocupadas.map((o) => `${o.disciplina} (${o.professor})`).join(', ')}`, 'info')
      }
      await aoSalvar()
      avisar(`${r.vinculadas} disciplina(s) salva(s).`)
    } catch (e) {
      avisar(e.message, 'erro')
    }
  }
}

async function viewTurma(turmaId) {
  const { turma, alunos } = await api(`/turmas/${turmaId}`)
  const conteudo = el('conteudo')

  conteudo.innerHTML = `
    <button class="secundaria nao-imprime" id="voltar" style="margin-bottom:18px">← voltar</button>

    <div class="rotulo-secao">Disciplina ${turma.numero}</div>
    <h2 class="titulo">${esc(turma.disciplina)}</h2>

    <div class="grade g2" style="margin-bottom:22px">
      <div class="cartao cantos"><div class="canto"></div>
        <div class="rotulo-secao" style="margin-bottom:16px">Configuração da prova</div>

        <label class="campo"><span>Dia da prova</span>${selectDias(turma.diaSemana, 'id="f-dia"')}</label>
        <label class="campo"><span>Curso</span>${selectCursos(turma.curso, 'id="f-curso"')}</label>
        <label class="campo"><span>Turno</span>${selectTurnos(turma.turno, 'id="f-turno"')}</label>

        <label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer;margin:16px 0">
          <input type="checkbox" id="f-ensalar" ${turma.ensalar ? 'checked' : ''} style="width:auto;margin-top:4px" />
          <span class="pequeno texto-2">
            <strong style="color:var(--texto)">Esta turma entra na mistura de salas</strong><br />
            Desmarque se os alunos fazem a prova na própria sala. Eles continuam no resumo
            e no gabarito para a leitura do cartão-resposta.
          </span>
        </label>

        <button class="acao" id="salvar-config">Salvar configuração</button>
      </div>

      <div class="cartao cantos"><div class="canto"></div>
        <div class="rotulo-secao" style="margin-bottom:16px">Gabarito — 10 questões</div>
        <div class="gabarito-grade" id="gabarito"></div>
        <div class="linha-botoes" style="margin-top:18px">
          <button class="acao" id="salvar-gabarito">Salvar gabarito</button>
          <button class="secundaria" id="limpar-gabarito">Limpar</button>
        </div>
      </div>
    </div>

    <div class="cartao cantos" style="margin-bottom:22px"><div class="canto"></div>
      <div class="rotulo-secao" style="margin-bottom:6px">Importar alunos</div>
      <p class="pequeno texto-3" style="margin-bottom:12px">
        Cole direto da planilha: uma linha por aluno, matrícula e nome
        (separados por tabulação, ponto e vírgula ou espaço).
      </p>
      <textarea id="colar" placeholder="1016357	Adriane De Moura Cabral
1012678	Alexandre Mauricio Da Silva
2001535	Ana Clara Latgé Alves"></textarea>
      <div class="linha-botoes" style="margin-top:12px">
        <button class="acao" id="importar-somar">Adicionar / atualizar</button>
        <button class="secundaria" id="importar-substituir">Substituir a lista inteira</button>
      </div>
    </div>

    <div class="cartao cantos"><div class="canto"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:12px;flex-wrap:wrap">
        <div>
          <div class="rotulo-secao">Alunos</div>
          <h3 style="margin:0">${alunos.length} cadastrado${alunos.length === 1 ? '' : 's'}</h3>
        </div>
        <div class="linha-botoes">
          <button class="secundaria" id="add-aluno">+ aluno avulso</button>
          ${alunos.length ? '<button class="secundaria perigo" id="limpar-alunos">Apagar todos</button>' : ''}
        </div>
      </div>
      ${
        alunos.length
          ? `<table>
              <thead><tr><th style="width:44px">#</th><th style="width:120px">Matrícula</th><th>Nome</th><th style="width:44px"></th></tr></thead>
              <tbody>${alunos
                .map(
                  (a, i) => `<tr>
                    <td class="texto-3">${i + 1}</td>
                    <td class="mono texto-2">${esc(a.matricula)}</td>
                    <td>${esc(a.nome)}</td>
                    <td><button class="mini" data-remover="${a.id}" title="Remover">×</button></td>
                  </tr>`,
                )
                .join('')}</tbody>
            </table>`
          : '<div class="vazio">Nenhum aluno ainda. Cole a lista no campo acima.</div>'
      }
    </div>`

  /* --------------------------------- gabarito -------------------------------- */

  let gabarito = [...turma.gabarito]

  function desenhaGabarito() {
    el('gabarito').innerHTML = gabarito
      .map(
        (marcada, i) => `
        <div class="questao">
          <div class="num">Q${i + 1}</div>
          <div class="alternativas">
            ${ALTERNATIVAS.map(
              (alt) =>
                `<button data-q="${i}" data-alt="${alt}" class="${marcada === alt ? 'marcada' : ''}">${alt}</button>`,
            ).join('')}
          </div>
        </div>`,
      )
      .join('')

    el('gabarito').querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        const i = Number(b.dataset.q)
        gabarito[i] = gabarito[i] === b.dataset.alt ? '' : b.dataset.alt
        desenhaGabarito()
      }
    })
  }
  desenhaGabarito()

  el('limpar-gabarito').onclick = () => {
    gabarito = Array(10).fill('')
    desenhaGabarito()
  }

  el('salvar-gabarito').onclick = async () => {
    await api(`/turmas/${turmaId}/gabarito`, { method: 'PUT', body: { gabarito } })
    const faltam = gabarito.filter((g) => !g).length
    avisar(faltam ? `Gabarito salvo — ainda faltam ${faltam} questões.` : 'Gabarito salvo e completo.', faltam ? 'info' : 'ok')
  }

  /* -------------------------------- configuração ------------------------------ */

  el('voltar').onclick = () => irPara(ehAdmin() ? 'admin-turmas' : 'turmas')

  el('salvar-config').onclick = async () => {
    await api(`/turmas/${turmaId}`, {
      method: 'PUT',
      body: {
        diaSemana: el('f-dia').value || null,
        curso: el('f-curso').value,
        turno: el('f-turno').value,
        ensalar: el('f-ensalar').checked,
      },
    })
    avisar('Configuração salva.')
  }

  /* ---------------------------------- alunos --------------------------------- */

  async function importar(modo) {
    const texto = el('colar').value
    if (!texto.trim()) return avisar('Cole a lista de alunos primeiro.', 'erro')
    if (modo === 'substituir' && !confirm('Isso apaga a lista atual e coloca a nova no lugar. Continuar?')) return

    try {
      const r = await api(`/turmas/${turmaId}/alunos/importar`, { method: 'POST', body: { texto, modo } })
      await viewTurma(turmaId)
      avisar(`${r.inseridos} novo(s), ${r.atualizados} atualizado(s). Total: ${r.total}.`)
      if (r.erros?.length) avisar(`${r.erros.length} linha(s) ignorada(s): ${r.erros[0]}`, 'erro')
    } catch (e) {
      avisar(e.message + (e.detalhes ? ` — ${e.detalhes[0]}` : ''), 'erro')
    }
  }

  el('importar-somar').onclick = () => importar('somar')
  el('importar-substituir').onclick = () => importar('substituir')

  el('add-aluno').onclick = async () => {
    const matricula = prompt('Matrícula:')
    if (!matricula) return
    const nome = prompt('Nome completo:')
    if (!nome) return
    try {
      await api(`/turmas/${turmaId}/alunos`, { method: 'POST', body: { matricula, nome } })
      await viewTurma(turmaId)
      avisar('Aluno adicionado.')
    } catch (e) {
      avisar(e.message, 'erro')
    }
  }

  if (el('limpar-alunos')) {
    el('limpar-alunos').onclick = async () => {
      if (!confirm(`Apagar os ${alunos.length} alunos desta turma?`)) return
      await api(`/turmas/${turmaId}/alunos`, { method: 'DELETE' })
      await viewTurma(turmaId)
      avisar('Lista de alunos apagada.')
    }
  }

  conteudo.querySelectorAll('[data-remover]').forEach((b) => {
    b.onclick = async () => {
      await api(`/turmas/${turmaId}/alunos/${b.dataset.remover}`, { method: 'DELETE' })
      await viewTurma(turmaId)
    }
  })
}

/* --------------------------------- trocar senha -------------------------------- */

async function viewSenha() {
  el('conteudo').innerHTML = `
    <div class="rotulo-secao">Conta</div>
    <h2 class="titulo">Trocar senha</h2>
    <div class="cartao cantos" style="max-width:420px"><div class="canto"></div>
      <label class="campo"><span>Senha atual</span><input type="password" id="s-atual" /></label>
      <label class="campo"><span>Nova senha</span><input type="password" id="s-nova" placeholder="mínimo 6 caracteres" /></label>
      <button class="acao" id="s-salvar">Salvar nova senha</button>
    </div>`

  el('s-salvar').onclick = async () => {
    try {
      await api('/auth/senha', { method: 'POST', body: { atual: el('s-atual').value, nova: el('s-nova').value } })
      el('s-atual').value = ''
      el('s-nova').value = ''
      avisar('Senha alterada.')
    } catch (e) {
      avisar(e.message, 'erro')
    }
  }
}
