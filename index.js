const Decimal = require('decimal.js');
const numeral = require('numeral');
const puppeteer = require('puppeteer');

require('dotenv').config();

async function main() {
  const startTime = new Date();

  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  page.on('dialog', dialog => {
    dialog.accept();
  });

  let loginFrame = null;
  while (!loginFrame) {
    await page.goto('https://www.bienlinea.bi.com.gt');
    loginFrame = page.frames().find(frame => frame.name() === 'login');
  }
  await (await loginFrame.$('#cnempresa')).type(process.env.CNEMPRESA);
  await (await loginFrame.$('#cusuario')).type(process.env.CUSUARIO);
  await (await loginFrame.$('#ccontra')).type(process.env.CCONTRA);
  const loginPromise = new Promise(resolve => {
    let done = 0;
    page.on('requestfinished', async request => {
      if (request.url() === 'https://www.bienlinea.bi.com.gt/app/navmenu/navmenu.asp') {
        menuHTML = await request.response().text();
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
  await loginButton.click();
  await loginPromise;

  const tipoCambioFrame = page.frames().find(frame => frame.name() === 'tipocambio');
  const ratesText = await tipoCambioFrame.$eval('table > tbody > tr > td', td => td.textContent);
  const exchangeRate = parseFloat(ratesText.match(/Venta: (.+)/)[1]);

  const accountsPromise = new Promise(resolve => {
    page.on('requestfinished', async request => {
      if (request.url().startsWith('https://www.bienlinea.bi.com.gt/cuentas/blncuentas.asp')) {
        accountsHTML = await request.response().text();
        page.removeAllListeners('requestfinished');
        resolve();
      }
    });
  });

  const contentsFrame = page.frames().find(frame => frame.name() === 'contents');
  const subMenuLink = await contentsFrame.waitForSelector('#divSlide0 > a', { visible: true });
  await subMenuLink.click();
  const accountsLink = await contentsFrame.waitForSelector('#divSlideSub0_0 > a', {
    visible: true,
  });
  await accountsLink.click();
  await accountsPromise;

  const mainFrame = page.frames().find(frame => frame.name() === 'main');
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

  const Q = parseFloat(availableRaw.replace(/,/g, ''));
  const available = {
    Q,
    $: parseFloat(new Decimal(Q).div(exchangeRate).toFixed(2)),
  };
  const formatted = {
    Q: numeral(available.Q).format('0,0.00'),
    $: numeral(available.$).format('0,0.00'),
  };

  await browser.close();

  const endTime = new Date();
  const duration = endTime - startTime;

  const result = {
    accountNumber,
    available,
    formatted,
    duration,
  };

  console.log(JSON.stringify(result, null, 2));
}

main();
