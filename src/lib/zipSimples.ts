import type { Writable } from 'node:stream'

/**
 * Gerador de ZIP mínimo, no método "store" (sem compressão), escrevendo direto no
 * destino — um arquivo por vez, sem montar o pacote inteiro na memória.
 *
 * Sem compressão de propósito: o conteúdo aqui são PDFs, que já nascem comprimidos.
 * Tentar comprimir de novo gasta CPU do servidor e não tira quase nada do tamanho.
 * Por não comprimir, o tamanho e o CRC de cada arquivo são conhecidos antes de escrever,
 * o que dispensa o "data descriptor" e deixa o formato bem simples.
 *
 * Limite: até 4 GB por pacote (sem ZIP64). São 49 provas de no máximo 10 MB, ou seja,
 * meio giga no pior caso imaginável — folgado.
 */

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabela[i] = c >>> 0
  }
  return tabela
})()

function crc32(dados: Buffer) {
  let c = 0xffffffff
  for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Data/hora no formato MS-DOS que o ZIP usa (precisão de 2 segundos). */
function dataDos(d: Date) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f)
  const data = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { hora, data }
}

type Entrada = { nome: Buffer; crc: number; tamanho: number; deslocamento: number; hora: number; data: number }

export class ZipSimples {
  private saida: Writable
  private posicao = 0
  private entradas: Entrada[] = []
  private nomesUsados = new Set<string>()

  constructor(saida: Writable) {
    this.saida = saida
  }

  /** Evita que dois arquivos com o mesmo nome se sobrescrevam ao descompactar. */
  private nomeUnico(nome: string) {
    if (!this.nomesUsados.has(nome)) {
      this.nomesUsados.add(nome)
      return nome
    }
    const ponto = nome.lastIndexOf('.')
    const base = ponto > 0 ? nome.slice(0, ponto) : nome
    const ext = ponto > 0 ? nome.slice(ponto) : ''
    let i = 2
    while (this.nomesUsados.has(`${base} (${i})${ext}`)) i++
    const novo = `${base} (${i})${ext}`
    this.nomesUsados.add(novo)
    return novo
  }

  adiciona(caminho: string, conteudo: Buffer, quando = new Date()) {
    const nome = Buffer.from(this.nomeUnico(caminho), 'utf8')
    const crc = crc32(conteudo)
    const { hora, data } = dataDos(quando)

    const cabecalho = Buffer.alloc(30)
    cabecalho.writeUInt32LE(0x04034b50, 0) // assinatura do cabeçalho local
    cabecalho.writeUInt16LE(20, 4) // versão necessária
    cabecalho.writeUInt16LE(0x0800, 6) // bit 11: nome do arquivo em UTF-8 (acentos)
    cabecalho.writeUInt16LE(0, 8) // método 0 = store
    cabecalho.writeUInt16LE(hora, 10)
    cabecalho.writeUInt16LE(data, 12)
    cabecalho.writeUInt32LE(crc, 14)
    cabecalho.writeUInt32LE(conteudo.length, 18) // tamanho comprimido
    cabecalho.writeUInt32LE(conteudo.length, 22) // tamanho original
    cabecalho.writeUInt16LE(nome.length, 26)
    cabecalho.writeUInt16LE(0, 28) // sem campo extra

    this.entradas.push({ nome, crc, tamanho: conteudo.length, deslocamento: this.posicao, hora, data })

    this.saida.write(cabecalho)
    this.saida.write(nome)
    this.saida.write(conteudo)
    this.posicao += cabecalho.length + nome.length + conteudo.length
  }

  /** Escreve o índice central e fecha o pacote. */
  finaliza() {
    const inicioIndice = this.posicao

    for (const e of this.entradas) {
      const registro = Buffer.alloc(46)
      registro.writeUInt32LE(0x02014b50, 0) // assinatura do índice central
      registro.writeUInt16LE(20, 4) // versão que gerou
      registro.writeUInt16LE(20, 6) // versão necessária
      registro.writeUInt16LE(0x0800, 8) // UTF-8
      registro.writeUInt16LE(0, 10) // store
      registro.writeUInt16LE(e.hora, 12)
      registro.writeUInt16LE(e.data, 14)
      registro.writeUInt32LE(e.crc, 16)
      registro.writeUInt32LE(e.tamanho, 20)
      registro.writeUInt32LE(e.tamanho, 24)
      registro.writeUInt16LE(e.nome.length, 28)
      registro.writeUInt16LE(0, 30) // extra
      registro.writeUInt16LE(0, 32) // comentário
      registro.writeUInt16LE(0, 34) // disco
      registro.writeUInt16LE(0, 36) // atributos internos
      registro.writeUInt32LE(0, 38) // atributos externos
      registro.writeUInt32LE(e.deslocamento, 42)

      this.saida.write(registro)
      this.saida.write(e.nome)
      this.posicao += registro.length + e.nome.length
    }

    const fim = Buffer.alloc(22)
    fim.writeUInt32LE(0x06054b50, 0) // fim do índice central
    fim.writeUInt16LE(0, 4) // disco atual
    fim.writeUInt16LE(0, 6) // disco do índice
    fim.writeUInt16LE(this.entradas.length, 8)
    fim.writeUInt16LE(this.entradas.length, 10)
    fim.writeUInt32LE(this.posicao - inicioIndice, 12)
    fim.writeUInt32LE(inicioIndice, 16)
    fim.writeUInt16LE(0, 20) // sem comentário

    this.saida.write(fim)
    this.saida.end()
  }
}

/** Tira do nome o que atrapalha em pasta do Windows/macOS, mantendo acentos. */
export function nomeSeguroArquivo(texto: string, padrao = 'sem-nome') {
  const limpo = String(texto ?? '')
    .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return limpo || padrao
}
