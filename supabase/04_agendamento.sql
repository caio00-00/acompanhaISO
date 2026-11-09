-- =====================================================================
-- 4/4 — Agendamento dos e-mails semanais (opcional: só se for usar os e-mails)
-- Rode por último, DEPOIS do primeiro deploy na Vercel.
--
-- Antes de rodar, troque:
--   SEU-PROJETO.vercel.app   → o endereço do site na Vercel
--   COLE_AQUI_O_CRON_SECRET  → o mesmo valor da variável CRON_SECRET na Vercel
--
-- Ele chama a API de hora em hora; a própria API decide se é o dia/horário
-- escolhido na aba E-mails e garante que envia só uma vez por dia.
-- Pode rodar de novo (ex.: para trocar o endereço): o agendamento é substituído.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'lembretes-plano-acao',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://SEU-PROJETO.vercel.app/api/lembretes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer COLE_AQUI_O_CRON_SECRET'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Para conferir se está rodando:
--   select jobname, schedule, active from cron.job;
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
--   select status_code, content, created from net._http_response order by created desc limit 5;
--
-- Para desligar de vez:
--   select cron.unschedule('lembretes-plano-acao');
