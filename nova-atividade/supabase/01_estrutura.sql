-- =====================================================================
-- Plano de Ação · Auditoria Interna (OROS · BU Educação)
-- 1/4 — Estrutura do banco
--
-- Cole no Supabase: SQL Editor → New query → Run.
-- Pode rodar de novo sem perder dados (só cria o que ainda não existe).
-- =====================================================================

create table if not exists areas (
  id     serial primary key,
  nome   text not null unique,
  ordem  int  not null
);

create table if not exists pessoas (
  id         serial primary key,
  nome       text not null unique,
  email      text,
  recebe     boolean not null default true,   -- recebe o e-mail semanal?
  criado_em  timestamptz not null default now()
);

create table if not exists atividades (
  id              serial primary key,
  area_id         int  not null references areas(id),
  numero          int,                         -- Nº que aparece no documento
  ordem           int  not null,               -- ordem dentro da área
  acao            text not null,
  observacao      text,
  prazo           date,                        -- prazo atual
  prazo_original  date,                        -- primeiro prazo definido (para marcar "Data alterada")
  dia_recorrente  smallint check (dia_recorrente between 1 and 31), -- ex.: "15 de cada mês"
  status          text not null default 'a_fazer'
                  check (status in ('a_fazer', 'fazendo', 'concluido')),
  concluido_em    timestamptz,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  text,
  unique (area_id, ordem)
);

create table if not exists atividade_responsaveis (
  atividade_id int not null references atividades(id) on delete cascade,
  pessoa_id    int not null references pessoas(id)    on delete cascade,
  primary key (atividade_id, pessoa_id)
);

-- Tudo o que muda numa atividade fica registrado aqui
create table if not exists historico (
  id              bigserial primary key,
  atividade_id    int  not null references atividades(id) on delete cascade,
  tipo            text not null check (tipo in
                    ('criada', 'prazo_definido', 'prazo_alterado', 'status', 'responsavel', 'observacao')),
  valor_anterior  text,
  valor_novo      text,
  motivo          text,
  autor           text,
  criado_em       timestamptz not null default now()
);
create index if not exists historico_atividade_idx on historico (atividade_id, criado_em);

-- Pontos gerais do documento (Sistemas e Observações) — só leitura na tela
create table if not exists observacoes_gerais (
  id     serial primary key,
  grupo  text not null,
  texto  text not null,
  ordem  int  not null,
  unique (grupo, ordem)
);

-- Configuração única (uma linha só) da tela de E-mails
create table if not exists config (
  id                     int primary key default 1 check (id = 1),
  aviso_painel           text    default 'Visita da certificadora prevista para fevereiro/2027',
  remetente_email        text,
  remetente_nome         text    not null default 'Plano de Ação OROS',
  envio_ativo            boolean not null default true,
  dia_semana             smallint not null default 1 check (dia_semana between 0 and 6), -- 0 = domingo, 1 = segunda
  horario                smallint not null default 9 check (horario between 0 and 23),   -- hora de Brasília
  destacar_atrasadas     boolean not null default true,
  avisar_prazo_alterado  boolean not null default true,
  incluir_sem_prazo      boolean not null default true,
  resumo_email           text,
  ultimo_envio_em        timestamptz
);
insert into config (id) values (1) on conflict (id) do nothing;

-- Registro de cada e-mail enviado (para conferir se o agendamento rodou)
create table if not exists envios (
  id            bigserial primary key,
  criado_em     timestamptz not null default now(),
  tipo          text not null check (tipo in ('lembrete', 'resumo', 'teste')),
  destinatario  text,
  pessoa_id     int references pessoas(id) on delete set null,
  assunto       text,
  ok            boolean not null,
  erro          text
);

-- ---------------------------------------------------------------------
-- Segurança: RLS ligado e nenhuma política.
-- A chave pública (publishable) não lê nem grava direto nas tabelas:
-- a página só usa as funções do 03_funcoes.sql, que validam tudo.
-- ---------------------------------------------------------------------
alter table areas                  enable row level security;
alter table pessoas                enable row level security;
alter table atividades             enable row level security;
alter table atividade_responsaveis enable row level security;
alter table historico              enable row level security;
alter table observacoes_gerais     enable row level security;
alter table config                 enable row level security;
alter table envios                 enable row level security;
