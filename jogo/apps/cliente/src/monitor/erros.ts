// Avisa os erros que acontecem no navegador dos jogadores (Sentry). Só liga no site
// publicado e quando VITE_SENTRY_DSN está preenchido em `.env.production`; no
// `npm run dev` fica desligado para não encher o painel com erros de quem está programando.

import * as Sentry from '@sentry/browser';
import { VERSAO } from '../versao';

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn && import.meta.env.PROD) {
  Sentry.init({
    dsn,
    release: `terna@${VERSAO}`,
    environment: 'producao',
  });
}
