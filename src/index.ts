import 'dotenv/config'
import 'express-async-errors'
import path from 'node:path'
import express from 'express'
import cookieParser from 'cookie-parser'
import { lerSessao } from './lib/auth'
import { migrar } from './lib/migracoes'
import { semear } from './lib/semear'
import { rotasAuth } from './routes/auth'
import { rotasTurmas } from './routes/turmas'
import { rotasAdmin } from './routes/admin'

const app = express()
const publico = path.join(__dirname, '..', 'public')

app.use(express.json({ limit: '4mb' }))
app.use(cookieParser())
app.use(lerSessao)

app.get('/api/saude', (_req, res) => res.json({ ok: true }))
app.use('/api/auth', rotasAuth)
app.use('/api/turmas', rotasTurmas)
app.use('/api/admin', rotasAdmin)

app.use(express.static(publico))

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ erro: 'Rota não encontrada' })
  res.sendFile(path.join(publico, 'index.html'))
})

app.use((erro: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(erro)
  if (erro?.code === '23505') return res.status(409).json({ erro: 'Registro duplicado' })
  if (erro?.code === '23503') return res.status(409).json({ erro: 'Registro está em uso por outro cadastro' })
  res.status(500).json({ erro: 'Erro interno do servidor' })
})

const porta = Number(process.env.PORT) || 3333

migrar()
  .then(() => semear({ silencioso: process.env.NODE_ENV === 'production' }))
  .then(() => {
    app.listen(porta, () => {
      console.log(`\n  Ensalamento rodando em http://localhost:${porta}\n`)
    })
  })
  .catch((erro) => {
    console.error('Falha ao preparar o banco de dados:', erro)
    process.exit(1)
  })
