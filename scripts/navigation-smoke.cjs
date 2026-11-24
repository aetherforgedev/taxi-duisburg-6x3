const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:process.env.TAXI_BROWSER_CHANNEL||'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
   permissions:['geolocation'],geolocation:{latitude:51.40143,longitude:6.76345,accuracy:3}});
  const page=await context.newPage();
  const errors=[];
  let calls=0;
  let start,corner,after;
  page.on('pageerror',error=>errors.push(error.message));
  // All route and GPS fixtures below are confined to this browser test.
  await page.route('https://routing.openstreetmap.de/**',async request=>{
   calls++;
   const coords=new URL(request.request().url()).pathname.split('/').at(-1).split(';').map(x=>x.split(',').map(Number));
   start=coords[0];
   const end=coords[1];
   corner=[start[0],start[1]+0.002];
   after=[start[0]+0.004,start[1]+0.002];
   const steps=[
    {name:'Teststraße',distance:222,duration:40,maneuver:{type:'depart',location:start},geometry:{coordinates:[start,corner]},intersections:[{lanes:[{valid:false,indications:['left']},{valid:true,indications:['right']}]}]},
    {name:'Zielstraße',distance:278,duration:50,maneuver:{type:'turn',modifier:'right',location:corner},geometry:{coordinates:[corner,after]}},
    {name:'Ankunftstraße',distance:500,duration:100,maneuver:{type:'turn',modifier:'right',location:after},geometry:{coordinates:[after,end]}},
    {name:'',distance:0,duration:0,maneuver:{type:'arrive',location:end},geometry:{coordinates:[end,end]}},
   ];
   await request.fulfill({json:{routes:[{distance:1000,duration:190,geometry:{coordinates:[start,corner,after,end]},legs:[{steps}]}]}});
  });
  await page.goto(process.env.TAXI_TEST_URL||'http://127.0.0.1:4173/');
  for(const digit of '5803')await page.getByRole('button',{name:digit,exact:true}).click();
  await page.getByRole('button',{name:'Anmelden',exact:true}).click();
  await page.getByRole('button',{name:'Fahrtbetrieb starten',exact:true}).last().click();
  await page.getByRole('link',{name:'Menü',exact:true}).click();
  await page.locator('summary').getByText('Aufträge',{exact:true}).click();
  await page.getByRole('switch',{name:'Automatische lokale Angebote'}).uncheck();
  await page.getByLabel('Zeit zwischen Auftragsangeboten').selectOption('10-20');
  await page.getByRole('switch',{name:'Aufträge nach Entfernung filtern'}).uncheck();
  await page.reload();
  await page.locator('summary').getByText('Aufträge',{exact:true}).click();
  assert.equal(await page.getByLabel('Zeit zwischen Auftragsangeboten').inputValue(),'10-20');
  await page.getByRole('link',{name:'Aufträge',exact:true}).click();
  await page.getByRole('button',{name:'Testauftrag anfragen'}).click();
  await page.getByRole('button',{name:'Annehmen',exact:true}).click();
  const navigate=page.getByRole('button',{name:'Navigieren',exact:true});
  await navigate.waitFor();
  const box=await navigate.boundingBox();
  assert(box.y+box.height<600,'Navigation action must be visible without scrolling');
  fs.mkdirSync('.work',{recursive:true});
  await page.screenshot({path:'.work/accepted.png'});
  await navigate.click();
  const nav=page.getByRole('region',{name:'Live-Navigation'});
  await nav.waitFor();
  await nav.getByRole('button',{name:'Online-Routing freigeben'}).click();
  await nav.getByRole('heading',{name:'Zielstraße',exact:true}).waitFor();
  assert.equal(calls,1);
  assert.equal(await nav.evaluate(el=>el.scrollHeight<=el.clientHeight),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  await page.screenshot({path:'.work/navigation.png'});
  const before=await page.locator('.turn-distance').innerText();
  await context.setGeolocation({latitude:start[1]+0.001,longitude:start[0],accuracy:3});
  await page.waitForFunction(text=>document.querySelector('.turn-distance')?.textContent!==text,before);
  const afterMove=await page.locator('.turn-distance').innerText();
  assert.notEqual(afterMove,before);
  await context.setGeolocation({latitude:corner[1],longitude:corner[0]+0.0005,accuracy:3});
  await nav.getByRole('heading',{name:'Ankunftstraße',exact:true}).waitFor();
  await nav.getByRole('button',{name:'Abbiegeliste öffnen'}).click();
  await page.getByRole('heading',{name:'Abbiegehinweise'}).waitFor();
  await page.getByRole('button',{name:'Abbiegeliste schließen'}).click();
  await page.waitForTimeout(15500);
  for(let i=0;i<3;i++){
    await context.setGeolocation({latitude:start[1]+0.03+i*0.0001,longitude:start[0]+0.05,accuracy:3});
    await page.waitForTimeout(1200);
  }
  for(let i=0;i<20&&calls<2;i++)await page.waitForTimeout(200);
  await page.waitForTimeout(500);
  assert(calls>=2,'GPS route deviation should recalculate the route');
  await nav.getByRole('button',{name:'Zum Fahrtziel'}).click();
  await page.waitForFunction(()=>document.querySelector('.navigation-target')?.textContent?.startsWith('Fahrtziel'));
  await nav.getByRole('button',{name:'Navigation schließen'}).click();
  await page.getByRole('button',{name:'Am Kunden',exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: accepted action visible; interval persisted; full-screen live navigation; GPS progress; maneuver advance; lane data; list; exit; no overflow');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
