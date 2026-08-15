import bcrypt from 'bcryptjs'
import { q, q1 } from './db'

const DISCIPLINAS = [
  'Algebra Linear e Geometria Analítica',
  'Análise e Simulação de Sistemas (PO2)',
  'Arranjo Físico e Industrial',
  'Automação da Produção',
  'CAD',
  'Cálculo Básico',
  'Cálculo Diferencial e Integral I',
  'Cálculo Diferencial e Integral II',
  'Cálculo Numérico',
  'Ciência dos Materiais',
  'Controle Estatístico de Processos',
  'Custos e Preços',
  'Desenho Técnico',
  'Energias Renováveis',
  'Engenharia de Métodos',
  'Engenharia do Produto',
  'Equações Diferenciais',
  'Ergonomia e Segurança do Trabalho',
  'Estradas',
  'Estruturas de Aço e Madeira',
  'Estruturas de Concreto I',
  'Estruturas de Concreto II',
  'Estruturas Hiperestáticas',
  'Fenômenos de Transporte',
  'Física Geral e Experimental I',
  'Física Geral e Experimental II',
  'Física Geral e Experimental III',
  'Fundações',
  'Fundamentos de Arquitetura',
  'Geologia',
  'Gestão Ambiental e Sustentabilidade',
  'Gestão de Empresas e Empreendedorismo',
  'Gestão Estratégica da Produção',
  'Gestão de Processos Produtivos',
  'Hidráulica',
  'Instalações Elétricas',
  'Instalações Hidrosanitárias',
  'Lógica de Programação',
  'Materiais de Construção',
  'Materiais e Processos de Fabricação',
  'Mecânica Aplicada',
  'Mecânica dos Solos I',
  'Mecânica dos Solos II',
  'Mercado Financeiro',
  'Pessoas e Conhecimento',
  'Planejamento e Controle da Produção',
  'Pontes',
  'Probabilidade e Estatística',
  'Projeto de Sistemas Produtivos (PO3)',
  'Pesquisa Operacional I (PO1)',
  'Química Geral e Experimental',
  'Resistência de Materiais I',
  'Resistência de Materiais II',
  'Saneamento e Abastecimento',
  'Sistemas e Ferramentas da Qualidade',
  'Sistemas Produtivos',
  'Tecnologia Eletrotécnica',
  'Tecnologia e Processos Construtivos',
  'Topografia',
  'Transporte e Logística',
]

/**
 * Popula o banco de forma idempotente: garante as 60 disciplinas e a conta de
 * administração. Roda no boot (o plano free do Render não tem shell) e também
 * pelo `npm run seed`.
 *
 * A senha do admin só é sobrescrita quando FORCAR_SENHA_ADMIN=1 — assim um
 * redeploy não desfaz a senha que você trocou pela tela.
 */
export async function semear({ silencioso = false } = {}) {
  const log = (m: string) => { if (!silencioso) console.log(m) }

  const jaTem = Number((await q1<{ n: string }>('SELECT COUNT(*) AS n FROM disciplina'))!.n)
  if (jaTem < DISCIPLINAS.length) {
    for (let i = 0; i < DISCIPLINAS.length; i++) {
      await q(
        `INSERT INTO disciplina (numero, nome) VALUES ($1, $2)
         ON CONFLICT (numero) DO UPDATE SET nome = EXCLUDED.nome`,
        [i + 1, DISCIPLINAS[i]],
      )
    }
    log(`\u2713 ${DISCIPLINAS.length} disciplinas`)
  }

  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
  const senha = process.env.ADMIN_SENHA || ''
  const nome = (process.env.ADMIN_NOME || '').trim() || 'Administração'

  if (!email || senha.length < 6) {
    log('  (ADMIN_EMAIL/ADMIN_SENHA não definidos — conta de administrador não criada)')
    return
  }

  const existente = await q1<{ id: string }>('SELECT id FROM usuario WHERE email = $1', [email])
  const forcar = process.env.FORCAR_SENHA_ADMIN === '1'

  if (existente && !forcar) {
    // mantém o nome em dia: basta ajustar ADMIN_NOME e redeployar
    if (process.env.ADMIN_NOME?.trim()) {
      await q("UPDATE usuario SET nome = $1, papel = 'ADMIN', ativo = TRUE WHERE id = $2", [nome, existente.id])
    } else {
      await q("UPDATE usuario SET papel = 'ADMIN', ativo = TRUE WHERE id = $1", [existente.id])
    }
    return
  }

  const hash = await bcrypt.hash(senha, 10)
  await q(
    `INSERT INTO usuario (nome, email, senha_hash, papel)
     VALUES ($1, $2, $3, 'ADMIN')
     ON CONFLICT (email) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, papel = 'ADMIN', ativo = TRUE`,
    [nome, email, hash],
  )
  log(`\u2713 administrador: ${email}`)
}
