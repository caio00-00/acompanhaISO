// GET /api/dados → tudo o que as três telas usam
import { rota, exigirSenha } from '../lib/http.js';
import { carregarDados } from '../lib/dados.js';
import { smtpConfigurado } from '../lib/email.js';

export default rota({
  GET: async (req) => {
    exigirSenha(req);
    const dados = await carregarDados();
    return {
      ...dados,
      servidor: {
        smtp_configurado: smtpConfigurado(),
        smtp_usuario: process.env.SMTP_USER || null,
        agendamento_configurado: Boolean(process.env.CRON_SECRET),
      },
    };
  },
});
