import { z } from 'zod';
import sectorData from './sectors.json';
import pickupData from './pickups.json';
import extra from './verified.json';

export const profile = {
  code: '5803', name: 'Justin Danes', role: 'Fahrer | Aufsichtsperson (Taxikontrolle)',
  center: 'Taxi-Duisburg 6x3', company: 'Justin Danes Taxiunternehmen GmbH',
};
export const selectDriver = (code: string) => code === profile.code ? profile : null;
const coords = z.object({lat:z.number().min(-90).max(90), lon:z.number().min(-180).max(180)});
const place = coords.extend({source:z.string().url()});
const gps = coords.extend({accuracy:z.number().nonnegative(), at:z.number(), heading:z.number().nullable(), speed:z.number().nullable()});
export type Point = z.infer<typeof coords>;
export type Place = z.infer<typeof place>;
export type Fix = z.infer<typeof gps>;
export type Sector = { id:number; district:string; name:string; address:string; radius:number; active:boolean; point:Place|null; review:string|null };
export type Pickup = { id:string; name:string; address:string; point:Place|null; note?:string };
const verified: {sectors:Record<string,Place>, pickups:Record<string,Place & {note?:string}>} = extra;
export const sectors: Sector[] = (sectorData as Sector[]).map(sector => {
  const point = verified.sectors[sector.id] ?? sector.point;
  return point ? {...sector, point, active:true, review:null} : sector;
});
export const pickups: Pickup[] = (pickupData as Pickup[]).map(pickup => ({
  ...pickup, point:verified.pickups[pickup.id] ?? pickup.point,
  note:verified.pickups[pickup.id]?.note ?? pickup.note,
}));

const step = coords.extend({label:z.string(), distance:z.number().nonnegative()});
const route = z.object({distance:z.number().nonnegative(), duration:z.number().nonnegative(), points:z.array(coords).min(2), steps:z.array(step)});
export type Route = z.infer<typeof route>;
const stop = z.object({label:z.string(), point:place});
const orderStatus = z.enum(['angeboten','anfahrt','kunde','besetzt','abgelehnt','storniert','abgeschlossen']);
const order = z.object({
  id:z.string(), customer:z.string(), pickup:stop, destination:stop.nullable(), kind:z.string(),
  createdAt:z.number(), offeredAt:z.number(), status:orderStatus, comment:z.string(),
  initialRoute:route.nullable(), endedAt:z.number().optional(), reason:z.string().optional(),
  metres:z.number().nonnegative().optional(), cents:z.number().nonnegative().optional(),
});
export type Order = z.infer<typeof order>;
export const orderLabels: Record<Order['status'], string> = {
  angeboten:'Auftrag angeboten', anfahrt:'Anfahrt', kunde:'Am Kunden', besetzt:'Besetzt',
  abgelehnt:'Abgelehnt', storniert:'Storniert', abgeschlossen:'Abgeschlossen',
};
export const transitions: Record<Order['status'], Order['status'][]> = {
  angeboten:['anfahrt','abgelehnt'], anfahrt:['kunde','storniert'], kunde:['besetzt','storniert'],
  besetzt:['abgeschlossen','storniert'], abgelehnt:[], storniert:[], abgeschlossen:[],
};
export const deadline = (job: Order) => job.offeredAt + 8000;
export function changeOrder(job: Order, next: Order['status'], now:number, details:Partial<Pick<Order,'reason'|'metres'|'cents'>> = {}): Order | null {
  if (!transitions[job.status].includes(next) || (next === 'anfahrt' && now >= deadline(job))) return null;
  return {...job, ...details, status:next, endedAt:transitions[next].length ? undefined : now};
}
export const passesFilter = (trip:Route|null, maxMinutes:number) => !!trip && trip.duration >= 120 && trip.duration <= maxMinutes * 60;
export const idleAllowed = (active:boolean, navigation:boolean, overlay:boolean) => active && !navigation && !overlay;

const tariff = z.object({
  base:z.number().int().nonnegative().max(100000), day:z.number().min(1).max(1000),
  night:z.number().min(1).max(1000), wait:z.number().min(1).max(3600),
  increment:z.number().int().min(1).max(10000), animal:z.number().int().nonnegative().max(100000),
});
const meterSchema = z.object({
  status:z.enum(['frei','besetzt','kasse']), start:z.number(), end:z.number(), wait:z.number().nonnegative(),
  metres:z.number().nonnegative(), units:z.number().nonnegative(), extra:z.number().nonnegative(), tariff,
  mode:z.enum(['auto','tag','nacht']), vehicle:z.enum(['standard','kombi','gross']),
  last:gps.nullable(), gap:z.boolean(), orderId:z.string().nullable(),
});
export type Meter = z.infer<typeof meterSchema>;
export type Tariff = z.infer<typeof tariff>;
export const sourceTariff = 'https://www.duisburg.de/rathaus/rathausundpolitik/ortsrecht/S32.08-Taxen-Tarifverordnung-ab-01.09.2025.pdf';
export const cityTariff: Tariff = {base:490, day:40, night:37.04, wait:10.91, increment:10, animal:200};
export const clearMeter = ():Meter => ({status:'frei',start:0,end:0,wait:0,metres:0,units:0,extra:0,tariff:cityTariff,mode:'auto',vehicle:'standard',last:null,gap:false,orderId:null});
const settings = z.object({
  idle:z.boolean(), idleSec:z.number().int().min(30).max(600), theme:z.enum(['dunkel','hell','system']),
  radius:z.number().min(30).max(500), autoOut:z.boolean(), auto:z.boolean(), interval:z.number().min(30).max(900),
  filter:z.boolean(), maxMin:z.number().min(2).max(20), orderSound:z.boolean(), meterSound:z.boolean(),
  navigation:z.enum(['intern','google']), routing:z.boolean(), routingUrl:z.string().max(300),
  tariff, tariffMode:meterSchema.shape.mode, vehicle:meterSchema.shape.vehicle,
});
export const defaults: z.infer<typeof settings> = {
  idle:true,idleSec:60,theme:'dunkel',radius:150,autoOut:true,auto:true,interval:90,filter:true,maxMin:5,
  orderSound:true,meterSound:true,navigation:'intern',routing:false,routingUrl:'',
  tariff:cityTariff,tariffMode:'auto',vehicle:'standard',
};
export const snapshotSchema = z.object({
  version:z.literal(1), session:z.boolean(), availability:z.enum(['frei','pause','abwesend']), pauseAt:z.number(),
  sector:z.number().int().nullable(), active:order.nullable(), history:z.array(order),
  meter:meterSchema, rides:z.array(meterSchema), settings, tutorial:z.number().int().min(0).max(10),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Settings = Snapshot['settings'];
export const initial = ():Snapshot => ({
  version:1, session:false, availability:'frei', pauseAt:0, sector:null, active:null,
  history:[], meter:clearMeter(), rides:[], settings:defaults, tutorial:0,
});
export function restore(state:Snapshot, now:number):Snapshot {
  const job = state.active;
  if (job?.status === 'angeboten' && now >= deadline(job)) {
    state = {...state,active:null,history:[changeOrder(job,'abgelehnt',now,{reason:'Angebot abgelaufen'})!, ...state.history]};
  }
  if (state.meter.status === 'besetzt') state = {...state,meter:{...state.meter,last:null,gap:true}};
  return state;
}
export function available(state:Snapshot) {
  return state.session && state.availability === 'frei' && !state.active && state.meter.status === 'frei';
}
export function driverStatus(state:Snapshot) {
  if (state.active) return orderLabels[state.active.status];
  if (state.meter.status !== 'frei') return state.meter.status === 'kasse' ? 'Kasse' : 'Besetzt';
  if (state.availability === 'pause') return 'Pause';
  if (state.availability === 'abwesend') return 'Nicht verfügbar';
  return state.sector === null ? 'Frei' : 'Im Sektor';
}
export function distance(a:Point,b:Point) {
  const rad = Math.PI/180;
  const h = Math.sin((b.lat-a.lat)*rad/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((b.lon-a.lon)*rad/2)**2;
  return 2 * 6371000 * Math.asin(Math.sqrt(Math.min(1,h)));
}
export function nearRoute(fix:Point, points:Point[], limit=60) {
  const scale = Math.cos(fix.lat * Math.PI/180) * 111195;
  return points.slice(1).some((end,i)=>{
    const start=points[i];
    const x=(start.lon-fix.lon)*scale, y=(start.lat-fix.lat)*111195;
    const dx=(end.lon-start.lon)*scale, dy=(end.lat-start.lat)*111195;
    const length=dx*dx+dy*dy;
    const fraction=length ? Math.max(0,Math.min(1,-(x*dx+y*dy)/length)) : 0;
    return Math.hypot(x+fraction*dx,y+fraction*dy)<=limit;
  });
}
export const usableFix = (fix:Fix|null, now=Date.now()):fix is Fix => !!fix && fix.accuracy <= 50 && now-fix.at <= 20000 && fix.at <= now+2000;
export const canBook = (fix:Fix|null, point:Point|null, radius:number,now=Date.now()) =>
  !!point && usableFix(fix,now) && distance(fix,point)+fix.accuracy <= radius;
export const beyond = (fix:Fix|null, point:Point|null, radius:number,now=Date.now()) =>
  !!point && usableFix(fix,now) && distance(fix,point)-fix.accuracy > radius+30;

const berlin = new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',hourCycle:'h23',weekday:'short'});
function easter(year:number) {
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const x=h+l-7*m+114;
  return Date.UTC(year,Math.floor(x/31)-1,x%31+1);
}
export function automaticTariff(at:number) {
  const p = Object.fromEntries(berlin.formatToParts(at).map(({type,value})=>[type,value]));
  const month=Number(p.month), day=Number(p.day), hour=Number(p.hour);
  const offset=(Date.UTC(Number(p.year),month-1,day)-easter(Number(p.year)))/86400000;
  const holiday=['1-1','5-1','10-3','11-1','12-25','12-26'].includes(month+'-'+day) || [-2,1,39,50,60].includes(offset);
  return holiday || p.weekday === 'So.' || p.weekday === 'So' || hour<6 || hour>=22 ? 'nacht' : 'tag';
}
export const activeTariff = (m:Meter, now:number) => m.mode === 'auto' ? automaticTariff(now) : m.mode;
export function cents(m:Meter) {
  if (m.status === 'frei') return 0;
  const vehicleCharge = {standard:0,kombi:200,gross:600}[m.vehicle];
  return m.tariff.base + vehicleCharge + Math.ceil(Math.max(0,m.units-1)-1e-9)*m.tariff.increment + m.extra;
}
export function measure(m:Meter, fix:Fix):Meter {
  if (m.status !== 'besetzt' || fix.at < m.start || fix.accuracy > 35) return m;
  if (!m.last) return {...m,last:fix};
  const elapsed = (fix.at-m.last.at)/1000;
  if (elapsed <= 0) return m;
  if (elapsed > 15) return {...m,last:fix,gap:true};
  const delta = distance(m.last, fix);
  if (delta > 47 * elapsed + fix.accuracy + m.last.accuracy) return {...m,gap:true};
  const moving = fix.speed !== null ? fix.speed > 0.7 : delta > Math.max(4,(m.last.accuracy+fix.accuracy)*0.45);
  const metres = moving ? delta : 0;
  const tariffUnit = activeTariff(m,fix.at) === 'tag' ? m.tariff.day : m.tariff.night;
  const distanceUnits = metres/tariffUnit;
  const timeUnits = elapsed/m.tariff.wait;
  const timed = timeUnits > distanceUnits;
  return {...m,last:fix,metres:m.metres+metres,wait:m.wait+(timed ? elapsed : 0),units:m.units+Math.max(timeUnits,distanceUnits)};
}
export const euro = (amount:number) => new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(amount/100);
export const metresLabel = (n:number) => n < 1000 ? Math.round(n)+' m' : (n/1000).toLocaleString('de-DE',{maximumFractionDigits:1})+' km';
export function duration(ms:number) {
  const seconds = Math.max(0, Math.floor(ms/1000));
  return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
}
