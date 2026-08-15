import { Pool } from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('\n  Falta a variável DATABASE_URL. Copie o .env.example para .env e preencha.\n')
  process.exit(1)
}

/** Neon/Render exigem SSL; Postgres local, não. */
const precisaSSL = /neon\.tech|render\.com|supabase\.co|sslmode=require/.test(url)

export const pool = new Pool({
  connectionString: url,
  ssl: precisaSSL ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.PG_POOL_MAX) || 5,
})

export async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(sql, params as any[])
  return r.rows as T[]
}

/** Primeira linha ou null. */
export async function q1<T = any>(sql: string, params: unknown[] = []): Promise<T | null> {
  const linhas = await q<T>(sql, params)
  return linhas[0] ?? null
}

/** Executa uma função dentro de uma transação. */
export async function transacao<T>(fn: (exec: typeof q) => Promise<T>): Promise<T> {
  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')
    const exec = async <R = any>(sql: string, params: unknown[] = []) =>
      (await cliente.query(sql, params as any[])).rows as R[]
    const resultado = await fn(exec as typeof q)
    await cliente.query('COMMIT')
    return resultado
  } catch (erro) {
    await cliente.query('ROLLBACK')
    throw erro
  } finally {
    cliente.release()
  }
}
