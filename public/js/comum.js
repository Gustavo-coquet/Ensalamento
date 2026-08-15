/* Helpers compartilhados: chamadas à API, escape de HTML e rótulos. */

const DIAS = ['SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA']

const ROTULO_DIA = {
  SEGUNDA: 'Segunda-feira',
  TERCA: 'Terça-feira',
  QUARTA: 'Quarta-feira',
  QUINTA: 'Quinta-feira',
  SEXTA: 'Sexta-feira',
}

const ROTULO_CURSO = {
  CICLO_BASICO: 'Eng. Ciclo Básico',
  ENG_PRODUCAO: 'Eng. de Produção',
  ENG_CIVIL: 'Eng. Civil',
}

const TURNOS = ['DIURNO', 'NOTURNO']

const ROTULO_TURNO = {
  DIURNO: 'Diurno',
  NOTURNO: 'Noturno',
}

const ALTERNATIVAS = ['A', 'B', 'C', 'D', 'E']

async function api(caminho, opcoes = {}) {
  const resposta = await fetch('/api' + caminho, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
  })

  let dados = null
  try { dados = await resposta.json() } catch { /* resposta sem corpo */ }

  if (!resposta.ok) {
    const erro = new Error(dados?.erro || `Erro ${resposta.status}`)
    erro.detalhes = dados?.detalhes
    erro.status = resposta.status
    throw erro
  }
  return dados
}

function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  )
}

function el(id) { return document.getElementById(id) }

/** Minúsculas sem acento — para buscar disciplina sem se preocupar com "ç" e "á". */
function chaveSimples(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

/** Mostra um aviso temporário no topo do conteúdo. */
function avisar(mensagem, tipo = 'ok') {
  const alvo = el('conteudo')
  const div = document.createElement('div')
  div.className = `aviso ${tipo}`
  div.textContent = mensagem
  alvo.prepend(div)
  setTimeout(() => div.remove(), 5200)
}

function selectDias(valorAtual, extra = '') {
  const opcoes = ['<option value="">— sem dia definido —</option>']
    .concat(DIAS.map((d) => `<option value="${d}"${valorAtual === d ? ' selected' : ''}>${ROTULO_DIA[d]}</option>`))
  return `<select ${extra}>${opcoes.join('')}</select>`
}

function selectCursos(valorAtual, extra = '') {
  const opcoes = Object.entries(ROTULO_CURSO).map(
    ([v, r]) => `<option value="${v}"${valorAtual === v ? ' selected' : ''}>${r}</option>`,
  )
  return `<select ${extra}>${opcoes.join('')}</select>`
}

function selectTurnos(valorAtual, extra = '') {
  const opcoes = TURNOS.map(
    (t) => `<option value="${t}"${valorAtual === t ? ' selected' : ''}>${ROTULO_TURNO[t]}</option>`,
  )
  return `<select ${extra}>${opcoes.join('')}</select>`
}

function baixar(caminho) {
  window.location.href = '/api' + caminho
}
