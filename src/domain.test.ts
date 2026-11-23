import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { automaticTariff, available, beyond, canBook, cents, changeOrder, clearMeter, deadline, defaults, distance, driverStatus, idleAllowed, initial, measure, passesFilter, pickups, restore, sectors, selectDriver, type Fix, type Order, type Route } from './domain';
import { localOrders, openStorage } from './services';

const time = Date.parse('2026-11-23T11:00:00Z');
const fix:Fix = {lat:51.4,lon:6.76,accuracy:5,at:time,heading:null,speed:null};
const point = {lat:fix.lat,lon:fix.lon,source:'https://www.openstreetmap.org/node/1'};
const offer:Order = {id:'one',customer:'Frau Helga Schneider',pickup:{label:'Abholung',point},destination:null,kind:'Lokaler Testauftrag',
  offeredAt:time,createdAt:time,status:'angeboten',comment:'Test',initialRoute:null};
const route:Route = {duration:180,distance:1200,points:[fix,fix],steps:[]};

describe('Fahrtbetrieb',()=>{
  it('selects only the supplied profile and exposes its greeting name',()=>{
    expect(selectDriver('5803')?.name).toBe('Justin Danes');
    expect(selectDriver('5804')).toBeNull();
  });
  it('allows idle over a running trip while preserving navigation and dialogs',()=>{
    expect(idleAllowed(true,false,false)).toBe(true);
    expect(idleAllowed(true,true,false)).toBe(false);
    expect(idleAllowed(true,false,true)).toBe(false);
  });
  it('measures distance and checks radius, accuracy and freshness',()=>{
    const north = {...point,lat:point.lat+0.001};
    expect(distance(point,north)).toBeCloseTo(111.19,1);
    expect(canBook(fix,north,150,time)).toBe(true);
    expect(canBook({...fix,accuracy:55},north,150,time)).toBe(false);
    expect(canBook(fix,north,150,time+25000)).toBe(false);
    expect(canBook({...fix,accuracy:45},north,150,time)).toBe(false);
    expect(beyond(fix,north,80,time)).toBe(false);
    expect(beyond(fix,north,70,time)).toBe(true);
  });
  it('records a booked and released sector, pause and active order distinctly',()=>{
    const state={...initial(),session:true,sector:40};
    expect(driverStatus(state)).toBe('Im Sektor');
    expect(driverStatus({...state,sector:null})).toBe('Frei');
    expect(available({...state,availability:'pause'})).toBe(false);
    expect(available({...state,active:offer})).toBe(false);
  });
  it('imports all original catalog rows and leaves unspecified stands disabled',()=>{
    expect(sectors).toHaveLength(87);
    expect(pickups).toHaveLength(102);
    expect(sectors.find(s=>s.id===40)?.name).toBe('Schlenk');
    expect(sectors.filter(s=>!s.address).every(s=>!s.point&&!s.active)).toBe(true);
  });
});

describe('Lokale Aufträge',()=>{
  it('accepts only the configured route duration and never makes up filtered offers',async()=>{
    expect(passesFilter(route,5)).toBe(true);
    expect(passesFilter({...route,duration:119},5)).toBe(false);
    expect(passesFilter({...route,duration:301},5)).toBe(false);
    expect((await localOrders(defaults,fix,[],async()=>({...route,duration:301}))).job).toBeNull();
    expect((await localOrders(defaults,null,[],null)).job).toBeNull();
    const result=await localOrders(defaults,fix,[],async()=>route);
    expect(result.job?.pickup.point.source).toMatch(/^https:\/\/www\.openstreetmap\.org\//);
    expect(result.job?.initialRoute?.duration).toBe(180);
    expect(result.job?.kind).toBe('Lokaler Testauftrag');
  });
  it('guards assignment transitions and expires a restored eight-second offer',()=>{
    expect(deadline(offer)).toBe(time+8000);
    const accepted=changeOrder(offer,'anfahrt',time+7999)!;
    expect(accepted.status).toBe('anfahrt');
    expect(changeOrder(offer,'anfahrt',time+8000)).toBeNull();
    expect(changeOrder(accepted,'anfahrt',time)).toBeNull();
    expect(changeOrder(accepted,'abgeschlossen',time)).toBeNull();
    expect(changeOrder(accepted,'storniert',time,{reason:'Sonstiges'})?.reason).toBe('Sonstiges');
    const arrived=changeOrder(accepted,'kunde',time)!;
    const occupied=changeOrder(arrived,'besetzt',time)!;
    expect(changeOrder(occupied,'abgeschlossen',time+1,{metres:100,cents:510})).toMatchObject({endedAt:time+1,metres:100,cents:510});
    const restored=restore({...initial(),active:offer},time+8000);
    expect(restored.active).toBeNull();
    expect(restored.history[0]).toMatchObject({status:'abgelehnt',reason:'Angebot abgelaufen'});
  });
});

describe('Taxameter und IndexedDB',()=>{
  it('switches between the Duisburg day and night schedules including NRW holidays',()=>{
    expect(automaticTariff(time)).toBe('tag');
    expect(automaticTariff(Date.parse('2026-11-22T11:00:00Z'))).toBe('nacht');
    expect(automaticTariff(Date.parse('2026-11-23T21:00:00Z'))).toBe('nacht');
    expect(automaticTariff(Date.parse('2026-06-04T10:00:00Z'))).toBe('nacht');
  });
  it('prices distance and waiting in whole increments, rejects duplicate and implausible GPS',()=>{
    expect(cents(clearMeter())).toBe(0);
    const meter=measure({...clearMeter(),status:'besetzt',start:time},fix);
    expect(cents(meter)).toBe(490);
    expect(measure(meter,fix)).toBe(meter);
    const moving=measure(meter,{...fix,lat:fix.lat+0.001,at:time+7000,speed:16});
    expect(moving.metres).toBeCloseTo(111.19,1);
    expect(cents(moving)).toBe(510);
    expect(cents({...moving,status:'kasse',extra:200})).toBe(710);
    const stopped=measure(moving,{...moving.last!,at:time+13000,speed:0});
    expect(stopped.wait).toBe(6);
    expect(measure(stopped,{...fix,lat:52,at:time+14000}).metres).toBe(stopped.metres);
    expect(measure(stopped,{...fix,at:time+33000}).gap).toBe(true);
  });
  it('persists a driver session, active order, settings and fare across reopening without inventing distance',async()=>{
    const factory=new IDBFactory();
    const store=await openStorage(factory);
    const meter=measure({...clearMeter(),status:'besetzt',start:time,metres:99},fix);
    const active=changeOrder(offer,'anfahrt',time)!;
    const state={...initial(),session:true,settings:{...defaults,idleSec:120},sector:40,active,meter};
    await store.save(state);
    store.close();
    const reopened=await openStorage(factory);
    const loaded=await reopened.load();
    expect(loaded).toEqual(state);
    expect(restore(loaded!,time+20000).meter).toMatchObject({metres:99,last:null,gap:true,status:'besetzt'});
    reopened.close();
  });
});
