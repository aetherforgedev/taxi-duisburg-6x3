import { distance, passesFilter, pickups, profile, sectors, snapshotSchema, type Fix, type Order, type Point, type Route, type Snapshot, type Settings } from './domain';

const DATABASE = 'taxi-duisburg';
export async function openStorage(factory = indexedDB) {
  const db = await new Promise<IDBDatabase>((resolve,reject)=>{
    const request = factory.open(DATABASE,1);
    request.onupgradeneeded = () => request.result.createObjectStore('app');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Andere App-Ansicht schließen.'));
  });
  return {
    async saveCatalog() {
      return new Promise<void>((resolve,reject)=>{
        const tx = db.transaction('app','readwrite');
        tx.objectStore('app').put({profile,sectors,pickups},'catalog');
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
    },
    async load():Promise<Snapshot|null> {
      return new Promise((resolve,reject)=>{
        const request = db.transaction('app').objectStore('app').get('state');
        request.onsuccess = () => {
          const result = snapshotSchema.safeParse(request.result);
          if (result.success) resolve(result.data);
          else if (request.result === undefined) resolve(null);
          else reject(new Error('Gespeicherte Daten konnten nicht gelesen werden.'));
        };
        request.onerror = () => reject(request.error);
      });
    },
    async save(state:Snapshot) {
      return new Promise<void>((resolve,reject)=>{
        const tx = db.transaction('app','readwrite');
        tx.objectStore('app').put(state,'state');
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
        tx.onerror = () => reject(tx.error);
      });
    },
    close: () => db.close(),
  };
}

export type RoutingAdapter = (start:Point, end:Point) => Promise<Route>;
export const demoRouting = 'https://routing.openstreetmap.de/routed-car/route/v1/driving';
type OSRMStep = {name:string; distance:number; maneuver:{ type:string; modifier?:string; location:[number,number]}};
type OSRMRoute = {distance:number; duration:number; geometry:{coordinates:[number,number][]}; legs:{steps:OSRMStep[]}[]};
const directions:Record<string,string> = {
  left:'links', right:'rechts', 'slight left':'leicht links', 'slight right':'leicht rechts',
  'sharp left':'scharf links', 'sharp right':'scharf rechts', straight:'geradeaus', uturn:'wenden',
};
function instruction(step:OSRMStep) {
  const {type,modifier} = step.maneuver;
  const turn = modifier ? directions[modifier] : undefined;
  const verb = ({
    depart:'Losfahren', arrive:'Ziel erreicht', roundabout:'In den Kreisverkehr einfahren',
    rotary:'In den Kreisverkehr einfahren', 'exit rotary':'Kreisverkehr verlassen',
    'exit roundabout':'Kreisverkehr verlassen', turn:turn === 'wenden' ? 'Wenden' : turn ? 'Abbiegen: '+turn : 'Abbiegen',
    merge:'Einfädeln', fork:turn ? 'An der Gabelung '+turn+' halten' : 'Der Gabelung folgen',
    'off ramp':'Ausfahrt nehmen', 'on ramp':'Auffahrt nehmen',
  } as Record<string,string>)[type] ?? (turn ? 'Weiter: '+turn : 'Straßenverlauf folgen');
  return verb + (step.name && type !== 'arrive' ? ' · '+step.name : '');
}
let lastRouting = 0;
let requests = Promise.resolve();
const cached = new Map<string,{trip:Route,at:number}>();
export function osrm(endpoint = demoRouting):RoutingAdapter {
  return (start,end) => {
    const base = new URL(endpoint);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
      return Promise.reject(new Error('Eine gültige HTTPS-Adresse für OSRM eintragen.'));
    }
    const key = base.href.replace(/\/$/,'')+'/'+[start,end].map(p=>p.lon.toFixed(5)+','+p.lat.toFixed(5)).join(';');
    const previous = cached.get(key);
    if (previous && Date.now()-previous.at < 60000) return Promise.resolve(previous.trip);
    const next = requests.then(async ()=>{
      await new Promise(resolve => setTimeout(resolve,Math.max(0,1250-(Date.now()-lastRouting))));
      lastRouting = Date.now();
      const response = await fetch(key+'?overview=full&geometries=geojson&steps=true',{signal:AbortSignal.timeout(9000)});
      if (!response.ok) throw new Error('Routingdienst antwortet nicht.');
      const payload:{routes?:OSRMRoute[]} = await response.json();
      const result = payload.routes?.[0];
      if (!result || result.geometry.coordinates.length<2) throw new Error('Keine Straßenroute verfügbar.');
      const points = result.geometry.coordinates.map(([lon,lat])=>({lat,lon}));
      if (distance(start,points[0])>150 || distance(end,points.at(-1)!)>150) throw new Error('Keine nahegelegene befahrbare Straße gefunden.');
      const trip:Route = {
        distance:result.distance, duration:result.duration, points,
        steps:result.legs.flatMap(leg=>leg.steps.map(step=>{
          const [lon,lat] = step.maneuver.location;
          return {lat,lon,distance:step.distance,label:instruction(step)};
        })),
      };
      if (cached.size >= 60) cached.delete(cached.keys().next().value!);
      cached.set(key,{trip,at:Date.now()});
      return trip;
    });
    requests = next.then(()=>undefined,()=>undefined);
    return next;
  };
}

const german = [
  'Frau Helga Schneider','Frau Ingrid Hoffmann','Herr Wolfgang Müller','Frau Renate Krüger','Herr Dieter Schulz',
  'Frau Brigitte Weber','Herr Manfred Becker','Frau Ursula Neumann','Frau Laura Fischer','Herr Lukas Richter',
  'Frau Sophie Wagner','Herr Tim Hoffmann','Frau Lena Becker','Herr Jonas Weber','Herr Klaus Zimmermann',
  'Frau Monika Braun','Herr Jürgen König','Frau Erika Hartmann','Frau Sabine Vogel','Herr Peter Keller',
  'Frau Hannah Franke','Herr Felix Krause','Frau Anna Werner','Herr Leon Sommer','Frau Johanna Köhler',
  'Frau Nina Scholz','Herr Benjamin Lange','Herr Matthias Wolf','Frau Petra Arnold','Herr Sven Schmitt',
  'Frau Maria Bauer','Herr Daniel Günther','Frau Charlotte Brandt','Herr Thomas Schubert','Frau Kerstin Hahn',
];
const international = [
  'Frau Elif Yılmaz','Herr Mehmet Kaya','Frau Aylin Demir','Herr Ahmed Hassan','Frau Zeynep Arslan',
  'Herr Omar Haddad','Frau Sofia Rossi','Herr Piotr Kowalski','Frau Amira Saleh','Herr Miguel Santos',
  'Frau Katarzyna Nowak','Herr Cem Aydın','Frau Samira Rahimi','Herr Luca Marino','Frau Iryna Melnyk',
];
const random = <T,>(items:T[]) => items[Math.floor(Math.random()*items.length)];
let searchOffset = 0;
type OrderResult = {job:Order|null; message:string};
export type OrderProvider = (config:Settings, fix:Fix|null, recent:Order[], routing:RoutingAdapter|null) => Promise<OrderResult>;
export const localOrders:OrderProvider = async (config,fix,recent,routing) => {
  const catalog = pickups.flatMap(p => p.point ? [{...p,point:p.point}] : []);
  if (!catalog.length) return {job:null,message:'Der Katalog enthält noch keine geprüften Abholkoordinaten.'};
  if (config.filter && (!fix || !routing)) return {job:null,message:'Der Anfahrtsfilter benötigt ein genaues GPS-Signal und freigegebenes Routing.'};
  const fresh = catalog.filter(p=>!recent.slice(0,Math.min(4,catalog.length-1)).some(j=>j.pickup.point.source===p.point.source));
  const candidates = [...fresh];
  if (fix && config.filter) candidates.sort((a,b)=>Math.abs(distance(fix,a.point)-1100)-Math.abs(distance(fix,b.point)-1100));
  else for (let i=candidates.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    [candidates[i],candidates[j]]=[candidates[j],candidates[i]];
  }
  const offset = config.filter ? searchOffset % candidates.length : 0;
  const batch = [...candidates.slice(offset),...candidates.slice(0,offset)].slice(0,config.filter ? 3 : 1);
  if (config.filter) searchOffset = (offset+batch.length)%candidates.length;
  for (const candidate of batch) {
    let trip:Route|null = null;
    if (routing && fix) {
      try {trip = await routing(fix,candidate.point);}
      catch {if (config.filter) continue;}
    }
    if (config.filter && !passesFilter(trip,config.maxMin)) continue;
    const pool = (Math.random()<0.8 ? german : international).filter(name=>!recent.slice(0,10).some(j=>j.customer===name));
    const destination = random(sectors.filter(s=>s.point && distance(candidate.point,s.point)>500));
    const now = Date.now();
    return {message:'',job:{
      id:crypto.randomUUID(), customer:random(pool), createdAt:now, offeredAt:now,
      status:'angeboten', kind:'Lokaler Testauftrag', comment:'Fiktiver Fahrgast',
      pickup:{label:candidate.name===candidate.address ? candidate.address : candidate.name+' · '+candidate.address,point:candidate.point},
      destination:destination?.point ? {label:destination.name+' · '+destination.address,point:destination.point} : null,
      initialRoute:trip,
    }};
  }
  return {job:null,message:'Für die geprüften Abholorte wurde keine passende Straßenroute gefunden.'};
};

let audio:AudioContext|undefined;
export function unlockAudio() {
  const Ctor = window.AudioContext ?? (window as Window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
  if (!Ctor) return;
  try {audio ??= new Ctor(); if(audio.state==='suspended') void audio.resume().catch(()=>{});}
  catch { /* Audio availability depends on browser settings. */ }
}
export function beep(sequence:number[]) {
  if (audio?.state !== 'running') return;
  const ctx = audio;
  sequence.forEach((frequency,i)=>{
    const start = ctx.currentTime+i*0.115;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type='triangle';
    oscillator.frequency.value=frequency;
    gain.gain.setValueAtTime(0.0001,start);
    gain.gain.exponentialRampToValueAtTime(0.08,start+0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001,start+0.09);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start+0.10);
  });
}
export const googleMaps = (point:Point) => 'https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination='+encodeURIComponent(point.lat+','+point.lon);
