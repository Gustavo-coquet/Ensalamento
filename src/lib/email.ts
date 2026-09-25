import { ROTULO_CURSO, ROTULO_DIA, ROTULO_TURNO } from './texto'

/**
 * Aviso por e-mail quando um professor anexa a prova, com o PDF junto.
 *
 * Vai por HTTP (API do Resend), não por SMTP, porque o Render bloqueia as portas de SMTP
 * (25, 465 e 587) nos serviços do plano grátis — nodemailer com Gmail simplesmente
 * estouraria timeout lá. O limite do Resend é 40 MB por e-mail já contando o base64, e a
 * prova no sistema é limitada a 10 MB (~13,4 MB depois de codificada), então cabe.
 *
 * Tudo é opcional: sem as variáveis de ambiente configuradas a função não faz nada e diz
 * que está desligada. Anexar a prova nunca pode falhar por causa do e-mail.
 */

export type ResultadoEmail = {
  enviado: boolean
  /** 'enviado' | 'desligado' | 'erro' — vai para o banco, junto da prova */
  status: string
  erro?: string
}

type DadosProva = {
  professorNome: string
  professorEmail: string
  disciplinaNumero: number
  disciplina: string
  curso: string
  diaSemana: string | null
  turno: string
  nomeArquivo: string
  conteudo: Buffer
  substituicao: boolean
}

const API = 'https://api.resend.com/emails'

function configuracao() {
  const chave = String(process.env.RESEND_API_KEY ?? '').trim()
  const destino = String(process.env.EMAIL_PROVAS_DESTINO ?? '').trim()
  // Sem domínio verificado no Resend, o remetente precisa ser o onboarding@resend.dev —
  // e, nesse caso, o destino só pode ser o e-mail dono da conta do Resend.
  const remetente = String(process.env.EMAIL_PROVAS_REMETENTE ?? '').trim() || 'Ensalamento <onboarding@resend.dev>'
  return { chave, destino, remetente }
}

/**
 * O endereço de envio é sempre o mesmo (o do serviço), porque mandar "de" um endereço
 * @soulasalle.com.br exigiria ser dono daquele domínio — o provedor recusaria e o destino
 * barraria por SPF/DKIM. O que dá para personalizar é o NOME exibido, então quem recebe
 * lê "Gustavo Braga (via Ensalamento)" na lista da caixa de entrada, e o Responder cai no
 * e-mail do professor (reply_to). O nome é limpo de aspas, vírgulas e <> para não quebrar
 * o cabeçalho do e-mail.
 */
function remetenteComNome(remetente: string, professorNome: string) {
  const endereco = remetente.match(/<([^>]+)>/)?.[1] ?? remetente
  const nome = professorNome.replace(/["<>,;\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
  return nome ? `"${nome} (via Ensalamento)" <${endereco}>` : remetente
}

/**
 * Lê a lista de destinatários aceitando as duas formas: endereço puro
 * ("eng.uni@lasalle.org.br") e com nome ("Engenharia Unilasalle <eng.uni@lasalle.org.br>"),
 * um ou vários separados por vírgula. Um split(',') simples quebraria um nome que tivesse
 * vírgula dentro, então o reconhecimento é por padrão, não por separador.
 */
function listaDestinos(valor: string): string[] {
  const achados = valor.match(/(?:"[^"]*"|[^,<>]*)<[^>]+>|[^\s,;]+@[^\s,;]+/g) ?? []
  return achados.map((e) => e.trim()).filter(Boolean)
}

/** Nome de arquivo que já identifica a origem na caixa de entrada de quem recebe. */
function nomeParaAnexo(d: DadosProva) {
  const limpo = (texto: string) =>
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, ' ')

  return `${d.disciplinaNumero} - ${limpo(d.disciplina)} - ${limpo(d.professorNome)}.pdf`.slice(0, 160)
}

function corpo(d: DadosProva, quando: string) {
  const linhas = [
    `Professor: ${d.professorNome} (${d.professorEmail})`,
    `Disciplina: ${d.disciplinaNumero} — ${d.disciplina}`,
    `Curso: ${(ROTULO_CURSO as any)[d.curso] ?? d.curso}`,
    `Prova: ${d.diaSemana ? (ROTULO_DIA as any)[d.diaSemana] ?? d.diaSemana : 'dia não definido'} · ${
      (ROTULO_TURNO as any)[d.turno] ?? d.turno
    }`,
    `Arquivo: ${d.nomeArquivo} (${(d.conteudo.length / 1048576).toFixed(1)} MB)`,
    `Enviado em: ${quando}`,
  ]

  // A instrução de resposta vem escrita com o endereço à vista: quem recebe não precisa
  // confiar no botão Responder nem procurar de quem era a prova.
  const comoResponder = `Responder para o e-mail do professor: ${d.professorEmail}`

  const texto =
    (d.substituicao
      ? 'Um professor SUBSTITUIU a prova anexada no Ensalamento.\n\n'
      : 'Um professor anexou a prova no Ensalamento.\n\n') +
    linhas.join('\n') +
    `\n\n${comoResponder}\n(o botão Responder deste e-mail já vai direto para ele)`

  const html = `<div style="font-family:ui-sans-serif,system-ui,Arial,sans-serif;font-size:14px;line-height:1.6;color:#1c2b3a">
    <p style="margin:0 0 14px">${
      d.substituicao
        ? 'Um professor <strong>substituiu</strong> a prova anexada no Ensalamento.'
        : 'Um professor anexou a prova no Ensalamento.'
    }</p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
      ${linhas
        .map((l) => {
          const [rotulo, ...resto] = l.split(': ')
          return `<tr>
            <td style="padding:3px 14px 3px 0;color:#6b7a89;white-space:nowrap">${rotulo}</td>
            <td style="padding:3px 0"><strong>${resto.join(': ')}</strong></td>
          </tr>`
        })
        .join('')}
    </table>
    <p style="margin:16px 0 0;padding:10px 12px;background:#f2f8f8;border-left:3px solid #2c9e94;font-size:13.5px">
      <strong>Responder para o e-mail do professor:</strong><br />
      <a href="mailto:${d.professorEmail}" style="color:#2c9e94">${d.professorEmail}</a>
      <span style="color:#6b7a89"> — o botão Responder deste e-mail já vai direto para ele.</span>
    </p>
    <p style="margin:12px 0 0;color:#6b7a89;font-size:12.5px">A prova vai anexada a este e-mail.</p>
  </div>`

  return { texto, html }
}

export async function enviarProvaPorEmail(d: DadosProva): Promise<ResultadoEmail> {
  const { chave, destino, remetente } = configuracao()
  if (!chave || !destino) {
    return { enviado: false, status: 'desligado' }
  }

  const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const { texto, html } = corpo(d, quando)

  const assunto =
    `${d.substituicao ? '[Reenvio] ' : ''}Prova — ${d.disciplinaNumero} ${d.disciplina} · ` +
    `${(ROTULO_TURNO as any)[d.turno] ?? d.turno} — ${d.professorNome}`

  try {
    const resposta = await fetch(API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${chave}`,
        'Content-Type': 'application/json',
      },
      // 45s: um PDF de 10 MB em base64 leva alguns segundos para subir
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        from: remetenteComNome(remetente, d.professorNome),
        to: listaDestinos(destino),
        reply_to: d.professorEmail,
        subject: assunto,
        text: texto,
        html,
        attachments: [{ filename: nomeParaAnexo(d), content: d.conteudo.toString('base64') }],
      }),
    })

    if (!resposta.ok) {
      const detalhe = await resposta.text().catch(() => '')
      return {
        enviado: false,
        status: 'erro',
        erro: `HTTP ${resposta.status} ${detalhe.slice(0, 300)}`.trim(),
      }
    }

    return { enviado: true, status: 'enviado' }
  } catch (erro: any) {
    return { enviado: false, status: 'erro', erro: String(erro?.message ?? erro).slice(0, 300) }
  }
}
