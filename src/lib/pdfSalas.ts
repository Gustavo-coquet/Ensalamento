import PDFDocument from 'pdfkit'
import type { Response } from 'express'
import { ROTULO_DIA, ROTULO_TURNO } from './texto'

/**
 * Lista de salas em PDF, uma sala por página — sempre. Mesmo sala com poucos alunos
 * ocupa a folha inteira, porque na prática cada folha é entregue a um fiscal diferente.
 * Sala que não cabe numa página só continua na seguinte marcada como "(continuação)",
 * mas a sala SEGUINTE nunca começa numa página já usada.
 *
 * Usa a Helvetica embutida do PDF (codificação WinAnsi), que cobre os acentos do
 * português — não precisa carregar fonte externa no servidor.
 */

type AlunoSala = {
  matricula: string
  nome: string
  disciplina: string
  professor?: string
}

type SalaMontada = {
  numero: number
  rotulo: string
  alunos: AlunoSala[]
  porDisciplina: AlunoSala[]
  resumo: { disciplina: string; quantidade: number }[]
}

type EnsalamentoMontado = {
  diaSemana: string
  turno: string
  totalAlunos: number
  totalSalas: number
  criadoEm: Date | string
  salas: SalaMontada[]
}

const MARGEM = 40
const LARGURA = 595.28 // A4 retrato
const ALTURA = 841.89
const FIM_UTIL = ALTURA - MARGEM - 26 // espaço reservado para o rodapé

// x de cada coluna e largura útil do texto
const COLUNAS = {
  indice: { x: MARGEM, largura: 28 },
  matricula: { x: MARGEM + 28, largura: 86 },
  nome: { x: MARGEM + 114, largura: 236 },
  disciplina: { x: MARGEM + 350, largura: LARGURA - MARGEM - (MARGEM + 350) },
}

function dataHora(valor: Date | string) {
  return new Date(valor).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export function enviarPdfSalas(
  res: Response,
  ensalamento: EnsalamentoMontado,
  ordem: 'alfabetica' | 'disciplina' = 'alfabetica',
) {
  const doc = new PDFDocument({ size: 'A4', margin: MARGEM, autoFirstPage: false })

  const rotuloDia = (ROTULO_DIA as any)[ensalamento.diaSemana] ?? ensalamento.diaSemana
  const rotuloTurno = (ROTULO_TURNO as any)[ensalamento.turno] ?? ensalamento.turno
  const arquivo = `salas-${String(ensalamento.diaSemana).toLowerCase()}-${String(ensalamento.turno).toLowerCase()}.pdf`

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${arquivo}"`)
  doc.pipe(res)

  const total = ensalamento.salas.length

  ensalamento.salas.forEach((sala, i) => {
    const alunos = ordem === 'disciplina' ? sala.porDisciplina : sala.alunos

    // uma sala nova SEMPRE abre página nova
    doc.addPage()
    let y = desenhaCabecalho(doc, { rotuloDia, rotuloTurno, sala, posicao: i + 1, total, ordem })

    alunos.forEach((aluno, linha) => {
      if (y + 15 > FIM_UTIL) {
        rodape(doc, ensalamento, sala, true)
        doc.addPage()
        y = desenhaCabecalho(doc, {
          rotuloDia,
          rotuloTurno,
          sala,
          posicao: i + 1,
          total,
          ordem,
          continuacao: true,
        })
      }
      y = desenhaLinha(doc, y, linha + 1, aluno)
    })

    if (!alunos.length) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor('#666666')
      doc.text('Nenhum aluno alocado nesta sala.', MARGEM, y + 8)
      doc.fillColor('#000000')
    }

    desenhaResumo(doc, sala, Math.max(y, FIM_UTIL - 90))
    rodape(doc, ensalamento, sala, false)
  })

  // ensalamento sem nenhuma sala ainda assim gera um PDF válido, com um aviso
  if (!total) {
    doc.addPage()
    doc.font('Helvetica-Bold').fontSize(14)
    doc.text(`Sem salas geradas para ${rotuloDia} — ${String(rotuloTurno).toLowerCase()}.`, MARGEM, 120)
  }

  doc.end()
}

function desenhaCabecalho(
  doc: PDFKit.PDFDocument,
  d: {
    rotuloDia: string
    rotuloTurno: string
    sala: SalaMontada
    posicao: number
    total: number
    ordem: string
    continuacao?: boolean
  },
) {
  doc.font('Helvetica').fontSize(7.5).fillColor('#555555')
  doc.text('ENSALAMENTO DE PROVAS', MARGEM, MARGEM, { width: 320 })
  doc.text(`${d.rotuloDia} · ${String(d.rotuloTurno).toLowerCase()}`, MARGEM, MARGEM + 10, { width: 320 })

  doc.text(`Sala ${d.posicao} de ${d.total}`, LARGURA - MARGEM - 160, MARGEM, {
    width: 160,
    align: 'right',
  })

  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(15)
  doc.text(d.sala.rotulo + (d.continuacao ? ' (continuação)' : ''), MARGEM, MARGEM + 26, {
    width: LARGURA - 2 * MARGEM,
  })

  doc.font('Helvetica').fontSize(8.5).fillColor('#444444')
  doc.text(
    `${d.sala.alunos.length} aluno${d.sala.alunos.length === 1 ? '' : 's'}` +
      ` · ordem ${d.ordem === 'disciplina' ? 'por disciplina' : 'alfabética'}`,
    MARGEM,
    MARGEM + 46,
  )

  const yLinha = MARGEM + 62
  doc.moveTo(MARGEM, yLinha).lineTo(LARGURA - MARGEM, yLinha).lineWidth(1).strokeColor('#000000').stroke()

  // cabeçalho da tabela
  const yTitulos = yLinha + 8
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#555555')
  doc.text('#', COLUNAS.indice.x, yTitulos, { width: COLUNAS.indice.largura })
  doc.text('MATRÍCULA', COLUNAS.matricula.x, yTitulos, { width: COLUNAS.matricula.largura })
  doc.text('NOME', COLUNAS.nome.x, yTitulos, { width: COLUNAS.nome.largura })
  doc.text('DISCIPLINA', COLUNAS.disciplina.x, yTitulos, { width: COLUNAS.disciplina.largura })
  doc.fillColor('#000000')

  return yTitulos + 13
}

function desenhaLinha(doc: PDFKit.PDFDocument, y: number, indice: number, aluno: AlunoSala) {
  // faixa alternada, para não errar de linha ao conferir na hora da prova
  if (indice % 2 === 0) {
    doc.rect(MARGEM - 2, y - 2.5, LARGURA - 2 * MARGEM + 4, 13.5).fillColor('#f2f2f2').fill()
    doc.fillColor('#000000')
  }

  doc.font('Helvetica').fontSize(7.5).fillColor('#777777')
  doc.text(String(indice), COLUNAS.indice.x, y, { width: COLUNAS.indice.largura })

  doc.fillColor('#000000').fontSize(8)
  doc.text(aluno.matricula ?? '', COLUNAS.matricula.x, y, {
    width: COLUNAS.matricula.largura,
    lineBreak: false,
  })

  doc.font('Helvetica-Bold').fontSize(8.5)
  doc.text(aluno.nome ?? '', COLUNAS.nome.x, y - 0.5, { width: COLUNAS.nome.largura, lineBreak: false, ellipsis: true })

  doc.font('Helvetica').fontSize(7).fillColor('#444444')
  doc.text(aluno.disciplina ?? '', COLUNAS.disciplina.x, y + 0.5, {
    width: COLUNAS.disciplina.largura,
    lineBreak: false,
    ellipsis: true,
  })
  doc.fillColor('#000000')

  return y + 13.5
}

function desenhaResumo(doc: PDFKit.PDFDocument, sala: SalaMontada, y: number) {
  if (!sala.resumo.length) return
  const yBase = Math.min(y + 14, FIM_UTIL - 46)

  doc.moveTo(MARGEM, yBase).lineTo(LARGURA - MARGEM, yBase).lineWidth(0.5).strokeColor('#999999').stroke()
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#555555')
  doc.text('DISCIPLINAS NESTA SALA', MARGEM, yBase + 6)

  doc.font('Helvetica').fontSize(8).fillColor('#000000')
  doc.text(
    sala.resumo.map((r) => `${r.disciplina} (${r.quantidade})`).join('   ·   '),
    MARGEM,
    yBase + 18,
    { width: LARGURA - 2 * MARGEM },
  )
}

function rodape(
  doc: PDFKit.PDFDocument,
  ensalamento: EnsalamentoMontado,
  sala: SalaMontada,
  continua: boolean,
) {
  doc.font('Helvetica').fontSize(7.5).fillColor('#888888')
  doc.text(
    `${sala.rotulo}${continua ? ' — continua na próxima página' : ''}` +
      `   ·   gerado em ${dataHora(ensalamento.criadoEm)}   ·   Ensalamento`,
    MARGEM,
    ALTURA - MARGEM - 10,
    { width: LARGURA - 2 * MARGEM, align: 'center' },
  )
  doc.fillColor('#000000')
}
