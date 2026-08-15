import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { q1 } from './db'

const SEGREDO = process.env.JWT_SECRET || 'troque-este-segredo-em-producao'
const COOKIE = 'ensalamento_sessao'

export type Papel = 'ADMIN' | 'PROFESSOR'
export type Sessao = { id: string; nome: string; email: string; papel: Papel }

declare global {
  namespace Express {
    interface Request {
      usuario?: Sessao
    }
  }
}

export function criarCookie(res: Response, sessao: Sessao) {
  const token = jwt.sign(sessao, SEGREDO, { expiresIn: '30d' })
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  })
}

export function limparCookie(res: Response) {
  res.clearCookie(COOKIE)
}

/** Lê o cookie e popula req.usuario, sem bloquear a requisição. */
export function lerSessao(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE]
  if (token) {
    try {
      const d = jwt.verify(token, SEGREDO) as Sessao
      req.usuario = { id: d.id, nome: d.nome, email: d.email, papel: d.papel }
    } catch {
      /* token inválido ou expirado — segue sem sessão */
    }
  }
  next()
}

export function exigeLogin(req: Request, res: Response, next: NextFunction) {
  if (!req.usuario) return res.status(401).json({ erro: 'Não autenticado' })
  next()
}

export function exigeAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.usuario) return res.status(401).json({ erro: 'Não autenticado' })
  if (req.usuario.papel !== 'ADMIN') return res.status(403).json({ erro: 'Acesso restrito à coordenação' })
  next()
}

export type TurmaBase = {
  id: string
  disciplina_id: number
  professor_id: string | null
  curso: string
  dia_semana: string | null
  ensalar: boolean
  turno: string
  gabarito: string[]
  numero: number
  disciplina: string
  professor: string | null
}

/** Coordenador acessa qualquer turma; professor só as dele. Devolve null se não puder. */
export async function turmaPermitida(usuario: Sessao, turmaId: string): Promise<TurmaBase | null> {
  if (!/^[0-9a-f-]{36}$/i.test(turmaId)) return null

  const turma = await q1<TurmaBase>(
    `SELECT t.*, d.numero, d.nome AS disciplina, u.nome AS professor
       FROM turma t
       JOIN disciplina d ON d.id = t.disciplina_id
       LEFT JOIN usuario u ON u.id = t.professor_id
      WHERE t.id = $1`,
    [turmaId],
  )

  if (!turma) return null
  if (usuario.papel !== 'ADMIN' && turma.professor_id !== usuario.id) return null
  return turma
}
