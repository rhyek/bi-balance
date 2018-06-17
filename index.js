const fetch = require('node-fetch');
const setCookieParser = require('set-cookie-parser');
const FormData = require('form-data');
const { JSDOM } = require('jsdom');
const Decimal = require('decimal.js');
const numeral = require('numeral');
const puppeteer = require('puppeteer');

require('dotenv').config();

let cookieHeaders = null;

// function getCookieString() {
//   const cookieString = Object.entries(cookieHeaders)
//     .map(([key, value]) => `${key}=${value}`)
//     .join("; ");
//   return cookieString;
// }

// async function get(url, customHeaders) {
//   const headers = {
//     Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
//     "Accept-Encoding": "gzip, deflate, br",
//     "Accept-Language": "en-GB,en;q=0.5",
//     Connection: "keep-alive",
//     Host: "www.bienlinea.bi.com.gt",
//     "Upgrade-Insecure-Requests": "1",
//     "User-Agent":
//       "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:60.0) Gecko/20100101 Firefox/60.0",
//     ...customHeaders
//   };
//   if (Object.entries(cookieHeaders).length > 0) {
//     headers.Cookie = getCookieString();
//   }
//   const response = await fetch(url, {
//     redirect: "manual",
//     headers
//   });
//   const combinedCookieHeader = response.headers.get("set-cookie");
//   const splitCookieHeader = setCookieParser.splitCookiesString(
//     combinedCookieHeader
//   );
//   const cookies = setCookieParser(splitCookieHeader);
//   for (const cookie of cookies) {
//     cookieHeaders[cookie.name] = cookie.value;
//   }
//   const text = await response.text();
//   return text;
// }

function sleep(time) {
  return new Promise(resolve => {
    setTimeout(resolve, time);
  });
}

async function main() {
  let tries = 1;
  let result = null;
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  let loginFrame = null;
  while (!loginFrame) {
    await page.goto('https://www.bienlinea.bi.com.gt');
    loginFrame = page.frames().find(frame => frame._name === 'login');
    // await page.screenshot({ path: 'example.png' });
  }
  await (await loginFrame.$('#cnempresa')).type(process.env.CNEMPRESA);
  await (await loginFrame.$('#cusuario')).type(process.env.CUSUARIO);
  await (await loginFrame.$('#ccontra')).type(process.env.CCONTRA);
  const loginPromise = new Promise((resolve, reject) => {
    page.on('requestfinished', request => {
      console.log(request.url());
      if (request.url() === 'https://www.bienlinea.bi.com.gt/app/menu.asp') {
        page.removeAllListeners('requestfinished');
        resolve();
      }
    });
  });
  await (await loginFrame.$('#btnEnviar')).click();
  await loginPromise;

  const tipoCambioFrame = page.frames().find(frame => frame._name === 'tipocambio');
  const ratesTD = await tipoCambioFrame.$('table > tbody > tr > td');
  const ratesTextContextHandle = await ratesTD.getProperty('textContent');
  const ratesText = await ratesTextContextHandle.jsonValue();
  const exchangeRate = parseFloat(ratesText.match(/Venta: (.+)/)[1]);

  // await page.screenshot({ path: 'example.png' });
  const pageCookies = await page.cookies();

  await browser.close();
  // while (tries <= 3) {
  //   try {
  //     let response = null
  //     let html = null
  //     let match = null

  //     cookieHeaders = {
  //       // visid_incap_236483: 'uJ5n9fEgRaWG14sVRHhEBBpiJVsAAAAAQUIPAAAAAACN2cNMQlm9ho9E/Ckh3M0l',
  //       // incap_ses_985_236483: 'XaKNLD/53QThXpopnmyrDRpiJVsAAAAA5L9q3WKYqsR8ZLWQ/HO8bA=='
  //     }

  //     html = await get('https://www.bienlinea.bi.com.gt')

  //     // console.log(html)

  //     let formData = new FormData()
  //     formData.append('NOVIEWSTATE', '/wEPDwUKMTIyMDg1NDMxNA9kFgICAQ9kFgICBw8PZBYCHgdvbmNsaWNrBUtub1Bvc3RCYWNrKCdodHRwczovL3d3dy5iaWVubGluZWEuYmkuY29tLmd0L3VzZXJDb250cm9sV2ViTW9kL2xvZ2luLmFzcHgnKTtkZOGoCr6XvO246SKADblJZmM+bwu2')
  //     formData.append('__VIEWSTATEGENERATOR', '29607F1F')
  //     formData.append('__EVENTVALIDATION', '/wEWBQLZ3bjrBwLn64aODAKq2sLwAwLJgsGpCQLf6OqqDHsNVOIGpKshxQde73Thjd1NucIh')
  //     formData.append('cnempresa', '1687064')
  //     formData.append('cusuario', 'rhyek')
  //     formData.append('ccontra', 'U9Ed5bEu6WQTyRq')
  //     formData.append('btnEnviar', 'Ingresar')
  //     response = await fetch('https://www.bienlinea.bi.com.gt/userControlWebMod/login.aspx', {
  //       body: formData,
  //       method: 'POST',
  //       redirect: 'manual',
  //       headers: {
  //         Cookie: getCookieString(),
  //         Referer: 'https://www.bienlinea.bi.com.gt/login/flogin.aspx'
  //       }
  //     })

  //     await sleep(1000)
  //     const direccionTokenURL = response.headers.get('location')
  //     html = await get(direccionTokenURL, {
  //       Referer: 'https://www.bienlinea.bi.com.gt/login/flogin.aspx'
  //     })

  //     await sleep(200)
  //     match = html.match(/window\.top\.location\.href = '(.+?)';/)
  //     if (!match) {
  //       throw new Error('No ruteador login url')
  //     }
  //     const ruteadorLoginURL = `https://www.bienlinea.bi.com.gt${match[1]}`
  //     await get(ruteadorLoginURL, {
  //       Referer: direccionTokenURL
  //     })

  //     await sleep(200)
  //     html = await get('https://www.bienlinea.bi.com.gt/app/navmenu/tipocambio.asp', {
  //       Referer: 'https://www.bienlinea.bi.com.gt/app/root.asp'
  //     })
  //     const exchangeRate = parseFloat(html.match(/Venta: (.+)/)[1])

  //     await sleep(200)
  //     html = await get('https://www.bienlinea.bi.com.gt/app/navmenu/navmenu.asp', {
  //       Referer: 'https://www.bienlinea.bi.com.gt/app/root.asp'
  //     })

  //     await sleep(200)
  //     const accountsURL = html.match(/makeMenu\('sub','Monetarios','(.+?)','main'\)/)[1]
  //     html = await get(accountsURL, {
  //       Referer: 'https://www.bienlinea.bi.com.gt/app/navmenu/navmenu.asp'
  //     })

  //     const dom = new JSDOM(html)
  //     const accountNumber = dom.window.document.querySelector('table table > tbody > tr:nth-of-type(3) > td:nth-of-type(2) > a').textContent.trim()
  //     const availableRaw = dom.window.document.querySelector('table table > tbody > tr:nth-of-type(3) > td:nth-of-type(4)').textContent.trim()
  //     const Q = parseFloat(availableRaw.replace(/,/g, ''))
  //     const available = {
  //       Q,
  //       $: parseFloat(new Decimal(Q).div(exchangeRate).toFixed(2)),
  //     }
  //     const formatted = {
  //       Q: numeral(available.Q).format('0,0.00'),
  //       $: numeral(available.$).format('0,0.00'),
  //     }
  //     result = {
  //       accountNumber,
  //       available,
  //       formatted
  //     }
  //     break
  //   } catch (error) {
  //     tries += 1
  //     console.error(error)
  //     console.log(cookieHeaders)
  //     console.log('Trying again...')
  //     await sleep(3000)
  //   }
  // }
  console.log(JSON.stringify(result, null, 2));
}

main();
