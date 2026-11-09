# Plano de Ação · Auditoria Interna (OROS · BU Educação)

Página de acompanhamento das 39 ações levantadas na auditoria interna. Cada responsável entra, marca o andamento (A fazer → Fazendo → Concluído), ajusta o prazo com motivo e tudo fica salvo no Supabase com histórico. Toda semana sai um e-mail para cada pessoa com o que ainda está pendente.

- **Painel** — números gerais e um cartão por área (filtra por pessoa).
- **Atividades** — lista por área, filtros por pessoa, área, status, "data alterada" e "atrasadas"; botão **Editar** em cada uma.
- **E-mails** — remetente, dia/horário do envio automático, destinatários, prévia e teste.

As atividades são fixas (vêm do documento). Pela página só se altera status, prazo, responsáveis e observação.

---

## Estrutura

```
public/            página (HTML, CSS e JS puros — sem build)
api/               funções da Vercel
  dados.js           GET  tudo o que as telas usam
  atividade.js       PATCH status / prazo / responsáveis / observação (grava histórico)
  pessoas.js         POST adicionar pessoa · PUT salvar e-mails
  config.js          PUT  configurações da aba E-mails
  lembretes.js       envio semanal (agendamento), prévia, teste e teste de conexão
lib/               código compartilhado (banco, regras de prazo, montagem dos e-mails)
supabase/
  01_estrutura.sql   tabelas
  02_atividades.sql  as 39 atividades, responsáveis e observações do documento
  03_agendamento.sql agendamento semanal (pg_cron)
dev.js             servidor local para testar (npm run dev)
```

---

## 1. Supabase

1. Crie o projeto (região São Paulo, se possível) e guarde a **senha do banco**.
2. **SQL Editor → New query**: cole e rode `supabase/01_estrutura.sql`; depois, numa nova query, `supabase/02_atividades.sql`.
   - Os dois podem ser rodados de novo sem apagar o andamento.
3. Pegue a string de conexão: botão **Connect** (topo) → **Transaction pooler** (porta **6543**). Fica assim:
   `postgresql://postgres.abcdefgh:SUA_SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`
   - Se a senha tiver `@`, `#`, `/` ou `%`, troque por `%40`, `%23`, `%2F`, `%25`.

> Segurança: as tabelas ficam com RLS ligado e sem políticas, então a chave pública (anon) do Supabase não lê nada. Só a API da Vercel acessa, pela string de conexão.

## 2. Vercel

1. Suba esta pasta para um repositório no GitHub e importe na Vercel (**Add New → Project**). Framework Preset: **Other**. Não precisa de Build Command.
2. Em **Settings → Environment Variables**, cadastre:

| Variável | O que é |
|---|---|
| `DATABASE_URL` | string do passo 1.3 |
| `ACESSO_SENHA` | senha que a equipe vai digitar para entrar |
| `CRON_SECRET` | texto longo aleatório (use o mesmo no 03_agendamento.sql) |
| `SMTP_HOST` | `smtp.gmail.com` (Google) ou `smtp.office365.com` (Microsoft) |
| `SMTP_PORT` | `465` (Google) ou `587` (Microsoft) |
| `SMTP_USER` | e-mail que envia |
| `SMTP_PASS` | senha de app dessa conta |
| `SITE_URL` | opcional — endereço do site, se usar domínio próprio |

3. **Deploy**. Abra o site, entre com a `ACESSO_SENHA` e escolha seu nome.

**Conta de e-mail**
- Google Workspace / Gmail: ative a verificação em duas etapas na conta e crie uma *senha de app* (Conta Google → Segurança → Senhas de app). Use essa senha em `SMTP_PASS`.
- Microsoft 365: o administrador precisa habilitar "SMTP autenticado" para a caixa.
- O "E-mail que envia" da aba E-mails deve ser o mesmo `SMTP_USER` (ou um alias dele), senão o provedor recusa.

Depois de mudar qualquer variável, faça **Redeploy** para ela valer.

## 3. Agendamento semanal

1. Abra `supabase/03_agendamento.sql`, troque `SEU-PROJETO.vercel.app` pelo endereço do site e `COLE_AQUI_O_CRON_SECRET` pelo valor do `CRON_SECRET`.
2. Rode no SQL Editor do Supabase. (Se der erro de extensão, ative **pg_cron** e **pg_net** em *Database → Extensions* e rode de novo.)

O Supabase chama a API de hora em hora; ela só envia no dia/horário escolhido na aba E-mails, uma vez por dia. Se o SMTP falhar em todos os envios, tenta de novo na hora seguinte. Cada envio aparece em **Últimos envios** na aba E-mails.

Para testar sem esperar: na aba E-mails, use **Ver prévia** e **Enviar teste para mim**.

---

## Como funciona o uso

- **Quem é você?** — no primeiro acesso cada pessoa escolhe o próprio nome; ele vai para o histórico das alterações. Dá para trocar no botão com o nome, no topo. (É identificação, não login: quem tem a senha da equipe pode alterar qualquer atividade.)
- **Prazo** — a primeira definição de prazo não pede motivo. Mudar um prazo já definido exige motivo e marca a atividade como **Data alterada** (com "Antes: …").
- **Atrasada** — prazo anterior a hoje e status diferente de Concluído.
- **"15 de cada mês"** — as duas ações recorrentes de RH mostram "Todo dia 15" e o próximo dia 15; o prazo delas não é editável.
- O link **Abrir minhas atividades** do e-mail já abre a página filtrada na pessoa.

## Ajustes direto no Supabase (Table Editor)

- Texto de uma ação: tabela `atividades`, coluna `acao`.
- Frase do painel ("Visita da certificadora…"): tabela `config`, coluna `aviso_painel`.
- Renomear pessoa: tabela `pessoas`, coluna `nome`.

## Rodar no computador (opcional)

```bash
npm install
cp .env.example .env    # preencha
npm run dev             # http://localhost:3000
```
