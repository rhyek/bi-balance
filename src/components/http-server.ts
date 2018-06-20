import Koa from 'koa';
import queryBank from '../query-bank';

const app = new Koa();

app.use(async ctx => {
  if (ctx.request.url.endsWith('favicon.ico')) {
    ctx.set('Content-Type', 'image/x-icon');
    ctx.body = null;
  } else {
    const result = await queryBank();
    ctx.body = result;
  }
});

app.listen(3000, () => {
  console.log('Listening on port 3000.');
});
