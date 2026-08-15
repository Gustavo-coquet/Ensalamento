# Ensalamento — Provas Integradas

Substitui a planilha de 67 abas do Google Sheets. Cada professor entra com o próprio
login, cadastra os alunos da disciplina dele e preenche o gabarito das 10 questões.
A coordenação clica em **Criar salas** e o sistema cruza tudo: junta todos os alunos
que fazem prova naquele dia, ordena por nome e distribui em salas equilibradas.

**Stack:** Node.js + TypeScript + Express + PostgreSQL. Frontend em HTML/CSS/JS puro,
servido pelo próprio backend — sem build step, sem framework, sem `node_modules` no
navegador.

---

## O que o sistema faz

**Professor**

- **escolhe sozinho as disciplinas que leciona**, marcando numa lista com busca —
  o que já é de outro professor aparece bloqueado, com o nome do dono;
- vê apenas a(s) disciplina(s) vinculada(s) ao usuário dele;
- define o dia da prova, o curso e o turno (diurno ou noturno);
- marca se a turma **entra na mistura de salas** — se desmarcar, os alunos continuam
  no resumo e no gabarito (para o leitor de cartão-resposta), mas fazem a prova na
  própria sala;
- cola a lista de alunos direto da planilha (matrícula + nome, separados por tabulação,
  ponto e vírgula ou espaço);
- preenche o gabarito das 10 questões clicando em A/B/C/D/E.

**Administrador**

- cadastra os professores **em lote**, colando uma lista `NOME ; E-MAIL ; SENHA`
  (a senha é opcional) — com botão de *Conferir* antes de gravar;
- se quiser, preenche as disciplinas **pelo** professor numa grade, cada uma com o seu
  dia e turno (até 10 por professor) — opcional, quem não for preenchido faz sozinho;
- redefine senha e remove professor pela mesma grade;
- acompanha no painel o que ainda falta: turma sem dia, sem professor, sem gabarito;
- gera as salas de um dia com um clique, escolhendo a lotação máxima;
- vê cada sala nas duas ordens — **alfabética** e **por disciplina** — com o resumo de
  quantos alunos de cada disciplina caíram ali;
- imprime as listas ou exporta em CSV;
- exporta o **resumo geral** no mesmo formato que a planilha gerava:
  `CURSO · DISCIPLINA · PROFESSOR · RA · CODIGO DE BARRAS · NOME · TURNO`.

### Como as salas são montadas

A unidade de ensalamento é **dia + turno**: o diurno de terça e o noturno de terça são
gerados separadamente e nunca se misturam. Dentro de cada combinação, todos os alunos
das turmas marcadas como "na mistura" entram numa única lista ordenada por nome
(ignorando acentos e maiúsculas). O sistema calcula o menor número de salas que respeita
a lotação e distribui em fatias sequenciais, deixando as salas com no máximo 1 aluno de
diferença entre si.

> 205 alunos com lotação 15 → 14 salas: 9 com 15 alunos e 5 com 14.

Como a lista está em ordem alfabética, os alunos de disciplinas diferentes se misturam
naturalmente dentro de cada sala — que é exatamente o efeito desejado na prova.

---

## Rodando na sua máquina

Precisa de **Node.js 18+**. Para o banco, use o Docker que já vem configurado ou um
PostgreSQL que você já tenha.

```bash
# 1. banco de dados
docker compose up -d

# 2. dependências
npm install

# 3. variáveis de ambiente
cp .env.example .env
#    edite ADMIN_EMAIL e ADMIN_SENHA — é a conta da coordenação

# 4. cria as tabelas e as 60 disciplinas
npm run seed

# 5. sobe o servidor
npm run dev
```

Abra <http://localhost:3333> e entre com o e-mail e a senha que você pôs no `.env`.

### Primeiros passos dentro do sistema

1. **Professores** → cadastre cada professor com uma senha inicial.
2. **Turmas** → crie a turma ligando disciplina + professor (+ dia, se já souber).
3. Passe o link e a senha para cada professor preencher a parte dele.
4. **Painel** → confira se sumiram as pendências.
5. **Gerar salas** → escolha o dia, a lotação e clique em *Criar salas*.

---

## Colocando no ar

Roteiro completo em `DEPLOY.md`. Resumo: banco no **Neon** (gratuito, não expira),
site no **Render** (plano free). O sistema cria as tabelas, as 60 disciplinas e a conta
de coordenação sozinho no primeiro boot, a partir das variáveis de ambiente — não é
preciso rodar nenhum comando no servidor (o plano free do Render não tem shell).

| Variável | Para quê |
| --- | --- |
| `DATABASE_URL` | connection string do Neon |
| `JWT_SECRET` | assina os cookies de sessão (qualquer string longa) |
| `ADMIN_EMAIL` | vira a conta de coordenação |
| `ADMIN_SENHA` | senha inicial dessa conta |
| `ADMIN_NOME` | nome exibido no topo |
| `NODE_ENV` | `production` |

Depois do primeiro acesso, troque a senha pela tela. Um redeploy **não** volta a senha
antiga — só se você definir `FORCAR_SENHA_ADMIN=1`, útil se algum dia perder o acesso.

### Sobre o plano gratuito do Render

O serviço hiberna depois de 15 minutos sem acesso — a primeira pessoa a abrir depois
disso espera cerca de 1 minuto. Para professores preenchendo dados ao longo da semana
isso é tranquilo; se incomodar, o plano pago mantém o serviço sempre ligado.

---

## Estrutura

```
ensalamento/
├── docker-compose.yml       # Postgres para desenvolvimento
├── render.yaml              # configuração de deploy
├── src/
│   ├── index.ts             # servidor Express
│   ├── seed.ts              # cria admin + as 60 disciplinas
│   ├── lib/
│   │   ├── db.ts            # pool de conexões e helpers de SQL
│   │   ├── migracoes.ts     # cria o schema (roda sozinho no boot)
│   │   ├── auth.ts          # login por cookie e controle de acesso
│   │   ├── ensalamento.ts   # o algoritmo de distribuição em salas
│   │   ├── texto.ts         # normalização de nomes e gabarito
│   │   └── csv.ts           # exportação
│   └── routes/
│       ├── auth.ts          # login, logout, troca de senha
│       ├── turmas.ts        # o que o professor preenche
│       └── admin.ts         # coordenação, geração de salas, exportações
└── public/                  # frontend (sem build)
    ├── index.html
    ├── estilo.css
    └── js/{comum,professor,admin,app}.js
```

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | servidor com recarga automática |
| `npm run seed` | cria/atualiza o admin e as 60 disciplinas |
| `npm run build` | compila o TypeScript para `dist/` |
| `npm start` | roda a versão compilada (usado no Render) |

## Próximos passos naturais

- Importar a planilha atual de uma vez, em vez de cada professor recolar a lista.
- Ler o arquivo do leitor de cartão-resposta e cruzar com o gabarito para gerar as notas
  e as estatísticas por questão.
- Etiquetas/PDF por sala para colar na porta no dia da prova.
- Registro de quem alterou o quê, para auditar mudanças de última hora.
