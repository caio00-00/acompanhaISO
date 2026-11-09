# Plano de Ação · Auditoria Interna (OROS · BU Educação)

Página de acompanhamento das 39 ações levantadas na auditoria interna. Cada responsável entra, marca o andamento (A fazer → Fazendo → Concluído), ajusta o prazo com motivo e tudo fica salvo no Supabase com histórico. Opcionalmente, toda semana sai um e-mail para cada pessoa com o que está pendente.

- **Painel**: números gerais e um cartão por área (filtra por pessoa).
- **Atividades**: lista por área, filtros por pessoa, área, status, "data alterada" e "atrasadas"; botão **Editar** em cada uma.
- **E-mails**: remetente, dia/horário do envio automático, destinatários, prévia e teste.

A página fala direto com o Supabase usando a **publishable key**. Não precisa de senha do banco nem de variáveis na Vercel.

---

## Estrutura

```
public/
  config.js          URL do Supabase + publishable key  ← preencher
  supabase.js        chamada às funções do banco
  index.html, app.js, style.css
api/lembretes.js     única função da Vercel: envio dos e-mails (opcional)
lib/                 montagem dos e-mails e regras de prazo
supabase/
  01_estrutura.sql   tabelas
  02_atividades.sql  as 39 atividades, responsáveis e observações do documento
  03_funcoes.sql     funções que a página usa (obrigatório)
  04_agendamento.sql agendamento semanal dos e-mails (opcional)
```

---

## 1. Supabase

No **SQL Editor**, rode, nesta ordem e cada um numa query:

1. `supabase/01_estrutura.sql`
2. `supabase/02_atividades.sql`
3. `supabase/03_funcoes.sql`

Todos podem ser rodados de novo sem apagar o andamento.

**Segurança:** as tabelas ficam fechadas para a chave pública. A página só consegue chamar as funções do `03_funcoes.sql`, e elas validam tudo: por exemplo, mudar prazo sem motivo é recusado pelo próprio banco, e tudo vai para o histórico.

## 2. Ligar a página ao Supabase

Edite `public/config.js`:

- `SUPABASE_URL`: Project Settings → Data API → Project URL
- `SUPABASE_PUBLISHABLE_KEY`: Project Settings → API Keys → Publishable key (`sb_publishable_...`)

A publishable key pode ir para o GitHub. **Nunca** coloque ali a secret key (`sb_secret_...`) nem a senha do banco.

## 3. Vercel

Importe o repositório (**Add New → Project**). Framework Preset: **Other**, sem Build Command. Não precisa cadastrar variável nenhuma: depois do deploy, a página já funciona.

## 4. E-mails automáticos (opcional)

Os e-mails precisam da senha da conta de e-mail. Essa senha não pode ir para o GitHub, então estas variáveis ficam na Vercel (**Settings → Environment Variables**, depois **Redeploy**):

| Variável | O que é |
|---|---|
| `CRON_SECRET` | texto longo aleatório (o mesmo vai no 04_agendamento.sql) |
| `SMTP_HOST` | `smtp.gmail.com` (Google) ou `smtp.office365.com` (Microsoft) |
| `SMTP_PORT` | `465` (Google) ou `587` (Microsoft) |
| `SMTP_USER` | e-mail que envia |
| `SMTP_PASS` | senha de app dessa conta |
| `SITE_URL` | opcional: endereço do site, se usar domínio próprio |

- **Google Workspace / Gmail:** ative a verificação em duas etapas e crie uma *senha de app*.
- **Microsoft 365:** o administrador precisa habilitar "SMTP autenticado" para a caixa.
- **Remetente:** o "E-mail que envia" da aba E-mails deve ser o mesmo `SMTP_USER`.

Depois, abra `supabase/04_agendamento.sql`, troque o endereço do site e o `CRON_SECRET`, e rode no SQL Editor. Ele chama a Vercel de hora em hora; ela só envia no dia/horário configurado, uma vez por dia.

---

## Como funciona o uso

- **Quem é você?** No primeiro acesso, cada pessoa escolhe o próprio nome, que vai para o histórico. Dá para trocar no botão com o nome, no topo. É identificação, não login: quem tiver o link consegue ver e alterar as atividades, então não divulgue o link fora da equipe.
- **Prazo:** a primeira definição não pede motivo. Mudar um prazo já definido exige motivo e marca a atividade como **Data alterada**, mostrando "Antes: …".
- **Atrasada:** prazo anterior a hoje e status diferente de Concluído.
- **"15 de cada mês":** as duas ações recorrentes de RH mostram "Todo dia 15" e o próximo dia 15.
- **Enviar teste:** só envia para e-mails já cadastrados na lista.

## Ajustes direto no Supabase (Table Editor)

- **Texto de uma ação:** tabela `atividades`, coluna `acao`.
- **Frase do painel** ("Visita da certificadora…"): tabela `config`, coluna `aviso_painel`.
- **Renomear pessoa:** tabela `pessoas`, coluna `nome`.
