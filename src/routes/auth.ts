import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { q, q1 } from '../lib/db'
import { criarCookie, limparCookie, exigeLogin, type Papel } from '../lib/auth'

export const rotasAuth = Router()

type LinhaUsuario = { id: string; nome: string; email: string; senha_hash: string; papel: Papel; ativo: boolean }

rotasAuth.post('/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const senha = String(req.body?.senha ?? '')
  if (!email || !senha) return res.status(400).json({ erro: 'Informe e-mail e senha' })

  const usuario = await q1<LinhaUsuario>('SELECT * FROM usuario WHERE email = $1', [email])
  if (!usuario || !usuario.ativo || !(await bcrypt.compare(senha, usuario.senha_hash))) {
    return res.status(401).json({ erro: 'E-mail ou senha inválidos' })
  }

  const sessao = { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel }
  criarCookie(res, sessao)
  res.json({ usuario: sessao })
})

rotasAuth.post('/logout', (_req, res) => {
  limparCookie(res)
  res.json({ ok: true })
})

rotasAuth.get('/eu', (req, res) => {
  if (!req.usuario) return res.status(401).json({ erro: 'Não autenticado' })
  res.json({ usuario: req.usuario })
})

rotasAuth.post('/senha', exigeLogin, async (req, res) => {
  const atual = String(req.body?.atual ?? '')
  const nova = String(req.body?.nova ?? '')
  if (nova.length < 6) return res.status(400).json({ erro: 'A nova senha precisa ter ao menos 6 caracteres' })

  const usuario = await q1<LinhaUsuario>('SELECT * FROM usuario WHERE id = $1', [req.usuario!.id])
  if (!usuario || !(await bcrypt.compare(atual, usuario.senha_hash))) {
    return res.status(400).json({ erro: 'Senha atual incorreta' })
  }

  await q('UPDATE usuario SET senha_hash = $1 WHERE id = $2', [await bcrypt.hash(nova, 10), usuario.id])
  res.json({ ok: true })
})
