import Raven from 'raven';

Raven.config(process.env.SENTRY_URL).install();