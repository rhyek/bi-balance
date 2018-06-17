import Decimal from 'decimal.js';
import Koa from 'koa';
import numeral from 'numeral';
import puppeteer, { Browser } from 'puppeteer';

require('dotenv').config();

let browser: Browser | null = null;

const app = new Koa();

app.use(async ctx => {
  const startTime = new Date();

  if (!browser) {
    browser = await puppeteer.launch();
  }

  const page = await browser.newPage();

  page.on('dialog', dialog => {
    dialog.accept();
  });

  let loginFrame = null;
  while (!loginFrame) {
    await page.goto('https://www.bienlinea.bi.com.gt');
    loginFrame = page.frames().find(frame => frame.name() === 'login');
  }
  await (await loginFrame.$('#cnempresa'))!.type(process.env.CNEMPRESA!);
  await (await loginFrame.$('#cusuario'))!.type(process.env.CUSUARIO!);
  await (await loginFrame.$('#ccontra'))!.type(process.env.CCONTRA!);
  const loginPromise = new Promise(resolve => {
    let done = 0;
    page.on('requestfinished', async request => {
      if (request.url() === 'https://www.bienlinea.bi.com.gt/app/navmenu/navmenu.asp') {
        done++;
      } else if (request.url() === 'https://www.bienlinea.bi.com.gt/app/menu.asp') {
        done++;
      }
      if (done === 2) {
        page.removeAllListeners('requestfinished');
        resolve();
      }
    });
  });

  const loginButton = await loginFrame.$('#btnEnviar');
  await loginButton!.click();
  await loginPromise;

  const tipoCambioFrame = page.frames().find(frame => frame.name() === 'tipocambio')!;
  const ratesText = await tipoCambioFrame.evaluate(
    td => td.textContent,
    await tipoCambioFrame.waitForSelector('table > tbody > tr > td')
  );
  const exchangeRate = {
    buy: parseFloat(ratesText.match(/Compra: (.+)/)[1]),
    sell: parseFloat(ratesText.match(/Venta: (.+)/)[1]),
  };

  const accountsPromise = new Promise(resolve => {
    page.on('requestfinished', async request => {
      if (request.url().startsWith('https://www.bienlinea.bi.com.gt/cuentas/blncuentas.asp')) {
        page.removeAllListeners('requestfinished');
        resolve();
      }
    });
  });

  const contentsFrame = page.frames().find(frame => frame.name() === 'contents')!;
  const subMenuLink = await contentsFrame.waitForSelector('#divSlide0 > a', { visible: true });
  await subMenuLink.click();
  const accountsLink = await contentsFrame.waitForSelector('#divSlideSub0_0 > a', {
    visible: true,
  });
  await accountsLink.click();
  await accountsPromise;

  const mainFrame = page.frames().find(frame => frame.name() === 'main')!;
  const accountNumber = await mainFrame.evaluate(
    a => a.textContent.trim(),
    await mainFrame.waitForSelector(
      'table table > tbody > tr:nth-of-type(3) > td:nth-of-type(2) > a'
    )
  );
  const availableRaw = await mainFrame.evaluate(
    td => td.textContent.trim(),
    await mainFrame.waitForSelector('table table > tbody > tr:nth-of-type(3) > td:nth-of-type(4)')
  );

  await page.close();

  const Q = parseFloat(availableRaw.replace(/,/g, ''));
  const available = {
    Q,
    $: parseFloat(new Decimal(Q).div(exchangeRate.sell).toFixed(2)),
  };
  const formatted = {
    Q: numeral(available.Q).format('0,0.00'),
    $: numeral(available.$).format('0,0.00'),
  };

  const endTime = new Date();
  const duration = endTime.getTime() - startTime.getTime();

  const result = {
    accounts: [
      {
        accountNumber,
        available,
        formatted,
      },
    ],
    exchangeRate,
    duration,
  };

  ctx.body = result;
});

app.listen(3000, () => {
  console.log('Listening on port 3000.');
});
