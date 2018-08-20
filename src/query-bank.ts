import Decimal from 'decimal.js';
import numeral from 'numeral';
import puppeteer, { Browser, Frame } from 'puppeteer';

type currencySymbol = 'Q' | '$';

type Amounts = {
  raw: { [key in currencySymbol]?: number };
  formatted: { [key in currencySymbol]?: string };
};

type Result = {
  accounts: Array<{
    number: string;
    currency: string;
    rateUsed: string;
    available: Amounts;
  }>;
  total: Amounts;
  exchangeRates: {
    buy: number;
    sell: number;
  };
  duration: number;
};

let browser: Browser | null = null;

export default function queryBank(): Promise<Result> {
  return new Promise(async (mainResolve, mainReject) => {
    try {
      if (!browser) {
        browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      }

      const startTime = new Date();

      const page = await browser!.newPage();
      page.setUserAgent(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.87 Safari/537.36'
      );

      const killTimer = setTimeout(async () => {
        await page.screenshot({ path: 'screenshot.png' });
        mainReject(new Error('Took too long.'));
      }, 40000);

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
            resolve(found);
          } else {
            page.on('framenavigated', listener);
          }
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

      const currencies: Array<{
        raw: 'Q.' | 'US$';
        clean: currencySymbol;
        rate: keyof typeof exchangeRates;
        converter: (n: number, rate: number) => number;
      }> = [
        {
          raw: 'Q.',
          clean: 'Q',
          rate: 'sell',
          converter: (n, r) =>
            new Decimal(n)
              .times(r)
              .toDecimalPlaces(2)
              .toNumber(),
        },
        {
          raw: 'US$',
          clean: '$',
          rate: 'buy',
          converter: (n, r) =>
            new Decimal(n)
              .div(r)
              .toDecimalPlaces(2)
              .toNumber(),
        },
      ];

      for (const tr of accountTRs) {
        const currencyRaw: string = await mainFrame.evaluate(
          (td: HTMLTableCellElement) => td.textContent,
          await tr.$('td:nth-of-type(1)')
        );
        const currency = currencies.find(c => c.raw === currencyRaw);

        if (currency) {
          const number: string = await mainFrame.evaluate(
            (a: HTMLAnchorElement) => a.textContent!.trim(),
            await tr.$('td:nth-of-type(2) > a')
          );
          const availableRaw = await mainFrame.evaluate(
            (td: HTMLTableCellElement) => td.textContent!.trim(),
            await tr.$('td:nth-of-type(4)')
          );

          const tempAvailable: Amounts = {
            raw: {},
            formatted: {},
          };

          const sortedCurrencies = currencies.slice().sort((a, b) => {
            return a === currency ? -1 : 1;
          });

          let base: number | null = null;
          for (const c of sortedCurrencies) {
            let result;
            if (c === currency) {
              base = parseFloat(availableRaw.replace(/,/g, ''));
              result = base;
            } else {
              if (base != null) {
                result = c.converter(base, exchangeRates[currency.rate]);
              } else {
                throw new Error('base unknown');
              }
            }
            tempAvailable.raw[c.clean] = result;
            tempAvailable.formatted[c.clean] = numeral(result).format('0,0.00');
          }

          const available: Amounts = {
            raw: {},
            formatted: {},
          };

          for (const c of currencies) {
            available.raw[c.clean] = tempAvailable.raw[c.clean];
            available.formatted[c.clean] = tempAvailable.formatted[c.clean];
          }

          accounts.push({
            number,
            currency: currency.clean,
            rateUsed: currency.rate,
            available,
          });
        }
      }

      await page.close();

      clearTimeout(killTimer);

      const total: Amounts = { raw: {}, formatted: {} };
      for (const currency of currencies) {
        const sum = accounts
          .reduce(
            (previous, current) => previous.add(current.available.raw[currency.clean]!),
            new Decimal(0)
          )
          .toNumber();
        total.raw[currency.clean] = sum;
        total.formatted[currency.clean] = numeral(sum).format('0,0.00');
      }

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      const result = {
        accounts,
        total,
        exchangeRates,
        duration,
      };

      mainResolve(result);
    } catch (error) {
      mainReject(error);
    }
  });
}
