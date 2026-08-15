# Colocar no ar — passo a passo

Ordem: **banco (Neon) → código (GitHub) → site (Render)**.
São três contas gratuitas e leva uns 20 minutos.

Por que o banco não fica no Render: o Postgres gratuito deles **expira 30 dias depois
de criado** e depois disso você perde os dados. O do Neon não expira.

Você **não precisa rodar nenhum comando no servidor**. O sistema cria as tabelas, as 60
disciplinas e a sua conta de coordenação sozinho no primeiro boot. (Isso importa porque
o plano free do Render não dá acesso a shell.)

---

## Parte 1 — Banco de dados no Neon

1. Entre em <https://neon.tech> e crie a conta (dá para entrar com o GitHub).
2. **Create project**. Nome: `ensalamento`. Região: escolha a mais próxima —
   `AWS São Paulo (sa-east-1)` se existir, senão `US East`.
3. Terminada a criação, aparece a caixa **Connection string**. Copie o valor inteiro.
   Ele se parece com:

   ```
   postgresql://ensalamento_owner:npg_XXXX@ep-nome-12345.sa-east-1.aws.neon.tech/ensalamento?sslmode=require
   ```

4. Guarde essa string no bloco de notas — ela é a `DATABASE_URL` da Parte 3.
   Se perder, é só voltar no painel do Neon em **Connection Details**.

> Free do Neon: 0,5 GB por projeto e sem prazo de validade. Para uma lista de alunos
> isso é muito mais do que o suficiente.

---

## Parte 2 — Código no GitHub

Descompacte o `ensalamento.zip` numa pasta do seu computador.

### Se você usa o GitHub Desktop (mais simples)

1. Instale o <https://desktop.github.com> e faça login.
2. **File → Add local repository** → aponte para a pasta `ensalamento`.
3. Ele vai avisar que não é um repositório ainda → clique em **create a repository**.
4. Marque **Keep this code private** e clique em **Create repository**.
5. Clique em **Publish repository** (canto superior direito).

### Se você prefere o terminal

```bash
cd caminho/para/ensalamento
git init
git add .
git commit -m "Sistema de ensalamento"
gh repo create ensalamento --private --source=. --push
```

Sem o `gh` instalado: crie o repositório vazio pelo site do GitHub e siga as instruções
que ele mostra na tela ("push an existing repository").

> O `.gitignore` já impede que `node_modules`, `dist` e o arquivo `.env` (com senhas)
> vão parar no GitHub.

---

## Parte 3 — Site no Render

1. Entre em <https://dashboard.render.com> e clique em **New +** → **Web Service**.
2. Conecte a sua conta do GitHub e escolha o repositório `ensalamento`.
3. Preencha:

   | Campo | Valor |
   | --- | --- |
   | Name | `ensalamento` |
   | Region | a mesma região que você escolheu no Neon, se possível |
   | Branch | `main` |
   | Runtime | `Node` |
   | Build Command | `npm ci && npm run build` |
   | Start Command | `npm start` |
   | Instance Type | `Free` |

4. Abra **Advanced** → **Add Environment Variable** e cadastre estas cinco:

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | a connection string do Neon (Parte 1) |
   | `JWT_SECRET` | qualquer texto longo e aleatório, ex.: `k9mQz2xR7pL4vN8wT1jH5bF3cY6dS0aG` |
   | `ADMIN_EMAIL` | `prof.gustavo.braga@soulasalle.com.br` |
   | `ADMIN_SENHA` | uma senha inicial sua (mínimo 6 caracteres) |
   | `NODE_ENV` | `production` |

   Opcional: `ADMIN_NOME` com o nome que aparece no topo da tela.

5. **Create Web Service**. O primeiro deploy leva de 2 a 4 minutos.
6. Quando o log mostrar `Ensalamento rodando em...` e o status virar **Live**, abra a
   URL que o Render gerou (algo como `https://ensalamento.onrender.com`).
7. Entre com o `ADMIN_EMAIL` e a `ADMIN_SENHA` que você acabou de cadastrar.
8. **Troque a senha** em *Trocar senha* no menu lateral.

> Se preferir, dá para pular os passos 3 e 4: o repositório já traz um `render.yaml`.
> Nesse caso use **New +** → **Blueprint**, aponte para o repositório e o Render só vai
> pedir os valores das variáveis marcadas como `sync: false`.

---

## Parte 4 — Primeiro uso

1. **Professores** → cadastre cada professor com nome, e-mail e uma senha inicial.
2. **Turmas** → crie uma turma para cada disciplina, ligando ao professor e ao curso.
3. Mande para cada professor: o link do sistema, o e-mail dele e a senha inicial.
   Ele entra, escolhe o dia da prova, cola a lista de alunos e preenche o gabarito.
4. **Painel** → acompanhe as pendências (turma sem dia, sem gabarito, sem alunos).
5. **Gerar salas** → escolha o dia, a lotação (15) e clique em *Criar salas*.
   Depois é só *Imprimir* ou baixar o CSV.

---

## Perguntas que costumam aparecer

**A primeira pessoa a abrir de manhã reclama que demorou.**
É a hibernação do plano free: sem acesso por 15 minutos, o serviço dorme e leva cerca
de 1 minuto para acordar. Só acontece na primeira requisição. O plano pago do Render
(a partir de US$ 7/mês) elimina isso.

**Mudei o código, como atualizo o site?**
É só dar `git push` (ou *Push origin* no GitHub Desktop). O Render redeploya sozinho.

**Perdi a senha da coordenação.**
No Render, adicione a variável `FORCAR_SENHA_ADMIN` com valor `1`, ajuste a
`ADMIN_SENHA` para a nova senha e faça um **Manual Deploy**. Depois de entrar, apague
a variável `FORCAR_SENHA_ADMIN` — senão todo redeploy volta a forçar aquela senha.

**Os dados estão seguros?**
Ficam no Neon, não no Render — então derrubar ou recriar o site não apaga nada.
O Neon guarda histórico dos últimos dias e permite restaurar o banco a um ponto no tempo.

**Preciso rodar isso na minha máquina antes?**
Não. Se quiser testar local mesmo assim, o `README.md` tem as instruções com Docker.
