-- =====================================================================
-- 3/4 — Funções que a página usa (acesso pela publishable key)
-- Rode depois do 01 e do 02. Pode rodar de novo quando atualizar o projeto.
--
-- Como funciona a segurança:
--   - As tabelas ficam fechadas para a chave pública (RLS ligado, sem políticas
--     e sem permissão direta). Ninguém faz select/insert/update direto nelas.
--   - A página só chama as funções abaixo. Elas validam tudo e gravam o
--     histórico (ex.: mudar prazo sem motivo é recusado pelo próprio banco).
-- =====================================================================

-- Histórico aceita o tipo 'criada' (atividades incluídas pela página)
alter table historico drop constraint if exists historico_tipo_check;
alter table historico add constraint historico_tipo_check check (tipo in
  ('criada', 'prazo_definido', 'prazo_alterado', 'status', 'responsavel', 'observacao'));

-- ---------------------------------------------------------------------
-- Leitura: tudo o que as telas precisam, num JSON só
-- ---------------------------------------------------------------------
create or replace function carregar_dados()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'config', (select to_jsonb(c) from config c where c.id = 1),
    'areas', coalesce((select jsonb_agg(to_jsonb(a) order by a.ordem) from areas a), '[]'::jsonb),
    'pessoas', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'email', p.email, 'recebe', p.recebe) order by p.nome)
      from pessoas p), '[]'::jsonb),
    'atividades', coalesce((
      select jsonb_agg(
               to_jsonb(t) || jsonb_build_object('responsaveis', coalesce((
                 select jsonb_agg(r.pessoa_id order by p.nome)
                 from atividade_responsaveis r join pessoas p on p.id = r.pessoa_id
                 where r.atividade_id = t.id), '[]'::jsonb))
               order by a.ordem, t.ordem)
      from atividades t join areas a on a.id = t.area_id), '[]'::jsonb),
    'historico', coalesce((select jsonb_agg(to_jsonb(h) order by h.criado_em, h.id) from historico h), '[]'::jsonb),
    'observacoes', coalesce((
      select jsonb_agg(jsonb_build_object('grupo', o.grupo, 'texto', o.texto) order by o.grupo desc, o.ordem)
      from observacoes_gerais o), '[]'::jsonb),
    'envios', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.criado_em desc)
      from (select criado_em, tipo, destinatario, assunto, ok, erro from envios order by criado_em desc limit 15) e), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- Edição de UMA atividade (status, prazo, observação, responsáveis)
-- ---------------------------------------------------------------------
create or replace function atualizar_atividade(
  p_id                 int,
  p_autor              text,
  p_status             text    default null,
  p_alterar_prazo      boolean default false,
  p_prazo              date    default null,
  p_motivo             text    default null,
  p_alterar_observacao boolean default false,
  p_observacao         text    default null,
  p_responsaveis       int[]   default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  at        atividades%rowtype;
  v_autor   text := left(nullif(trim(p_autor), ''), 120);
  v_motivo  text := left(nullif(trim(p_motivo), ''), 1000);
  v_obs     text := left(nullif(trim(p_observacao), ''), 2000);
  v_mudou   boolean := false;
  v_antes   text;
  v_depois  text;
  v_novos   int[];
begin
  if v_autor is null then
    raise exception 'Informe quem está fazendo a alteração';
  end if;

  select * into at from atividades where id = p_id for update;
  if not found then
    raise exception 'Atividade não encontrada';
  end if;

  -- status
  if p_status is not null and p_status <> at.status then
    if p_status not in ('a_fazer', 'fazendo', 'concluido') then
      raise exception 'Status inválido';
    end if;
    update atividades
       set status = p_status,
           concluido_em = case when p_status = 'concluido' then now() end
     where id = p_id;
    insert into historico (atividade_id, tipo, valor_anterior, valor_novo, autor)
    values (p_id, 'status', at.status, p_status, v_autor);
    v_mudou := true;
  end if;

  -- prazo
  if p_alterar_prazo and p_prazo is distinct from at.prazo then
    if at.dia_recorrente is not null and at.prazo is null then
      raise exception 'Esta atividade é recorrente (todo dia %); o prazo não muda por aqui.', at.dia_recorrente;
    end if;
    if at.prazo is null and at.prazo_original is null then
      -- primeira definição: sem motivo e sem marca de "data alterada"
      update atividades set prazo = p_prazo, prazo_original = p_prazo where id = p_id;
      insert into historico (atividade_id, tipo, valor_novo, autor)
      values (p_id, 'prazo_definido', p_prazo::text, v_autor);
    else
      if v_motivo is null or length(v_motivo) < 3 then
        raise exception 'Informe o motivo da alteração do prazo';
      end if;
      update atividades set prazo = p_prazo where id = p_id;
      insert into historico (atividade_id, tipo, valor_anterior, valor_novo, motivo, autor)
      values (p_id, 'prazo_alterado', at.prazo::text, p_prazo::text, v_motivo, v_autor);
    end if;
    v_mudou := true;
  end if;

  -- observação
  if p_alterar_observacao and v_obs is distinct from at.observacao then
    update atividades set observacao = v_obs where id = p_id;
    insert into historico (atividade_id, tipo, valor_anterior, valor_novo, autor)
    values (p_id, 'observacao', at.observacao, v_obs, v_autor);
    v_mudou := true;
  end if;

  -- responsáveis
  if p_responsaveis is not null then
    select coalesce(array_agg(distinct x order by x), '{}'::int[]) into v_novos from unnest(p_responsaveis) x;
    if exists (select 1 from unnest(v_novos) x where not exists (select 1 from pessoas where id = x)) then
      raise exception 'Responsável inválido';
    end if;
    if v_novos is distinct from (
         select coalesce(array_agg(pessoa_id order by pessoa_id), '{}'::int[])
         from atividade_responsaveis where atividade_id = p_id) then
      select string_agg(p.nome, ', ' order by p.nome) into v_antes
        from atividade_responsaveis r join pessoas p on p.id = r.pessoa_id where r.atividade_id = p_id;
      select string_agg(nome, ', ' order by nome) into v_depois from pessoas where id = any (v_novos);
      delete from atividade_responsaveis where atividade_id = p_id;
      insert into atividade_responsaveis (atividade_id, pessoa_id) select p_id, x from unnest(v_novos) x;
      insert into historico (atividade_id, tipo, valor_anterior, valor_novo, autor)
      values (p_id, 'responsavel', v_antes, v_depois, v_autor);
      v_mudou := true;
    end if;
  end if;

  if v_mudou then
    update atividades set atualizado_em = now(), atualizado_por = v_autor where id = p_id;
  end if;
  return jsonb_build_object('ok', true, 'alterado', v_mudou);
end;
$$;

-- ---------------------------------------------------------------------
-- Nova atividade (o Nº é o próximo da área). Pode criar uma área nova.
-- ---------------------------------------------------------------------
create or replace function adicionar_atividade(
  p_autor        text,
  p_acao         text,
  p_area_id      int    default null,
  p_area_nova    text   default null,
  p_prazo        date   default null,
  p_responsaveis int[]  default null,
  p_observacao   text   default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor  text := left(nullif(trim(p_autor), ''), 120);
  v_acao   text := left(nullif(trim(p_acao), ''), 2000);
  v_obs    text := left(nullif(trim(p_observacao), ''), 2000);
  v_nova   text := left(nullif(trim(p_area_nova), ''), 80);
  v_area   int  := p_area_id;
  v_resp   int[];
  v_num    int;
  v_ordem  int;
  v_id     int;
  v_nomes  text;
begin
  if v_autor is null then raise exception 'Informe quem está fazendo a alteração'; end if;
  if v_acao is null or length(v_acao) < 5 then raise exception 'Descreva a ação (o que precisa ser feito)'; end if;

  if v_area is null then
    if v_nova is null then raise exception 'Escolha a área'; end if;
    select id into v_area from areas where lower(nome) = lower(v_nova);
    if v_area is null then
      insert into areas (nome, ordem) select v_nova, coalesce(max(ordem), 0) + 1 from areas returning id into v_area;
    end if;
  elsif not exists (select 1 from areas where id = v_area) then
    raise exception 'Área inválida';
  end if;

  select coalesce(array_agg(distinct x), '{}'::int[]) into v_resp from unnest(coalesce(p_responsaveis, '{}'::int[])) x;
  if exists (select 1 from unnest(v_resp) x where not exists (select 1 from pessoas where id = x)) then
    raise exception 'Responsável inválido';
  end if;

  perform 1 from areas where id = v_area for update;   -- evita Nº repetido se duas pessoas salvarem juntas
  select coalesce(max(numero), 0) + 1, coalesce(max(ordem), 0) + 1 into v_num, v_ordem
    from atividades where area_id = v_area;

  insert into atividades (area_id, numero, ordem, acao, observacao, prazo, prazo_original, atualizado_por)
  values (v_area, v_num, v_ordem, v_acao, v_obs, p_prazo, p_prazo, v_autor)
  returning id into v_id;

  insert into atividade_responsaveis (atividade_id, pessoa_id) select v_id, x from unnest(v_resp) x;
  select string_agg(nome, ', ' order by nome) into v_nomes from pessoas where id = any (v_resp);

  insert into historico (atividade_id, tipo, valor_novo, autor) values (v_id, 'criada', v_nomes, v_autor);
  if p_prazo is not null then
    insert into historico (atividade_id, tipo, valor_novo, autor) values (v_id, 'prazo_definido', p_prazo::text, v_autor);
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'area_id', v_area, 'numero', v_num);
end;
$$;

-- ---------------------------------------------------------------------
-- Pessoas
-- ---------------------------------------------------------------------
create or replace function adicionar_pessoa(p_nome text, p_email text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome  text := left(nullif(trim(p_nome), ''), 120);
  v_email text := lower(left(nullif(trim(p_email), ''), 200));
  v_id    int;
begin
  if v_nome is null then raise exception 'Informe o nome'; end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'E-mail inválido: %', v_email;
  end if;
  insert into pessoas (nome, email, recebe) values (v_nome, v_email, true) returning id into v_id;
  return jsonb_build_object('id', v_id, 'nome', v_nome, 'email', v_email, 'recebe', true);
exception when unique_violation then
  raise exception 'Já existe uma pessoa chamada %', v_nome;
end;
$$;

create or replace function salvar_pessoas(p_pessoas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item    jsonb;
  v_email text;
begin
  if jsonb_typeof(p_pessoas) <> 'array' then raise exception 'Lista de pessoas inválida'; end if;
  for item in select * from jsonb_array_elements(p_pessoas) loop
    v_email := lower(left(nullif(trim(item->>'email'), ''), 200));
    if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
      raise exception 'E-mail inválido: %', v_email;
    end if;
    update pessoas
       set email = v_email,
           recebe = coalesce((item->>'recebe')::boolean, recebe)
     where id = (item->>'id')::int;
  end loop;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- Configuração da aba E-mails
-- ---------------------------------------------------------------------
create or replace function salvar_config(p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rem    text := lower(nullif(trim(p_config->>'remetente_email'), ''));
  v_resumo text := nullif(trim(p_config->>'resumo_email'), '');
  v_dia    int  := (p_config->>'dia_semana')::int;
  v_hora   int  := (p_config->>'horario')::int;
  e        text;
begin
  if v_rem is not null and v_rem !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'E-mail do remetente inválido';
  end if;
  if v_resumo is not null then
    foreach e in array regexp_split_to_array(v_resumo, '\s*[;,]\s*') loop
      if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
        raise exception 'E-mail do resumo geral inválido (separe vários por vírgula)';
      end if;
    end loop;
  end if;
  if v_dia is null or v_dia not between 0 and 6 then raise exception 'Dia inválido'; end if;
  if v_hora is null or v_hora not between 0 and 23 then raise exception 'Horário inválido'; end if;

  update config set
    remetente_email       = v_rem,
    remetente_nome        = coalesce(left(nullif(trim(p_config->>'remetente_nome'), ''), 120), 'Plano de Ação OROS'),
    envio_ativo           = coalesce((p_config->>'envio_ativo')::boolean, envio_ativo),
    dia_semana            = v_dia,
    horario               = v_hora,
    destacar_atrasadas    = coalesce((p_config->>'destacar_atrasadas')::boolean, destacar_atrasadas),
    avisar_prazo_alterado = coalesce((p_config->>'avisar_prazo_alterado')::boolean, avisar_prazo_alterado),
    incluir_sem_prazo     = coalesce((p_config->>'incluir_sem_prazo')::boolean, incluir_sem_prazo),
    resumo_email          = left(v_resumo, 500)
  where id = 1;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- Usadas pelo envio automático dos e-mails (api/lembretes.js na Vercel)
-- ---------------------------------------------------------------------
-- Reserva o envio de hoje (horário de Brasília) para não mandar duas vezes no mesmo dia
create or replace function reservar_envio_semanal()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior timestamptz;
begin
  select ultimo_envio_em into v_anterior from config where id = 1 for update;
  if v_anterior is not null
     and (v_anterior at time zone 'America/Sao_Paulo')::date >= (now() at time zone 'America/Sao_Paulo')::date then
    return jsonb_build_object('reservado', false);
  end if;
  update config set ultimo_envio_em = now() where id = 1;
  return jsonb_build_object('reservado', true, 'anterior', v_anterior);
end;
$$;

-- Se nenhum e-mail saiu (ex.: SMTP fora do ar), libera para tentar de novo na próxima hora
create or replace function liberar_envio_semanal(p_anterior timestamptz default null)
returns jsonb
language sql
security definer
set search_path = public
as $$
  update config set ultimo_envio_em = p_anterior
   where id = 1 and (ultimo_envio_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date;
  select jsonb_build_object('ok', true);
$$;

create or replace function registrar_envio(
  p_tipo text, p_destinatario text, p_pessoa_id int, p_assunto text, p_ok boolean, p_erro text default null)
returns jsonb
language sql
security definer
set search_path = public
as $$
  insert into envios (tipo, destinatario, pessoa_id, assunto, ok, erro)
  select p_tipo, left(p_destinatario, 300), p_pessoa_id, left(p_assunto, 300), p_ok, left(p_erro, 1000)
  where p_tipo in ('lembrete', 'resumo', 'teste');
  select jsonb_build_object('ok', true);
$$;

-- ---------------------------------------------------------------------
-- Permissões: tabelas fechadas, funções liberadas para a chave pública
-- ---------------------------------------------------------------------
revoke all on table areas, pessoas, atividades, atividade_responsaveis, historico,
                    observacoes_gerais, config, envios from anon, authenticated;

grant execute on function
  carregar_dados(),
  atualizar_atividade(int, text, text, boolean, date, text, boolean, text, int[]),
  adicionar_atividade(text, text, int, text, date, int[], text),
  adicionar_pessoa(text, text),
  salvar_pessoas(jsonb),
  salvar_config(jsonb),
  reservar_envio_semanal(),
  liberar_envio_semanal(timestamptz),
  registrar_envio(text, text, int, text, boolean, text)
to anon, authenticated;

-- Avisa a API do Supabase que há funções novas
notify pgrst, 'reload schema';
