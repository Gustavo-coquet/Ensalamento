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

/* ------------------------------- ampulheta -------------------------------- */

let chamadasAbertas = 0
let timerAmpulheta = null

/** Mostra a ampulheta só se a resposta demorar — evita piscar em chamada rápida. */
function abreAmpulheta() {
  chamadasAbertas++
  if (timerAmpulheta || chamadasAbertas > 1) return
  timerAmpulheta = setTimeout(() => {
    document.body.classList.add('carregando')
    let capa = el('ampulheta')
    if (!capa) {
      capa = document.createElement('div')
      capa.id = 'ampulheta'
      capa.innerHTML = '<div class="giro"></div><span>carregando…</span>'
      document.body.appendChild(capa)
    }
    capa.classList.add('visivel')
  }, 220)
}

function fechaAmpulheta() {
  chamadasAbertas = Math.max(0, chamadasAbertas - 1)
  if (chamadasAbertas > 0) return

  clearTimeout(timerAmpulheta)
  timerAmpulheta = null
  document.body.classList.remove('carregando')
  el('ampulheta')?.classList.remove('visivel')
}

async function api(caminho, opcoes = {}) {
  abreAmpulheta()
  try {
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
  } finally {
    fechaAmpulheta()
  }
}

function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  )
}

function el(id) { return document.getElementById(id) }

const CONECTIVOS_NOME = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

/**
 * Padroniza a exibição de um nome próprio em Title Case, não importa como a pessoa
 * digitou ("joão da silva", "JOÃO DA SILVA" ou "João Da Silva" viram "João da Silva").
 * Não mexe no que está salvo no banco — é só pra tela.
 */
function nomeExibicao(nome) {
  return String(nome ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((palavra, i) =>
      i > 0 && CONECTIVOS_NOME.has(palavra)
        ? palavra
        : palavra
            .split('-')
            .map((parte) => (parte ? parte.charAt(0).toUpperCase() + parte.slice(1) : parte))
            .join('-'),
    )
    .join(' ')
}

/**
 * Nome do professor reduzido a primeiro + último nome — só para os quadros estreitos de
 * Turmas, onde um nome comprido ("Mariana Navega Custodio de Souza") empurrava a linha
 * pra duas e deixava o quadro pesado. Não mexe no nome guardado nem em outras telas.
 */
function nomeCompactoProfessor(nome) {
  const partes = nomeExibicao(nome).trim().split(/\s+/).filter(Boolean)
  if (partes.length <= 2) return partes.join(' ')
  return `${partes[0]} ${partes[partes.length - 1]}`
}

// Nome de disciplina não abrevia se já couber numa linha só do quadro.
const LIMITE_NOME_QUADRO = 32

/**
 * Abrevia a(s) palavra(s) mais compridas do nome da disciplina ("Geometria" -> "Geo.")
 * até caber numa linha só nos quadros de Turmas — só mexe se o nome não couber; nomes
 * curtos saem exatamente como estão. Também é só para exibição nos quadros.
 */
function nomeCompactoDisciplina(nome) {
  const texto = String(nome ?? '')
  if (texto.length <= LIMITE_NOME_QUADRO) return texto

  const palavras = texto.split(' ')
  const candidatas = palavras
    .map((p, i) => ({ i, tamanho: p.length }))
    .filter(({ i, tamanho }) => tamanho > 4 && !palavras[i].endsWith('.'))
    .sort((a, b) => b.tamanho - a.tamanho)

  for (const { i } of candidatas) {
    palavras[i] = palavras[i].slice(0, 3) + '.'
    if (palavras.join(' ').length <= LIMITE_NOME_QUADRO) break
  }
  return palavras.join(' ')
}

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

/**
 * `permitidos`, se passado, restringe as opções aos turnos em que a disciplina escolhida
 * é realmente ofertada — o turno atual nunca fica bloqueado, mesmo se não estiver na lista
 * (evita esconder um valor que já estava salvo).
 */
function selectTurnos(valorAtual, extra = '', permitidos = null) {
  const opcoes = TURNOS.map((t) => {
    const bloqueado = Array.isArray(permitidos) && !permitidos.includes(t) && t !== valorAtual
    return `<option value="${t}" ${t === valorAtual ? 'selected' : ''} ${bloqueado ? 'disabled' : ''}>${
      ROTULO_TURNO[t]
    }${bloqueado ? ' — não ofertada' : ''}</option>`
  })
  return `<select ${extra}>${opcoes.join('')}</select>`
}

function baixar(caminho) {
  window.location.href = '/api' + caminho
}
