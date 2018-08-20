import Koa from 'koa';
import Raven from 'raven';
import queryBank from '../query-bank';

const app = new Koa();

app
  .use(async (ctx, next) => {
    if (ctx.request.url.endsWith('favicon.ico')) {
      ctx.throw(404);
    }
    await next();
  })
  .use(async (ctx, next) => {
    ctx.assert(
      ctx.headers['x-access-key'] === process.env.ACCESS_KEY,
      401,
      'No authentication provided.'
    );
    await next();
  })
  .use(async ctx => {
    const result = await queryBank();
    ctx.body = result;
  })
  .on('error', (error, ctx) => {
    if (!error.expose) {
      if (process.env.SENTRY_ENABLED === 'true') {
        Raven.captureException(error, {
          req: ctx && ctx.request,
        })
      } else {
        console.error(error);
      }
    }
  })
  .listen(3000, () => {
    console.log('Listening on port 3000.');
  });
