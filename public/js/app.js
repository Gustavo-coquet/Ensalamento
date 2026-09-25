/* Sessão, menu lateral e roteamento por hash. */

let usuarioAtual = null

function ehAdmin() {
  return usuarioAtual?.papel === 'ADMIN'
}

function ehCoordenador() {
  return usuarioAtual?.papel === 'COORDENADOR'
}

/** Admin e coordenador têm o mesmo painel/quadro de leitura + gerar salas — só a gestão
 * (cadastro em lote, manutenção) é exclusiva do admin. */
function vePainelAdmin() {
  return ehAdmin() || ehCoordenador()
}

// O administrador também dá aula, então tem "Minhas turmas" como qualquer professor —
// é onde ele cuida das disciplinas dele (gabarito, alunos, anexo da prova). "Turmas" é
// o quadro geral, com as turmas de todo mundo; as duas telas são coisas diferentes.
const MENU_ADMIN = [
  { rota: 'painel', texto: 'Painel' },
  { rota: 'salas', texto: 'Gerar salas' },
  { rota: 'admin-turmas', texto: 'Turmas' },
  { rota: 'importar', texto: 'Cadastro em lote' },
  { separador: true },
  { rota: 'turmas', texto: 'Minhas turmas' },
  { separador: true },
  { rota: 'manutencao', texto: 'Manutenção' },
  { rota: 'senha', texto: 'Trocar senha' },
]

// Coordenador enxerga o mesmo painel/quadro do admin e pode gerar/apagar salas, mas não
// tem cadastro em lote nem manutenção — e continua com "Minhas turmas" pra cuidar só da
// disciplina que é dele (escolher disciplina, gabarito, alunos), igual um professor.
const MENU_COORDENADOR = [
  { rota: 'painel', texto: 'Painel' },
  { rota: 'salas', texto: 'Gerar salas' },
  { rota: 'admin-turmas', texto: 'Turmas' },
  { separador: true },
  { rota: 'turmas', texto: 'Minhas turmas' },
  { separador: true },
  { rota: 'senha', texto: 'Trocar senha' },
]

const MENU_PROFESSOR = [
  { rota: 'turmas', texto: 'Minhas turmas' },
  { separador: true },
  { rota: 'senha', texto: 'Trocar senha' },
]

function desenhaMenu(rotaAtiva) {
  const itens = ehAdmin() ? MENU_ADMIN : ehCoordenador() ? MENU_COORDENADOR : MENU_PROFESSOR
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

// De qual lista o usuário entrou numa turma — quem tem as duas telas ("Minhas turmas" e
// o quadro geral) precisa voltar para a certa, não sempre para o quadro.
let listaDeTurmasAnterior = null

async function rotear() {
  if (!usuarioAtual) return

  const rota = location.hash.slice(1) || (vePainelAdmin() ? 'painel' : 'turmas')
  const [base, param] = rota.split('/')

  if (base === 'turmas' || base === 'admin-turmas') listaDeTurmasAnterior = base

  desenhaMenu(base === 'turma' ? listaDeTurmasAnterior || (vePainelAdmin() ? 'admin-turmas' : 'turmas') : base)
  el('conteudo').innerHTML = '<div class="vazio">carregando…</div>'

  const telas = {
    painel: viewPainel,
    salas: viewSalas,
    'admin-turmas': viewAdminTurmas,
    importar: viewImportar,
    manutencao: viewManutencao,
    turmas: viewMinhasTurmas,
    senha: viewSenha,
    turma: () => viewTurma(param),
  }

  // Cadastro em lote e Manutenção continuam só do admin — painel/salas/quadro de turmas
  // o coordenador também usa.
  const somenteAdmin = ['importar', 'manutencao']
  const somenteAdminOuCoordenador = ['painel', 'salas', 'admin-turmas']
  if (somenteAdmin.includes(base) && !ehAdmin()) return irPara(vePainelAdmin() ? 'painel' : 'turmas')
  if (somenteAdminOuCoordenador.includes(base) && !vePainelAdmin()) return irPara('turmas')

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
  el('topo-nome').textContent = nomeExibicao(usuarioAtual.nome)
  el('topo-papel').textContent = ehAdmin() ? 'administrador' : ehCoordenador() ? 'coordenador' : 'professor'
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
