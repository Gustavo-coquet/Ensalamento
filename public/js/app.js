/* Sessão, menu lateral e roteamento por hash. */

let usuarioAtual = null

function ehAdmin() {
  return usuarioAtual?.papel === 'ADMIN'
}

const MENU_ADMIN = [
  { rota: 'painel', texto: 'Painel' },
  { rota: 'salas', texto: 'Gerar salas' },
  { rota: 'admin-turmas', texto: 'Turmas' },
  { rota: 'professores', texto: 'Professores' },
  { separador: true },
  { rota: 'manutencao', texto: 'Manutenção' },
  { rota: 'senha', texto: 'Trocar senha' },
]

const MENU_PROFESSOR = [
  { rota: 'turmas', texto: 'Minhas turmas' },
  { separador: true },
  { rota: 'senha', texto: 'Trocar senha' },
]

function desenhaMenu(rotaAtiva) {
  const itens = ehAdmin() ? MENU_ADMIN : MENU_PROFESSOR
  el('menu').innerHTML = itens
    .map((i) =>
      i.separador
        ? '<hr />'
        : `<button data-rota="${i.rota}" class="${rotaAtiva === i.rota ? 'ativo' : ''}">${i.texto}</button>`,
    )
    .join('')

  el('menu').querySelectorAll('[data-rota]').forEach((b) => {
    b.onclick = () => irPara(b.dataset.rota)
  })
}

function irPara(rota) {
  if (location.hash.slice(1) === rota) rotear()
  else location.hash = rota
}

async function rotear() {
  if (!usuarioAtual) return

  const rota = location.hash.slice(1) || (ehAdmin() ? 'painel' : 'turmas')
  const [base, param] = rota.split('/')

  desenhaMenu(base === 'turma' ? (ehAdmin() ? 'admin-turmas' : 'turmas') : base)
  el('conteudo').innerHTML = '<div class="vazio">carregando…</div>'

  const telas = {
    painel: viewPainel,
    salas: viewSalas,
    'admin-turmas': viewAdminTurmas,
    professores: viewProfessores,
    manutencao: viewManutencao,
    turmas: viewMinhasTurmas,
    senha: viewSenha,
    turma: () => viewTurma(param),
  }

  const somenteAdmin = ['painel', 'salas', 'admin-turmas', 'professores', 'manutencao']
  if (somenteAdmin.includes(base) && !ehAdmin()) return irPara('turmas')

  const tela = telas[base]
  if (!tela) return irPara(ehAdmin() ? 'painel' : 'turmas')

  try {
    await tela()
  } catch (e) {
    if (e.status === 401) return sair(false)
    el('conteudo').innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`
  }
}

/* ---------------------------------- sessão ---------------------------------- */

function mostrarApp() {
  el('tela-login').classList.add('oculto')
  el('app').classList.remove('oculto')
  el('topo-nome').textContent = usuarioAtual.nome
  el('topo-papel').textContent = ehAdmin() ? 'coordenação' : 'professor'
  rotear()
}

function mostrarLogin() {
  el('app').classList.add('oculto')
  el('tela-login').classList.remove('oculto')
}

async function sair(chamarApi = true) {
  if (chamarApi) await api('/auth/logout', { method: 'POST' }).catch(() => {})
  usuarioAtual = null
  location.hash = ''
  mostrarLogin()
}

el('form-login').onsubmit = async (ev) => {
  ev.preventDefault()
  const dados = new FormData(ev.target)
  const erro = el('erro-login')
  erro.classList.add('oculto')

  try {
    const r = await api('/auth/login', {
      method: 'POST',
      body: { email: dados.get('email'), senha: dados.get('senha') },
    })
    usuarioAtual = r.usuario
    mostrarApp()
  } catch (e) {
    erro.textContent = e.message
    erro.classList.remove('oculto')
  }
}

el('btn-sair').onclick = () => sair()
window.addEventListener('hashchange', rotear)

/* --------------------------------- inicial ---------------------------------- */

;(async () => {
  try {
    const r = await api('/auth/eu')
    usuarioAtual = r.usuario
    mostrarApp()
  } catch {
    mostrarLogin()
  }
})()
