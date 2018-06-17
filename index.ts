import Decimal from 'decimal.js';
import Koa from 'koa';
import numeral from 'numeral';
import puppeteer, { Browser, Frame } from 'puppeteer';

require('dotenv').config();

let browser: Browser | null = null;

const app = new Koa();

app.use(async ctx => {
  const startTime = new Date();

  if (!browser) {
    browser = await puppeteer.launch();
  }

  const page = await browser.newPage();

  const getFrame = (name: string): Promise<Frame> => {
    return new Promise(resolve => {
      const listener = (frame: Frame) => {
        if (frame.name() === name) {
          page.removeListener('framenavigated', listener);
          resolve(frame);
        }
      };
      const found = page.frames().find(frame => frame.name() === name);
      if (found) {
        return resolve(found);
      }
      page.on('framenavigated', listener);
    });
  };

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

  const tipoCambioFrame = await getFrame('tipocambio');
  const ratesText = await tipoCambioFrame.evaluate(
    td => td.textContent,
    await tipoCambioFrame.waitForSelector('table > tbody > tr > td')
  );
  const exchangeRates = {
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

  const contentsFrame = await getFrame('contents');
  const subMenuLink = await contentsFrame.waitForSelector('#divSlide0 > a', { visible: true });
  await subMenuLink.click();
  const accountsLink = await contentsFrame.waitForSelector('#divSlideSub0_0 > a', {
    visible: true,
  });
  await accountsLink.click();
  await accountsPromise;

  const accounts = [];

  const mainFrame = await getFrame('main');
  const table = await mainFrame.waitForSelector('table table');
  const accountTRs = await table.$$('table table > tbody > tr[align=right]');

  for (const tr of accountTRs) {
    const currencyRaw: string = await mainFrame.evaluate(
      (td: HTMLTableCellElement) => td.textContent,
      await tr.$('td:nth-of-type(1)')
    );
    const currency = currencyRaw.match(/(.+)\./)![1];

    const number: string = await mainFrame.evaluate(
      (a: HTMLAnchorElement) => a.textContent!.trim(),
      await tr.$('td:nth-of-type(2) > a')
    );
    const availableRaw = await mainFrame.evaluate(
      (td: HTMLTableCellElement) => td.textContent!.trim(),
      await tr.$('td:nth-of-type(4)')
    );

    const rateUsed = currency === 'Q' ? 'sell' : 'buy';

    const Q = parseFloat(availableRaw.replace(/,/g, ''));
    const $ = parseFloat(new Decimal(Q).div(exchangeRates[rateUsed]).toFixed(2));

    const available = {
      raw: { Q, $ },
      formatted: {
        Q: numeral(Q).format('0,0.00'),
        $: numeral($).format('0,0.00'),
      },
    };

    accounts.push({
      number,
      currency,
      rateUsed,
      available,
    });
  }

  await page.close();

  const endTime = new Date();
  const duration = endTime.getTime() - startTime.getTime();

  const result = {
    accounts,
    exchangeRates,
    duration,
  };

  ctx.body = result;
});

app.listen(3000, () => {
  console.log('Listening on port 3000.');
});
