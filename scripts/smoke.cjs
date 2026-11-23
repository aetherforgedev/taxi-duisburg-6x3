const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const sectors = require('../src/sectors.json');

(async () => {
  mkdirSync('.work',{recursive:true});
  const browser = await chromium.launch({
    channel:process.env.TAXI_BROWSER_CHANNEL || 'msedge',
    headless:true, args:['--disable-gpu','--disable-extensions'],
  });
  try {
    const stand=sectors.find(s=>s.id===40).point;
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
      permissions:['geolocation'],geolocation:{latitude:stand.lat,longitude:stand.lon,accuracy:3}});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    await page.goto(process.env.TAXI_TEST_URL || 'http://127.0.0.1:4173/');
    await page.getByRole('heading',{name:'Fahrer anmelden'}).waitFor();
    await page.screenshot({path:'.work/login.png'});
    async function code(sequence) {
      for(const digit of sequence) await page.getByRole('button',{name:digit,exact:true}).click();
      await page.getByRole('button',{name:'Anmelden',exact:true}).click();
    }
    await code('1234');
    await page.getByText('Fahrer-Code nicht gefunden.').waitFor();
    await code('5803');
    await page.getByRole('heading',{name:'Guten Tag, Justin!'}).waitFor();
    await page.getByRole('button',{name:'Fahrtbetrieb starten',exact:true}).last().click();
    await page.getByRole('heading',{name:'Fahrtbetrieb'}).waitFor();
    await page.getByRole('button',{name:/Schlenk.*im Radius/}).click();
    await page.getByRole('button',{name:'Einbuchen',exact:true}).click();
    await page.getByRole('heading',{name:'Im Sektor',exact:true}).waitFor();
    await page.reload();
    await page.getByRole('heading',{name:'Im Sektor',exact:true}).waitFor();
    await page.screenshot({path:'.work/operation.png'});
    await page.getByRole('button',{name:'Ausbuchen',exact:true}).click();
    await page.getByRole('button',{name:'Pause starten'}).click();
    await page.getByRole('heading',{name:'Pause',exact:true}).waitFor();
    await page.getByRole('button',{name:'Pause beenden'}).click();

    await page.getByRole('link',{name:'Menü',exact:true}).click();
    await page.locator('summary').getByText('Aufträge',{exact:true}).click();
    await page.getByRole('switch',{name:'Automatische lokale Angebote'}).uncheck();
    await page.getByRole('switch',{name:'Aufträge nach Entfernung filtern'}).uncheck();
    await page.getByRole('link',{name:'Aufträge',exact:true}).click();
    const request=page.getByRole('button',{name:'Testauftrag anfragen'});
    await request.click();
    await page.getByRole('dialog',{name:'Neuer Auftrag'}).waitFor();
    await page.getByRole('button',{name:'Details',exact:true}).click();
    await page.getByText(/Fiktiver Fahrgast. Auftragsnummer/).waitFor();
    await page.getByRole('button',{name:'Annehmen',exact:true}).click();
    await page.getByRole('button',{name:'Am Kunden',exact:true}).click();
    await page.getByRole('button',{name:'Fahrgast aufgenommen'}).click();
    await page.getByRole('button',{name:'Taxameter öffnen'}).click();
    await page.getByRole('button',{name:'START',exact:true}).click();
    await page.locator('.fare').getByText(/4,90/).waitFor();
    await page.reload();
    await page.getByText(/Messlücke erkannt/).waitFor();
    await page.getByRole('link',{name:'Aufträge',exact:true}).click();
    await page.getByRole('button',{name:'Fahrt abschließen'}).click();
    await page.getByText('Taxameter zuerst auf KASSE stellen.').waitFor();
    await page.getByRole('button',{name:'Taxameter öffnen'}).click();
    await page.getByRole('button',{name:'KASSE',exact:true}).click();
    await page.getByRole('link',{name:'Aufträge',exact:true}).click();
    await page.getByRole('button',{name:'Fahrt abschließen'}).click();
    await page.getByText('Fahrt abgeschlossen.',{exact:true}).waitFor();

    await request.click();
    await page.getByRole('dialog',{name:'Neuer Auftrag'}).waitFor();
    await page.getByText('Auftrag nicht angenommen.',{exact:true}).waitFor({timeout:11000});
    await request.click();
    await page.getByRole('button',{name:'Annehmen',exact:true}).click();
    await page.getByRole('button',{name:'Auftrag stornieren',exact:true}).click();
    await page.getByRole('combobox').selectOption('Kunde nicht angetroffen');
    await page.getByRole('button',{name:'Stornierung bestätigen'}).click();
    await page.getByText('Auftrag storniert.',{exact:true}).waitFor();

    await page.getByRole('link',{name:'Menü',exact:true}).click();
    await page.getByLabel('Zeit bis zur Fahreranzeige').selectOption('30');
    await page.clock.install();
    await page.getByRole('link',{name:'Start',exact:true}).click();
    await page.clock.fastForward(31000);
    await page.getByText('Sie fahren mit',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Zur App zurück',exact:true}).last().click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('heading',{name:'Fahrtbetrieb'}).waitFor();
    await page.getByRole('link',{name:'Aufträge',exact:true}).click();
    await page.getByText('Abgeschlossen',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log('PASS: 390×844 · Login, Begrüßung, GPS-Einbuchung, Neustart, Pause, Annahme, Meter, Kasse, Abschluss, Timeout, Storno, Idle, Offline');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
