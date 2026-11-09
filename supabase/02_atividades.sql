-- =====================================================================
-- 2/4 — Atividades fixas do plano (do documento "Pontos de melhorias
-- levantados na Auditoria Interna"). Rode depois do 01_estrutura.sql.
-- Só insere se a tabela estiver vazia: rodar de novo não apaga o andamento.
-- =====================================================================

insert into areas (nome, ordem) values
  ('Compliance', 1),
  ('Compras', 2),
  ('Processos', 3),
  ('Departamento Pessoal', 4),
  ('Recursos Humanos', 5),
  ('Qualidade', 6),
  ('Estudologia', 7),
  ('Almoxarifado', 8)
on conflict (nome) do nothing;

insert into pessoas (nome) values
  ('Anderson Adelino'),
  ('Isaac Sales'),
  ('Jair'),
  ('Jurandir'),
  ('Leonardo Argolo'),
  ('Letícia'),
  ('Lucas Batista'),
  ('Mairton'),
  ('Mauro'),
  ('Priscila Martinez'),
  ('Rafaelle'),
  ('Raíssa'),
  ('Vanessa')
on conflict (nome) do nothing;

insert into atividades (area_id, numero, ordem, acao, observacao, prazo, prazo_original, dia_recorrente)
select a.id, v.numero, v.ordem, v.acao, v.observacao, v.prazo, v.prazo, v.dia
from (values
  ('Compliance', 1, 1, 'Verificar com Gilvana o curso de compliance na plataforma da ISG e como devemos implementar na BU Educação', null, '2026-12-04'::date, null::smallint),
  ('Compras', 1, 1, 'Garantir a rastreabilidade de toda compra realizada, do início ao fim', null, '2026-11-27'::date, null::smallint),
  ('Compras', 2, 2, 'Solicitar que os comprovantes de pagamento sejam adicionados no e-mail ou no Fluig', null, '2026-11-27'::date, null::smallint),
  ('Processos', 1, 1, 'Utilizar documento padronizado, com a identidade visual da OROS no modelo da ISG', null, null::date, null::smallint),
  ('Processos', 3, 2, 'Unificar os processos, que estão muito divididos', null, null::date, null::smallint),
  ('Processos', 4, 3, 'Reduzir a quantidade de processos: um completo para compras, um para almoxarifado e um para entrada e saída de equipamentos', null, null::date, null::smallint),
  ('Processos', 5, 4, 'Usar código próprio para o documento de entrega de materiais (pode ser o código do processo de entrega de material) e anexar o formulário ao processo de entrega', null, null::date, null::smallint),
  ('Processos', 6, 5, 'Incluir no mapeamento do suporte técnico, como anexo, o formulário que o helpdesk e o técnico preenchem no TomTicket', null, null::date, null::smallint),
  ('Processos', 7, 6, 'Adicionar no processo do pedagógico a validação da SEDUC, com evidências', null, null::date, null::smallint),
  ('Processos', 8, 7, 'Informar nos processos os riscos e como são controlados', null, null::date, null::smallint),
  ('Processos', 9, 8, 'Adicionar metas e indicadores aos processos', null, null::date, null::smallint),
  ('Processos', 10, 9, 'Mapear o processo de admissão de PJ e de CLT', null, null::date, null::smallint),
  ('Processos', 11, 10, 'Colocar o fluxo em bastão como anexo dos processos', null, null::date, null::smallint),
  ('Processos', 12, 11, 'Codificar os processos', null, null::date, null::smallint),
  ('Departamento Pessoal', 1, 1, 'Incluir a CTPS nos documentos necessários para admissão', null, '2026-11-09'::date, null::smallint),
  ('Departamento Pessoal', 2, 2, 'Colocar a data em que foi gerado o documento RAV', null, '2026-11-10'::date, null::smallint),
  ('Departamento Pessoal', 3, 3, 'Fazer o organograma funcional, não de pessoas', null, '2026-11-16'::date, null::smallint),
  ('Departamento Pessoal', 4, 4, 'Ajustar os cargos para que o mesmo cargo não seja superior ao outro (Letícia e Paulo Sousa)', null, '2026-11-16'::date, null::smallint),
  ('Departamento Pessoal', 5, 5, 'Elaborar o descritivo de cargo dos PJs que trabalham diretamente com a OROS/Estudologia', null, '2026-11-27'::date, null::smallint),
  ('Departamento Pessoal', 6, 6, 'Criar a avaliação objetiva de candidatos', 'Cada gestor criará o da sua área', '2026-11-27'::date, null::smallint),
  ('Departamento Pessoal', 7, 7, 'Fazer a tabela com os requisitos para cada professor', null, '2026-11-27'::date, null::smallint),
  ('Recursos Humanos', 1, 1, 'Divulgar o canal de denúncias, mantendo-o sempre disseminado', null, null::date, 15::smallint),
  ('Recursos Humanos', 2, 2, 'Comunicar o Código de Ética e de Conduta, mantendo-o sempre disseminado', null, null::date, 15::smallint),
  ('Recursos Humanos', 3, 3, 'Ter a lista de presença dos treinamentos de compliance', 'Falar com Gilvana sobre a lista dos últimos treinamentos', '2026-11-13'::date, null::smallint),
  ('Recursos Humanos', 4, 4, 'Aplicar a política de conflito de interesses, com termo para assinatura', null, '2026-11-27'::date, null::smallint),
  ('Recursos Humanos', 5, 5, 'Ter termo de ciência dos treinamentos, que deve ser obrigatório', null, '2026-11-27'::date, null::smallint),
  ('Recursos Humanos', 6, 6, 'Melhorar o onboarding/integração: cursos na universidade corporativa e checklist antes de começar a trabalhar', null, '2026-11-27'::date, null::smallint),
  ('Recursos Humanos', 7, 7, 'Ter plano de integração com os treinamentos obrigatórios: compliance, código de ética (com aceite), política anticorrupção e política de qualidade', null, '2026-11-27'::date, null::smallint),
  ('Recursos Humanos', 8, 8, 'Realizar a avaliação ergonômica', null, '2026-11-11'::date, null::smallint),
  ('Recursos Humanos', 9, 9, 'Treinar cada pessoa nos processos que irá realizar', 'O gestor da área solicitante vai treinar', '2026-11-27'::date, null::smallint),
  ('Qualidade', 1, 1, 'Realizar avaliação de fornecedores: criar critérios, estabelecer periodicidade, realizar plano de ação e estabelecer metas', null, null::date, null::smallint),
  ('Qualidade', 2, 2, 'Registrar as problemáticas que aconteceram (causa, ação imediata, plano de ação, responsável, prazo, eficácia e evidências), inclusive de forma retroativa: transformador, furto, link de internet, firewall, queda do vMix', null, '2026-12-10'::date, null::smallint),
  ('Qualidade', 3, 3, 'Criar a documentação de como funciona a pesquisa de qualidade dos contratos (notas aceitáveis, plano de ação)', null, '2026-11-13'::date, null::smallint),
  ('Qualidade', 4, 4, 'Criar e monitorar indicadores para os principais processos e reuni-los em um só lugar', null, null::date, null::smallint),
  ('Qualidade', 5, 5, 'Montar plano de contingência para as falhas que podem ocorrer (falta de energia, internet, computador)', null, null::date, null::smallint),
  ('Estudologia', 1, 1, 'Assinar a documentação da FINEP no site', null, '2026-12-01'::date, null::smallint),
  ('Estudologia', 2, 2, 'Verificar se os dados dos perfis que possuímos seguem as regras da LGPD', null, '2026-12-01'::date, null::smallint),
  ('Estudologia', 3, 3, 'Transformar os POPs em processos mapeados (consultoria e criação de software)', null, '2026-12-01'::date, null::smallint),
  ('Almoxarifado', 1, 1, 'Realizar contagem periódica, mensal (ajuste) e semestral (consolidada), com registro, comparativo entre sistema e real, validação do Mairton e plano de ação quando ocorrerem falhas', null, '2026-11-17'::date, null::smallint)
) as v(area, numero, ordem, acao, observacao, prazo, dia)
join areas a on a.nome = v.area
where not exists (select 1 from atividades);

insert into atividade_responsaveis (atividade_id, pessoa_id)
select t.id, p.id
from (values
  ('Compliance', 1, 'Letícia'),
  ('Compras', 2, 'Isaac Sales'),
  ('Processos', 1, 'Anderson Adelino'),
  ('Processos', 2, 'Anderson Adelino'),
  ('Processos', 3, 'Anderson Adelino'),
  ('Processos', 4, 'Anderson Adelino'),
  ('Processos', 5, 'Anderson Adelino'),
  ('Processos', 6, 'Anderson Adelino'),
  ('Processos', 7, 'Anderson Adelino'),
  ('Processos', 8, 'Anderson Adelino'),
  ('Processos', 9, 'Anderson Adelino'),
  ('Processos', 10, 'Anderson Adelino'),
  ('Processos', 11, 'Vanessa'),
  ('Departamento Pessoal', 1, 'Raíssa'),
  ('Departamento Pessoal', 2, 'Raíssa'),
  ('Departamento Pessoal', 3, 'Rafaelle'),
  ('Departamento Pessoal', 4, 'Isaac Sales'),
  ('Departamento Pessoal', 4, 'Rafaelle'),
  ('Departamento Pessoal', 5, 'Isaac Sales'),
  ('Departamento Pessoal', 7, 'Jair'),
  ('Recursos Humanos', 1, 'Mauro'),
  ('Recursos Humanos', 2, 'Mauro'),
  ('Recursos Humanos', 3, 'Mauro'),
  ('Recursos Humanos', 4, 'Mauro'),
  ('Recursos Humanos', 5, 'Mauro'),
  ('Recursos Humanos', 6, 'Mauro'),
  ('Recursos Humanos', 6, 'Raíssa'),
  ('Recursos Humanos', 7, 'Mauro'),
  ('Recursos Humanos', 8, 'Raíssa'),
  ('Recursos Humanos', 8, 'Isaac Sales'),
  ('Qualidade', 1, 'Letícia'),
  ('Qualidade', 2, 'Isaac Sales'),
  ('Qualidade', 2, 'Letícia'),
  ('Qualidade', 3, 'Letícia'),
  ('Qualidade', 4, 'Anderson Adelino'),
  ('Qualidade', 5, 'Anderson Adelino'),
  ('Estudologia', 1, 'Leonardo Argolo'),
  ('Estudologia', 2, 'Lucas Batista'),
  ('Estudologia', 2, 'Priscila Martinez'),
  ('Estudologia', 3, 'Priscila Martinez'),
  ('Almoxarifado', 1, 'Jurandir')
) as v(area, ordem, pessoa)
join areas a      on a.nome = v.area
join atividades t on t.area_id = a.id and t.ordem = v.ordem
join pessoas p    on p.nome = v.pessoa
where not exists (select 1 from atividade_responsaveis)
on conflict do nothing;

-- prazo definido no plano original (aparece no histórico de cada atividade)
insert into historico (atividade_id, tipo, valor_novo, autor, criado_em)
select id, 'prazo_definido', prazo::text, 'Auditoria interna', '2026-11-09 09:00:00-03'
from atividades
where prazo is not null and not exists (select 1 from historico);

insert into observacoes_gerais (grupo, ordem, texto) values
  ('Observações', 1, 'Considerar como data de admissão a data da última assinatura do contrato — falar com a Fernanda como iremos proceder'),
  ('Observações', 2, 'Ter sempre a validação do cliente, de maneira formal'),
  ('Observações', 3, 'Aplicar o modelo Critério, Padrão, Resultado'),
  ('Observações', 4, 'Garantir rastreabilidade em tudo'),
  ('Observações', 5, 'Reforçar comunicação, treinamentos, onboarding e integração'),
  ('Sistemas', 1, 'Concentrar em um local os acessos'),
  ('Sistemas', 2, 'Rastreio de todo o material do canal: aprovação, gravação, edição, publicação, backup')
on conflict (grupo, ordem) do nothing;
