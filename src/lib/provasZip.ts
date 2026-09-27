import type { Response } from 'express'
import { q, q1 } from './db'
import { ZipSimples, nomeSeguroArquivo } from './zipSimples'
import { ROTULO_TURNO } from './texto'

/**
 * Pacote ZIP com as provas anexadas — o mesmo código serve para o pacote geral da
 * coordenação (todas, em pastas por professor) e para o pacote de um professor só
 * (na raiz, sem pasta). Ficando num lugar só, o nome do arquivo e a conta de cópias
 * não correm o risco de divergir entre as duas telas.
 *
 * O nome de cada arquivo é "Disciplina - Turno - N cópias.pdf", onde N é a quantidade
 * de alunos cadastrados mais duas de reserva — assim quem imprime lê a quantidade sem
 * precisar consultar nada.
 */

type Opcoes = {
  /** Quando vier, limita às provas das turmas desse professor. */
  professorId?: string
  /** Agrupar em pastas por professor (faz sentido só no pacote geral). */
  pastaPorProfessor: boolean
  /** Nome do .zip que o navegador vai salvar. */
  nomeArquivo: string
}

export async function enviarProvasEmZip(res: Response, opcoes: Opcoes) {
  const filtro = opcoes.professorId ? 'WHERE t.professor_id = $1' : ''
  const parametros = opcoes.professorId ? [opcoes.professorId] : []

  const provas = await q<any>(
    `SELECT p.turma_id, p.enviado_em,
            d.nome AS disciplina, t.turno,
            COALESCE(u.nome, 'sem professor') AS professor,
            (SELECT COUNT(*)::int FROM aluno a WHERE a.turma_id = t.id) AS total_alunos
       FROM prova_arquivo p
       JOIN turma t      ON t.id = p.turma_id
       JOIN disciplina d ON d.id = t.disciplina_id
       LEFT JOIN usuario u ON u.id = t.professor_id
       ${filtro}
      ORDER BY professor ASC, d.nome ASC`,
    parametros,
  )

  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${opcoes.nomeArquivo}"`)

  const zip = new ZipSimples(res)

  for (const p of provas) {
    // busca o binário só na hora de escrever — a memória nunca guarda todas juntas
    const arquivo = await q1<{ conteudo: Buffer }>(
      'SELECT conteudo FROM prova_arquivo WHERE turma_id = $1',
      [p.turma_id],
    )
    if (!arquivo) continue

    const turno = (ROTULO_TURNO as any)[p.turno] ?? p.turno
    // duas cópias a mais que o número de alunos: reserva para erro de impressão e imprevisto
    const copias = (p.total_alunos ?? 0) + 2
    const nome = nomeSeguroArquivo(`${p.disciplina} - ${turno} - ${copias} cópias.pdf`, 'prova.pdf')

    const caminho = opcoes.pastaPorProfessor
      ? `${nomeSeguroArquivo(p.professor, 'sem professor')}/${nome}`
      : nome

    zip.adiciona(caminho, arquivo.conteudo, new Date(p.enviado_em))
  }

  zip.finaliza()
}
