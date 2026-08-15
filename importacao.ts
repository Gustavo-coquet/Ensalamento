import { chaveNome, normalizaNome } from './texto'

/**
 * Lê a lista de professores colada pelo administrador no cadastro em lote.
 *
 * Uma linha por professor, colunas separadas por TAB, ";" ou "|":
 *   NOME ; E-MAIL ; SENHA
 *
 * A senha é opcional — sem ela, entra a senha padrão da tela. As disciplinas,
 * o dia e o turno não entram aqui: quem preenche é o próprio professor ao entrar,
 * ou o administrador pela grade logo abaixo.
 */

export type LinhaLida = {
  linha: number
  professor: string
  email: string
  senha: string
  erro?: string
}

const PARECE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CABECALHOS = ['NOME', 'PROFESSOR', 'NOME DO PROFESSOR']

function separaColunas(linha: string): string[] {
  const sep = linha.includes('\t') ? '\t' : linha.includes(';') ? ';' : linha.includes('|') ? '|' : null
  if (!sep) return [linha.trim()]
  return linha.split(sep).map((c) => c.trim())
}

export function lerLinhas(texto: string, senhaPadrao: string): LinhaLida[] {
  const saida: LinhaLida[] = []

  texto.split(/\r?\n/).forEach((bruto, indice) => {
    const linha = indice + 1
    if (!bruto.trim()) return

    const col = separaColunas(bruto)

    // ignora a linha de cabeçalho, se a pessoa colar junto
    if (CABECALHOS.includes(chaveNome(col[0] ?? '')) && !PARECE_EMAIL.test(col[0] ?? '')) return

    const registro: LinhaLida = {
      linha,
      professor: normalizaNome(col[0] ?? ''),
      email: (col[1] ?? '').trim().toLowerCase(),
      senha: (col[2] ?? '').trim() || senhaPadrao,
    }

    if (!registro.professor) registro.erro = 'Falta o nome do professor'
    else if (!registro.email) registro.erro = 'Falta o e-mail — a 2ª coluna deve ser o e-mail'
    else if (!PARECE_EMAIL.test(registro.email)) registro.erro = `E-mail inválido: "${registro.email}"`
    else if (registro.senha.length < 6) {
      registro.erro = `Senha "${registro.senha}" é curta — precisa de 6 caracteres`
    }

    saida.push(registro)
  })

  return saida
}
