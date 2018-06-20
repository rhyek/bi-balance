import Koa from 'koa';
import queryBank from '../query-bank';

const app = new Koa();

app.use(async (ctx, next) => {
  if (ctx.request.url.endsWith('favicon.ico')) {
    ctx.throw(404);
  }
  await next();
});

app.use(async (ctx, next) => {
  ctx.assert(
    ctx.headers['x-access-key'] === process.env.ACCESS_KEY,
    401,
    'No authentication provided.1'
  );
  await next();
});

app.use(async ctx => {
  const result = await queryBank();
  ctx.body = result;
});

app.listen(3000, () => {
  console.log('Listening on port 3000.');
});
