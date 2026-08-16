import { pool } from './db'

/**
 * Cria o schema se ainda não existir. Roda a cada boot — é idempotente,
 * então não há passo separado de migration nem no Render nem na sua máquina.
 */
const SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS usuario (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  senha_hash  TEXT NOT NULL,
  papel       TEXT NOT NULL DEFAULT 'PROFESSOR' CHECK (papel IN ('ADMIN','PROFESSOR')),
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS disciplina (
  id     SERIAL PRIMARY KEY,
  numero INT  NOT NULL UNIQUE,
  nome   TEXT NOT NULL UNIQUE,
  ativa  BOOLEAN NOT NULL DEFAULT TRUE
);
-- "ativa" = ofertada neste semestre. Nem toda disciplina abre todo semestre.
ALTER TABLE disciplina ADD COLUMN IF NOT EXISTS ativa BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS turma (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disciplina_id INT  NOT NULL REFERENCES disciplina(id) ON DELETE CASCADE,
  professor_id  UUID REFERENCES usuario(id) ON DELETE SET NULL,
  curso         TEXT NOT NULL DEFAULT 'CICLO_BASICO'
                CHECK (curso IN ('CICLO_BASICO','ENG_PRODUCAO','ENG_CIVIL')),
  dia_semana    TEXT CHECK (dia_semana IN ('SEGUNDA','TERCA','QUARTA','QUINTA','SEXTA')),
  ensalar       BOOLEAN NOT NULL DEFAULT TRUE,
  turno         TEXT NOT NULL DEFAULT 'NOTURNO',
  gabarito      TEXT[] NOT NULL DEFAULT ARRAY['','','','','','','','','',''],
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS turma_dia_idx        ON turma (dia_semana);
CREATE INDEX IF NOT EXISTS turma_professor_idx  ON turma (professor_id);

CREATE TABLE IF NOT EXISTS aluno (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id   UUID NOT NULL REFERENCES turma(id) ON DELETE CASCADE,
  matricula  TEXT NOT NULL,
  nome       TEXT NOT NULL,
  nome_chave TEXT NOT NULL,
  UNIQUE (turma_id, matricula)
);
CREATE INDEX IF NOT EXISTS aluno_chave_idx ON aluno (nome_chave);

CREATE TABLE IF NOT EXISTS ensalamento (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dia_semana   TEXT NOT NULL,
  turno        TEXT NOT NULL DEFAULT 'NOTURNO',
  capacidade   INT  NOT NULL DEFAULT 15,
  total_alunos INT  NOT NULL DEFAULT 0,
  total_salas  INT  NOT NULL DEFAULT 0,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE ensalamento ADD COLUMN IF NOT EXISTS turno TEXT NOT NULL DEFAULT 'NOTURNO';
CREATE INDEX IF NOT EXISTS ensalamento_dia_idx ON ensalamento (dia_semana, turno);

CREATE TABLE IF NOT EXISTS sala (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ensalamento_id UUID NOT NULL REFERENCES ensalamento(id) ON DELETE CASCADE,
  numero         INT  NOT NULL,
  rotulo         TEXT NOT NULL,
  UNIQUE (ensalamento_id, numero)
);

CREATE TABLE IF NOT EXISTS sala_aluno (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sala_id  UUID NOT NULL REFERENCES sala(id)  ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES aluno(id) ON DELETE CASCADE,
  posicao  INT  NOT NULL,
  UNIQUE (sala_id, aluno_id)
);
CREATE INDEX IF NOT EXISTS sala_aluno_sala_idx ON sala_aluno (sala_id);

/* --- turno vira uma lista fechada (DIURNO/NOTURNO) em vez de texto livre --- */

UPDATE turma
   SET turno = CASE
                 WHEN upper(btrim(turno)) IN ('NOTURNO', 'NOITE', '') THEN 'NOTURNO'
                 WHEN turno IS NULL THEN 'NOTURNO'
                 ELSE 'DIURNO'
               END
 WHERE turno IS NULL OR turno NOT IN ('DIURNO', 'NOTURNO');

ALTER TABLE turma DROP CONSTRAINT IF EXISTS turma_turno_check;
ALTER TABLE turma ADD  CONSTRAINT turma_turno_check CHECK (turno IN ('DIURNO','NOTURNO'));

/* Salas geradas antes da separação por turno misturavam os dois — descarta. */
DELETE FROM ensalamento WHERE turno IS NULL OR turno NOT IN ('DIURNO','NOTURNO');

/* Faxina: ensalamento que ficou sem nenhum aluno (os alunos foram apagados depois)
   não representa mais nada — sairia no painel como "salas geradas" mentindo. */
DELETE FROM ensalamento e
 WHERE NOT EXISTS (
   SELECT 1 FROM sala s JOIN sala_aluno sa ON sa.sala_id = s.id WHERE s.ensalamento_id = e.id
 );
`

export async function migrar() {
  await pool.query(SQL)
}
