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

/* A oferta virou por turno: nem toda disciplina noturna abre de dia, e vice-versa.
   Quem já estava "ativa" nasce ofertado à noite (era o único turno que existia até aqui);
   ninguém nasce ofertado de dia — o admin liga manualmente quem precisar. */
ALTER TABLE disciplina ADD COLUMN IF NOT EXISTS ofertada_diurno  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE disciplina ADD COLUMN IF NOT EXISTS ofertada_noturno BOOLEAN NOT NULL DEFAULT TRUE;

/* "Entra na mistura" virou uma decisão por disciplina (todas as turmas dela seguem
   junto), marcada na mesma tela de Oferta do semestre — não é mais por turma. E é por
   turno: a turma diurna de uma disciplina pode entrar na mistura e a noturna não. */
ALTER TABLE disciplina ADD COLUMN IF NOT EXISTS ensalar_diurno  BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE disciplina ADD COLUMN IF NOT EXISTS ensalar_noturno BOOLEAN NOT NULL DEFAULT TRUE;

/* Migração de uma versão anterior que tinha um "ensalar_padrao" só (sem separar
   turno) — reaproveita o valor pros dois turnos e depois some com a coluna velha.
   Só executa na primeira vez: da segunda em diante a coluna já não existe mais. */
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'disciplina' AND column_name = 'ensalar_padrao'
  ) THEN
    UPDATE disciplina SET ensalar_diurno = ensalar_padrao, ensalar_noturno = ensalar_padrao;
    ALTER TABLE disciplina DROP COLUMN ensalar_padrao;
  END IF;
END $$;

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

/* Atividades Integradoras, TCC I/II, Estágio Supervisionado e Atividade Complementar
   entraram na lista de disciplinas por engano (não são matéria de verdade) e saíram do
   seed — apaga do banco quem sobrou, mas só se ninguém pegou uma turma delas (não
   derruba vínculo já feito). */
DELETE FROM disciplina d
 WHERE d.nome = ANY(ARRAY[
         'Atividade Integradora I', 'Atividade Integradora II', 'Atividade Integradora III',
         'Atividade Integradora IV', 'Atividade Integradora V', 'Atividade Integradora VI',
         'Atividade Integradora VII', 'Atividade Integradora VIII', 'Atividade Integradora IX',
         'Atividade Integradora X', 'Trabalho de Conclusão de Curso I',
         'Trabalho de Conclusão de Curso II', 'Estágio Supervisionado', 'Atividade Complementar'
       ])
   AND NOT EXISTS (SELECT 1 FROM turma t WHERE t.disciplina_id = d.id);
`

export async function migrar() {
  await pool.query(SQL)
}
