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
 * Editor das disciplinas de um professor: uma linha por disciplina, cada uma com
 * o seu dia e o seu turno. Usado tanto pelo professor quanto pelo administrador.
 *
 * `salvar(itens)` recebe [{disciplinaId, dia, turno}] e devolve o resultado da API.
 */
function editorDisciplinas({ alvo, disciplinas, itens, maximo = 10, salvar, aoTerminar, titulo, ajuda }) {
  let linhas = itens.map((i) => ({ ...i }))


  function desenha() {
    const usadas = new Set(linhas.map((l) => Number(l.disciplinaId)).filter(Boolean))

    const opcoes = (selecionada) =>
      ['<option value="">— escolher disciplina —</option>']
        .concat(
          disciplinas.map((d) => {
            const jaNaLista = usadas.has(d.id) && Number(selecionada) !== d.id
            const deOutro = d.bloqueada && Number(selecionada) !== d.id
            const marca = deOutro ? ` — ${d.professorNome}` : ''
            return `<option value="${d.id}" ${Number(selecionada) === d.id ? 'selected' : ''} ${
              jaNaLista || deOutro ? 'disabled' : ''
            }>${d.numero} — ${esc(d.nome)}${esc(marca)}</option>`
          }),
        )
        .join('')

    alvo.innerHTML = `
      <div class="rotulo-secao" style="margin-bottom:6px">${esc(titulo)}</div>
      <p class="pequeno texto-3" style="margin-bottom:14px">${ajuda}</p>

      <div class="linhas-disc">
        <div class="cabecalho-disc pequeno texto-3">
          <span>Disciplina</span><span>Curso</span><span>Dia da prova</span>
          <span>Turno</span><span>Na mistura</span><span></span>
        </div>
        ${
          linhas.length
            ? linhas
                .map(
                  (l, i) => `
              <div class="linha-disc">
                <select data-campo="disciplinaId" data-i="${i}">${opcoes(l.disciplinaId)}</select>
                ${selectCursos(l.curso || 'CICLO_BASICO', `data-campo="curso" data-i="${i}"`)}
                ${selectDias(l.dia || '', `data-campo="dia" data-i="${i}"`)}
                ${selectTurnos(l.turno || 'NOTURNO', `data-campo="turno" data-i="${i}"`)}
                <label class="caixa-mistura" title="Desmarque se os alunos fazem a prova na própria sala">
                  <input type="checkbox" data-campo="ensalar" data-i="${i}" ${l.ensalar === false ? '' : 'checked'} />
                </label>
                <button class="mini" data-remover-linha="${i}" title="Remover">×</button>
              </div>`,
                )
                .join('')
            : '<div class="vazio">Nenhuma disciplina ainda.</div>'
        }
      </div>

      <div class="linha-botoes" style="margin-top:14px">
        <button class="secundaria" id="ed-add" ${linhas.length >= maximo ? 'disabled' : ''}>
          + adicionar disciplina
        </button>
        <button class="acao" id="ed-salvar">Salvar</button>
        <span class="pequeno texto-3">${linhas.length} de ${maximo}</span>
      </div>`

    alvo.querySelectorAll('[data-campo]').forEach((campo) => {
      campo.onchange = () => {
        const linha = linhas[Number(campo.dataset.i)]
        linha[campo.dataset.campo] = campo.type === 'checkbox' ? campo.checked : campo.value
        if (campo.dataset.campo === 'disciplinaId') desenha()
      }
    })

    alvo.querySelectorAll('[data-remover-linha]').forEach((b) => {
      b.onclick = () => {
        linhas.splice(Number(b.dataset.removerLinha), 1)
        desenha()
      }
    })

    el('ed-add').onclick = () => {
      if (linhas.length >= maximo) return
      const ultima = linhas[linhas.length - 1]
      linhas.push({
        disciplinaId: '',
        curso: ultima?.curso || 'CICLO_BASICO',
        dia: ultima?.dia || '',
        turno: ultima?.turno || 'NOTURNO',
        ensalar: true,
      })
      desenha()
    }

    el('ed-salvar').onclick = async () => {
      const prontas = linhas.filter((l) => Number(l.disciplinaId))
      const semDisciplina = linhas.length - prontas.length
      if (semDisciplina) return avisar('Tem linha sem disciplina escolhida.', 'erro')

      try {
        const r = await salvar(
          prontas.map((l) => ({
            disciplinaId: Number(l.disciplinaId),
            curso: l.curso || 'CICLO_BASICO',
            dia: l.dia || null,
            turno: l.turno,
            ensalar: l.ensalar !== false,
          })),
        )
        if (r.ocupadas?.length) {
          avisar(`Já tem dono: ${r.ocupadas.map((o) => `${o.disciplina} (${o.professor})`).join(', ')}`, 'info')
        } else {
          avisar(`${r.vinculadas} disciplina(s) salva(s).`)
        }
        if (aoTerminar) await aoTerminar()
      } catch (e) {
        avisar(e.message, 'erro')
      }
    }
  }

  desenha()
}

/** Painel do professor: ele mesmo monta a lista das disciplinas que leciona. */
async function montaEscolhaDisciplinas(alvoId, aoSalvar) {
  const [catalogo, { turmas }] = await Promise.all([
    api('/turmas/disciplinas/catalogo'),
    api('/turmas'),
  ])

  const meus = new Map(turmas.map((t) => [t.numero, t]))

  const disciplinas = catalogo.disciplinas.map((d) => ({
    ...d,
    bloqueada: !!d.professorId && !meus.has(d.numero),
  }))

  const itens = catalogo.disciplinas
    .filter((d) => meus.has(d.numero))
    .map((d) => {
      const t = meus.get(d.numero)
      return {
        disciplinaId: d.id,
        curso: t.curso || 'CICLO_BASICO',
        dia: t.diaSemana || '',
        turno: t.turno || 'NOTURNO',
        ensalar: t.ensalar !== false,
      }
    })

  el(alvoId).innerHTML = '<div class="cartao cantos"><div class="canto"></div><div id="ed-corpo"></div></div>'

  editorDisciplinas({
    alvo: el('ed-corpo'),
    disciplinas,
    itens,
    maximo: catalogo.maximo || 10,
    titulo: 'Minhas disciplinas',
    ajuda:
      'Uma linha por disciplina que você leciona, com o curso, o dia, o turno e se ela entra ' +
      'na mistura de salas (desmarque se os alunos fazem a prova na própria sala). ' +
      'Disciplina que já é de outro professor aparece com o nome dele e não pode ser escolhida. ' +
      'Tirar uma linha devolve a disciplina para a lista de disponíveis.',
    salvar: (itens) => api('/turmas/minhas-disciplinas', { method: 'POST', body: { itens } }),
    aoTerminar: aoSalvar,
  })
}

async function viewTurma(turmaId) {
  const { turma, alunos } = await api(`/turmas/${turmaId}`)
  const conteudo = el('conteudo')

  conteudo.innerHTML = `
    <button class="secundaria nao-imprime" id="voltar" style="margin-bottom:18px">← voltar</button>

    <div class="rotulo-secao">Disciplina ${turma.numero}</div>
    <h2 class="titulo">${esc(turma.disciplina)}</h2>

    <p class="pequeno texto-3" style="margin:-10px 0 20px">
      ${turma.diaSemana ? esc(ROTULO_DIA[turma.diaSemana]) : 'dia não definido'}
      · ${esc(ROTULO_TURNO[turma.turno] || turma.turno)}
      · ${esc(ROTULO_CURSO[turma.curso] || turma.curso)}
      · ${turma.ensalar ? 'entra na mistura de salas' : 'fora da mistura'}
      — para mudar, use a lista de disciplinas em <em>Minhas turmas</em>.
    </p>

    <div style="margin-bottom:22px">
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

  el('voltar').onclick = () => irPara(ehAdmin() ? 'admin-turmas' : 'turmas')

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
