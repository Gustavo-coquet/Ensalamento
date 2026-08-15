import 'dotenv/config'
import { pool } from './lib/db'
import { migrar } from './lib/migracoes'
import { semear } from './lib/semear'

migrar()
  .then(() => semear())
  .then(() => console.log('Banco pronto.'))
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => pool.end())
