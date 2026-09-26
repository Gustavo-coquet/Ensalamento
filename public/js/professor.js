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

    // Prévia da 1ª página ao lado dos dados: a miniatura em si é só visual
    // (pointer-events desligado no CSS) — o clique cai no quadro em volta e abre o PDF.
    const previa = t.prova
      ? `<div class="prova-caixa" data-ver-prova="${t.id}" title="Abrir ${esc(t.prova.nome)}">
           <iframe class="prova-miniatura" loading="lazy" title="Prévia da prova"
                   src="/api/turmas/${t.id}/prova#toolbar=0&navpanes=0&scrollbar=0&view=FitH"></iframe>
         </div>
         <div class="pequeno texto-3 prova-legenda">${esc(t.prova.nome)} · ${(t.prova.tamanho / 1048576).toFixed(1)} MB</div>`
      : `<div class="prova-vazia pequeno texto-3">
           <span class="prova-rotulo">sem prova anexada</span>
           <span class="prova-regra">arraste o PDF aqui<br />ou use o botão · até 10 MB</span>
         </div>`

    return `
      <div class="cartao cantos card-turma" data-turma="${t.id}">
        <div class="canto"></div>
        <div class="turma-conteudo">
          <div class="turma-dados" data-abrir-turma="${t.id}">
            <div class="rotulo-secao">${esc(ROTULO_CURSO[t.curso] || t.curso)}</div>
            <h3 style="margin-bottom:8px">${esc(t.disciplina)}</h3>
            <div class="pequeno texto-3" style="margin-bottom:12px">
              ${t.diaSemana ? esc(ROTULO_DIA[t.diaSemana]) : 'dia não definido'}
              · ${esc(ROTULO_TURNO[t.turno] || t.turno)}
              · ${t.totalAlunos} aluno${t.totalAlunos === 1 ? '' : 's'}
              · ${t.ensalar ? 'entra na mistura' : 'fora da mistura'}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">${pendencias.join('')}</div>
          </div>

          <div class="turma-prova" data-solta-prova="${t.id}">
            ${previa}
            <div class="linha-botoes" style="margin-top:8px;justify-content:center">
              <label class="botao-arquivo" title="Arquivo em PDF, com no máximo 10 MB">
                ${t.prova ? 'trocar' : 'anexar prova'}
                <input type="file" accept="application/pdf,.pdf" data-prova="${t.id}" hidden />
              </label>
              ${
                t.prova
                  ? `<button class="mini" data-remover-prova="${t.id}" title="Remover prova">×</button>`
                  : ''
              }
            </div>
            <div class="pequeno texto-3 prova-regra" style="margin-top:6px">PDF, até 10 MB · pode arrastar</div>
          </div>
        </div>
      </div>`
  })

  conteudo.innerHTML = `
    <div class="rotulo-secao">Minhas turmas</div>
    <h2 class="titulo">${turmas.length} turma${turmas.length === 1 ? '' : 's'} sob sua responsabilidade</h2>
    <div class="grade g2" style="margin-bottom:22px">${cartoes.join('')}</div>
    <div id="escolha-disciplinas"></div>`

  // só a área de dados abre a turma — os controles da prova ficam de fora, senão
  // clicar em "anexar" navegaria para outra tela no meio do upload
  conteudo.querySelectorAll('[data-abrir-turma]').forEach((area) => {
    area.onclick = () => irPara(`turma/${area.dataset.abrirTurma}`)
  })

  conteudo.querySelectorAll('[data-ver-prova]').forEach((caixa) => {
    caixa.onclick = () => window.open(`/api/turmas/${caixa.dataset.verProva}/prova`, '_blank')
  })

  conteudo.querySelectorAll('[data-prova]').forEach((campo) => {
    campo.onchange = async () => {
      const arquivo = campo.files?.[0]
      if (!arquivo) return
      const ok = await enviaProva(campo.dataset.prova, arquivo)
      if (!ok) campo.value = '' // deixa escolher o mesmo arquivo de novo depois de um erro
    }
  })

  // Arrastar o PDF de qualquer lugar do computador para cima do quadro da prova faz o
  // mesmo que o botão. A área inteira da direita do card aceita a soltura.
  conteudo.querySelectorAll('[data-solta-prova]').forEach((zona) => {
    const realce = (ligado) => zona.classList.toggle('arrastando', ligado)

    zona.ondragenter = (ev) => { ev.preventDefault(); realce(true) }
    zona.ondragover = (ev) => { ev.preventDefault(); realce(true) }
    // dragleave dispara também ao passar por cima dos filhos; só apaga o realce quando
    // o ponteiro sai da zona de verdade
    zona.ondragleave = (ev) => { if (!zona.contains(ev.relatedTarget)) realce(false) }

    zona.ondrop = async (ev) => {
      ev.preventDefault()
      realce(false)
      const arquivo = ev.dataTransfer?.files?.[0]
      if (!arquivo) return avisar('Não consegui ler o arquivo arrastado. Tente pelo botão.', 'erro')
      if (ev.dataTransfer.files.length > 1) {
        avisar('É uma prova por turma — usei o primeiro arquivo que você soltou.', 'info')
      }
      await enviaProva(zona.dataset.soltaProva, arquivo)
    }
  })

  conteudo.querySelectorAll('[data-remover-prova]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Remover a prova anexada desta turma?')) return
      try {
        await api(`/turmas/${b.dataset.removerProva}/prova`, { method: 'DELETE' })
        await viewMinhasTurmas()
        avisar('Prova removida.')
      } catch (e) {
        avisar(e.message, 'erro')
      }
    }
  })

  await montaEscolhaDisciplinas('escolha-disciplinas', viewMinhasTurmas)
}

/**
 * Editor das disciplinas de um professor: uma linha por disciplina, cada uma com
 * o seu dia e o seu turno. Usado tanto pelo professor quanto pelo administrador.
 *
 * `salvar(itens)` recebe [{disciplinaId, dia, turno}] e devolve o resultado da API.
 */
function editorDisciplinas({ alvo, disciplinas, itens, maximo = 10, salvar, aoTerminar, titulo, ajuda, professorId }) {
  let linhas = itens.map((i) => ({ ...i }))


  /** Dia+turno é agenda: o professor não pode estar em dois lugares na mesma hora. */
  function diasOcupados(indice) {
    const turnoDaLinha = linhas[indice]?.turno || 'NOTURNO'
    return new Set(
      linhas
        .filter((outra, i) => i !== indice && outra.dia && (outra.turno || 'NOTURNO') === turnoDaLinha)
        .map((outra) => outra.dia),
    )
  }

  function opcoesDia(indice) {
    const ocupados = diasOcupados(indice)
    const atual = linhas[indice]?.dia || ''
    return (
      '<option value="">— sem dia definido —</option>' +
      DIAS.map((d) => {
        const travado = ocupados.has(d) && atual !== d
        return `<option value="${d}" ${atual === d ? 'selected' : ''} ${travado ? 'disabled' : ''}>${
          ROTULO_DIA[d]
        }${travado ? ' — já ocupado' : ''}</option>`
      }).join('')
    )
  }

  /** Índices das linhas que caem no mesmo dia+turno de outra. */
  function indicesEmConflito() {
    const vistos = new Map()
    const conflitantes = new Set()
    linhas.forEach((l, i) => {
      if (!l.dia) return
      const chave = `${l.dia}|${l.turno || 'NOTURNO'}`
      if (vistos.has(chave)) {
        conflitantes.add(i)
        conflitantes.add(vistos.get(chave))
      } else {
        vistos.set(chave, i)
      }
    })
    return conflitantes
  }

  /** Em quais turnos essa disciplina é ofertada este semestre — null se não achar (não restringe). */
  function turnosDaDisciplina(disciplinaId) {
    const d = disciplinas.find((x) => Number(x.id) === Number(disciplinaId))
    if (!d) return null
    const permitidos = [d.ofertadaDiurno && 'DIURNO', d.ofertadaNoturno && 'NOTURNO'].filter(Boolean)
    return permitidos.length ? permitidos : null
  }

  function desenha() {
    const conflitantes = indicesEmConflito()

    // Uma disciplina pode aparecer em mais de uma linha do MESMO professor —
    // ele pode dar a mesma matéria de manhã numa turma e à noite em outra. E o dono é
    // por TURNO: alguém pode já ter o noturno dessa disciplina e o diurno continuar
    // livre pra este professor. Mostra os dois donos (dia/noite) juntos na mesma opção,
    // pra não esconder que o outro turno já tem gente — só BLOQUEIA quando o turno que
    // esta linha está usando agora é de outra pessoa.
    const opcoes = (selecionada, turnoAtual) =>
      ['<option value="">— escolher disciplina —</option>']
        .concat(
          disciplinas.map((d) => {
            const outroDiurno =
              d.professorIdDiurno && d.professorIdDiurno !== professorId ? d.professorNomeDiurno : null
            const outroNoturno =
              d.professorIdNoturno && d.professorIdNoturno !== professorId ? d.professorNomeNoturno : null

            const partes = []
            if (outroDiurno) partes.push(`dia: ${nomeExibicao(outroDiurno)}`)
            if (outroNoturno) partes.push(`noite: ${nomeExibicao(outroNoturno)}`)
            const marca = partes.length ? ` — ${partes.join(' · ')}` : ''

            const donoDoTurnoDaLinha = turnoAtual === 'DIURNO' ? outroDiurno : outroNoturno
            const deOutro = !!donoDoTurnoDaLinha && Number(selecionada) !== d.id

            return `<option value="${d.id}" ${Number(selecionada) === d.id ? 'selected' : ''} ${
              deOutro ? 'disabled' : ''
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
          <span>Turno</span><span></span>
        </div>
        ${
          linhas.length
            ? linhas
                .map(
                  (l, i) => `
              <div class="linha-disc ${conflitantes.has(i) ? 'em-conflito' : ''}">
                <select data-campo="disciplinaId" data-i="${i}">${opcoes(l.disciplinaId, l.turno || 'NOTURNO')}</select>
                ${selectCursos(l.curso || 'CICLO_BASICO', `data-campo="curso" data-i="${i}"`)}
                <select data-campo="dia" data-i="${i}">${opcoesDia(i)}</select>
                ${selectTurnos(l.turno || 'NOTURNO', `data-campo="turno" data-i="${i}"`, turnosDaDisciplina(l.disciplinaId))}
                <button class="mini" data-remover-linha="${i}" title="Remover">×</button>
              </div>`,
                )
                .join('')
            : '<div class="vazio">Nenhuma disciplina ainda.</div>'
        }
      </div>

      ${
        conflitantes.size
          ? `<p class="pequeno" style="color:var(--perigo,#ff6b6b);margin-top:10px">
               Duas disciplinas marcadas no mesmo dia e turno (em vermelho).
               Ninguém dá duas aulas ao mesmo tempo — mude o dia ou o turno de uma delas.
             </p>`
          : ''
      }

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

        // trocou de disciplina e o turno atual não é ofertado nela? ajusta sozinho
        if (campo.dataset.campo === 'disciplinaId') {
          const permitidos = turnosDaDisciplina(linha.disciplinaId)
          if (permitidos && !permitidos.includes(linha.turno || 'NOTURNO')) {
            linha.turno = permitidos[0]
          }
        }

        if (['disciplinaId', 'dia', 'turno'].includes(campo.dataset.campo)) desenha()
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
        dia: '',
        turno: ultima?.turno || 'NOTURNO',
      })
      desenha()
    }

    el('ed-salvar').onclick = async () => {
      const prontas = linhas.filter((l) => Number(l.disciplinaId))
      const semDisciplina = linhas.length - prontas.length
      if (semDisciplina) return avisar('Tem linha sem disciplina escolhida.', 'erro')

      const agenda = new Map()
      for (const l of prontas) {
        if (!l.dia) continue
        const chave = `${l.dia}|${l.turno || 'NOTURNO'}`
        if (agenda.has(chave)) {
          return avisar(
            `Duas disciplinas em ${ROTULO_DIA[l.dia]} de ${(ROTULO_TURNO[l.turno] || '').toLowerCase()}. ` +
              'Mude o dia ou o turno de uma delas.',
            'erro',
          )
        }
        agenda.set(chave, true)
      }

      try {
        const r = await salvar(
          prontas.map((l) => ({
            disciplinaId: Number(l.disciplinaId),
            curso: l.curso || 'CICLO_BASICO',
            dia: l.dia || null,
            turno: l.turno,
          })),
        )
        // Turma com aluno cadastrado não é liberada só por ter sumido da lista — avisa
        // que ela continua sob responsabilidade dele em vez de virar "sem professor".
        if (r.mantidas?.length) {
          const lista = r.mantidas
            .map(
              (m) =>
                `${m.disciplina} (${m.dia ? ROTULO_DIA[m.dia] : 'sem dia'}, ${(
                  ROTULO_TURNO[m.turno] || m.turno
                ).toLowerCase()})`,
            )
            .join(', ')
          avisar(
            `Turma com aluno cadastrado não sai sozinha da sua lista: ${lista} continua com você. ` +
              'Se precisar tirá-la de vez, fale com a coordenação.',
            'info',
          )
        }

        if (r.ocupadas?.length) {
          avisar(`Já tem dono: ${r.ocupadas.map((o) => `${o.disciplina} (${nomeExibicao(o.professor)})`).join(', ')}`, 'info')
        } else if (r.naoOfertadas?.length) {
          avisar(`Fora da oferta deste semestre: ${r.naoOfertadas.join(', ')}`, 'info')
        } else if (r.conflitos?.length) {
          avisar(r.conflitos.join(' / '), 'erro')
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

/**
 * Envia o PDF da prova de uma turma. Vale para os dois caminhos — o botão "anexar" e o
 * arquivo arrastado para cima do card —, por isso a checagem mora aqui, num lugar só.
 * Devolve true quando deu certo.
 */
async function enviaProva(turmaId, arquivo) {
  // confere no navegador antes de subir 10 MB à toa; o servidor confere tudo de novo
  if (arquivo.type !== 'application/pdf' && !arquivo.name.toLowerCase().endsWith('.pdf')) {
    avisar(`"${arquivo.name}" não é PDF. A prova precisa ser um arquivo PDF.`, 'erro')
    return false
  }
  if (arquivo.size > 10 * 1048576) {
    avisar(
      `"${arquivo.name}" tem ${(arquivo.size / 1048576).toFixed(1)} MB e o limite é 10 MB. ` +
        'Exportar o PDF direto do Word costuma resolver — arquivo escaneado fica bem maior.',
      'erro',
    )
    return false
  }

  try {
    const r = await enviarArquivo(
      `/turmas/${turmaId}/prova?nome=${encodeURIComponent(arquivo.name)}`,
      arquivo,
    )
    await viewMinhasTurmas()
    // o upload já valeu mesmo se o e-mail automático falhar — avisa sem assustar
    if (r?.email === 'erro') {
      avisar('Prova anexada, mas o e-mail automático para a coordenação falhou.', 'info')
    } else if (r?.email === 'enviado') {
      avisar('Prova anexada e enviada por e-mail para a coordenação.')
    } else {
      avisar('Prova anexada.')
    }
    return true
  } catch (e) {
    avisar(e.message, 'erro')
    return false
  }
}

/** Painel do professor: ele mesmo monta a lista das disciplinas que leciona. */
async function montaEscolhaDisciplinas(alvoId, aoSalvar) {
  const [catalogo, { turmas }] = await Promise.all([
    api('/turmas/disciplinas/catalogo'),
    api('/turmas'),
  ])

  // Uma linha por TURMA, não por disciplina: o mesmo professor pode ter a mesma
  // disciplina em duas vagas (ex.: Física II numa turma de manhã e em outra à noite).
  // Isso aqui era um Map por número de disciplina, então a segunda turma nem aparecia
  // na lista — e salvar sem ela devolvia aquela turma para "sem professor" sem avisar.
  // O banco e a rota de salvar já tratam vaga como disciplina+dia+turno; só a tela não.
  const meusNumeros = new Set(turmas.map((t) => t.numero))
  const porNumero = new Map(catalogo.disciplinas.map((d) => [d.numero, d]))

  const disciplinas = catalogo.disciplinas.filter(
    (d) => d.ofertadaDiurno || d.ofertadaNoturno || meusNumeros.has(d.numero),
  )

  const itens = turmas
    .filter((t) => porNumero.has(t.numero))
    .map((t) => ({
      disciplinaId: porNumero.get(t.numero).id,
      curso: t.curso || 'CICLO_BASICO',
      dia: t.diaSemana || '',
      turno: t.turno || 'NOTURNO',
    }))

  el(alvoId).innerHTML = '<div class="cartao cantos"><div class="canto"></div><div id="ed-corpo"></div></div>'

  editorDisciplinas({
    alvo: el('ed-corpo'),
    disciplinas,
    itens,
    maximo: catalogo.maximo || 10,
    professorId: usuarioAtual.id,
    titulo: 'Minhas disciplinas',
    ajuda:
      'Uma linha por disciplina que você leciona, com o curso, o dia e o turno. Se ela entra na ' +
      'mistura de salas quem decide agora é a coordenação, na tela de Oferta do semestre. ' +
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

  // volta para a lista de onde a turma foi aberta (Minhas turmas ou o quadro geral)
  el('voltar').onclick = () =>
    irPara(listaDeTurmasAnterior || (vePainelAdmin() ? 'admin-turmas' : 'turmas'))

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
