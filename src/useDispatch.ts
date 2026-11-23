import { useEffect, useRef, useState } from 'react';
import { available, beyond, canBook, cents, changeOrder, clearMeter, deadline, initial, measure, restore, sectors, snapshotSchema, usableFix, type Fix, type Meter, type Order, type Sector, type Settings, type Snapshot } from './domain';
import { beep, demoRouting, localOrders, openStorage, osrm } from './services';

export function useDispatch() {
  const [state,setState] = useState(initial);
  const stateRef = useRef(state);
  const db = useRef<Awaited<ReturnType<typeof openStorage>>|null>(null);
  const [ready,setReady] = useState(false);
  const [problem,setProblem] = useState('');
  const [notice,setNotice] = useState('');
  const [now,setNow] = useState(Date.now);
  const [online,setOnline] = useState(navigator.onLine);
  const [fix,setFix] = useState<Fix|null>(null);
  const [gpsMessage,setGpsMessage] = useState('Standort wird ermittelt');
  const [gpsRetry,setGpsRetry] = useState(0);
  const [visible,setVisible] = useState(!document.hidden);
  const [generating,setGenerating] = useState(false);
  const pending = useRef(false);
  const outside = useRef(0);
  const [simulated,setSimulated] = useState(false);

  function update(next:(previous:Snapshot)=>Snapshot) {
    const previous=stateRef.current;
    const after=next(previous);
    if (after===previous) return;
    stateRef.current=after;
    setState(after);
    void db.current?.save(after).catch(()=>setProblem('Änderungen konnten nicht auf dem Gerät gespeichert werden.'));
  }
  useEffect(()=>{
    let disposed=false;
    void openStorage().then(async storage=>{
      if (disposed) {storage.close();return;}
      db.current=storage;
      const saved=await storage.load();
      await storage.saveCatalog();
      if (saved && !disposed) update(()=>restore(saved,Date.now()));
    }).catch(()=>setProblem('Der lokale Speicher ist nicht verfügbar. Prüfe die Browsereinstellungen.'))
      .finally(()=>{if(!disposed)setReady(true);});
    return ()=>{disposed=true;db.current?.close();db.current=null;};
  },[]);
  useEffect(()=>{
    const tick=()=>setNow(Date.now());
    const timer=window.setInterval(tick,state.active?.status==='angeboten' ? 150 : 1000);
    const check=()=>setOnline(navigator.onLine);
    const visibility=()=>{
      tick();
      setVisible(!document.hidden);
      if (!document.hidden) return;
      setFix(null);
      update(s=>s.meter.status==='besetzt'?{...s,meter:{...s.meter,last:null,gap:true}}:s);
    };
    window.addEventListener('online',check);
    window.addEventListener('offline',check);
    document.addEventListener('visibilitychange',visibility);
    return ()=>{
      clearInterval(timer);
      window.removeEventListener('online',check);
      window.removeEventListener('offline',check);
      document.removeEventListener('visibilitychange',visibility);
    };
  },[state.active?.status]);
  useEffect(()=>{
    if(!notice) return;
    const timer=setTimeout(()=>setNotice(''),5500);
    return ()=>clearTimeout(timer);
  },[notice]);

  function sample(sample:Fix) {
    setFix(sample);
    const s=stateRef.current;
    const checked=sectors.find(sector=>sector.id===s.sector);
    outside.current = checked && s.settings.autoOut && beyond(sample,checked.point,s.settings.radius) ? outside.current+1 : 0;
    if(outside.current>=3 && checked) {
      setNotice('Automatisch aus Sektor '+checked.id+' ausgebucht.');
      outside.current=0;
      update(v=>({...v,sector:null}));
    }
    update(v=>{
      const meter=measure(v.meter,sample);
      return meter===v.meter?v:{...v,meter};
    });
  }
  useEffect(()=>{
    if(!state.session || !visible || simulated) return;
    if(!navigator.geolocation || !window.isSecureContext) {
      setGpsMessage('GPS benötigt HTTPS und einen unterstützten Browser.');
      return;
    }
    setGpsMessage('Standort wird ermittelt');
    const id=navigator.geolocation.watchPosition(pos=>{
      const {latitude,longitude,accuracy,heading,speed}=pos.coords;
      sample({lat:latitude,lon:longitude,accuracy,heading,speed,at:pos.timestamp});
      setGpsMessage('GPS verfügbar');
    },error=>{
      setFix(null);
      setGpsMessage(error.code===1?'Standortfreigabe fehlt. Einbuchung, GPS-Preis und Navigation ab Standort sind eingeschränkt.':'Kein GPS-Signal. Standort erneut anfragen.');
    },{enableHighAccuracy:true,maximumAge:5000,timeout:16000});
    return ()=>navigator.geolocation.clearWatch(id);
  },[state.session,visible,gpsRetry,simulated]);
  useEffect(()=>{
    if(!state.session||!visible||simulated||state.meter.status!=='besetzt'||!navigator.geolocation) return;
    let stopped=false;
    const timer=window.setInterval(()=>{
      navigator.geolocation.getCurrentPosition(pos=>{
        if(stopped) return;
        const {latitude,longitude,accuracy,heading,speed}=pos.coords;
        sample({lat:latitude,lon:longitude,accuracy,heading,speed,at:pos.timestamp});
        setGpsMessage('GPS verfügbar');
      },()=>{}, {enableHighAccuracy:true,maximumAge:2000,timeout:5500});
    },7000);
    return ()=>{stopped=true;clearInterval(timer);};
  },[state.session,state.meter.status,visible,simulated]);
  const currentFix=usableFix(fix,now)?fix:null;

  function book(sector:Sector) {
    if (!available(stateRef.current) || !canBook(currentFix,sector.point,stateRef.current.settings.radius)) {
      setNotice('Einbuchung erfordert ein genaues GPS-Signal innerhalb des Radius und den Status Frei.');
      return;
    }
    outside.current=0;
    update(s=>({...s,sector:sector.id}));
    setNotice('Sie sind in Sektor '+sector.id+' – '+sector.name+' eingebucht.');
  }
  function unbook() {
    const id=stateRef.current.sector;
    if (id===null) return;
    outside.current=0;
    update(s=>({...s,sector:null}));
    setNotice('Sie wurden aus Sektor '+id+' ausgebucht.');
  }
  function setAvailability(value:Snapshot['availability']) {
    const s=stateRef.current;
    if(s.active||s.meter.status!=='frei') return;
    update(v=>({...v,availability:value,pauseAt:value==='pause'?Date.now():0,sector:value==='frei'?v.sector:null}));
  }
  function sound(sequence:number[]) {if (stateRef.current.settings.meterSound) beep(sequence);}
  function settings(patch:Partial<Settings>) {update(s=>({...s,settings:{...s.settings,...patch}}));}
  function transition(next:Order['status'],reason?:string) {
    const s=stateRef.current;
    if (!s.active) return false;
    if (next==='abgeschlossen' && s.meter.status==='besetzt') {
      setNotice('Taxameter zuerst auf KASSE stellen.');
      return false;
    }
    const meter=s.meter;
    const linked=meter.orderId===s.active.id && meter.status!=='frei';
    const record=linked?meter:s.rides.find(ride=>ride.orderId===s.active?.id);
    const final=next==='abgeschlossen'||next==='storniert';
    const at=Date.now();
    const ended:Meter={...meter,status:'kasse',end:meter.end||at,last:null};
    const job=changeOrder(s.active,next,at,{
      ...(reason?{reason}:{}),...(final&&record?{metres:record.metres,cents:cents(record)}:{}),
    });
    if (!job) return false;
    if (final || next==='abgelehnt') {
      update(v=>({...v,active:null,history:[job,...v.history],
        ...(final&&linked?{meter:clearMeter(),rides:[ended,...v.rides]}:{})}));
      setNotice(next==='abgeschlossen'?'Fahrt abgeschlossen.':next==='storniert'?'Auftrag storniert.':reason==='Angebot abgelaufen'?'Auftrag nicht angenommen.':'Auftrag abgelehnt.');
    } else update(v=>({...v,active:job,sector:null}));
    return true;
  }
  useEffect(()=>{
    if(state.active?.status==='angeboten' && now>=deadline(state.active)) transition('abgelehnt','Angebot abgelaufen');
  },[state.active,now]);

  function meterAction(next:Meter['status']) {
    const s=stateRef.current;
    const meter=s.meter;
    const at=Date.now();
    if (next==='besetzt' && meter.status==='frei' && s.availability==='frei' && (!s.active||s.active.status==='besetzt')) {
      if (!currentFix || currentFix.accuracy > 35) {sound([240]);setNotice('Für den Taxameter ist ein genaues, aktuelles GPS-Signal erforderlich.');return;}
      if (s.active && s.rides.some(ride=>ride.orderId===s.active?.id)) {setNotice('Für diesen Auftrag wurde bereits eine Fahrt erfasst.');return;}
      update(v=>({...v,sector:null,meter:{...clearMeter(),status:'besetzt',start:at,tariff:v.settings.tariff,
        mode:v.settings.tariffMode,vehicle:v.settings.vehicle,orderId:v.active?.id??null}}));
      sound([740,990]);
    } else if (next==='kasse' && meter.status==='besetzt') {
      update(v=>({...v,meter:{...meter,status:'kasse',end:at,last:null,gap:meter.gap||!meter.last||at-meter.last.at>15000}}));
      sound([990,740]);
    } else if (next==='frei' && meter.status==='kasse') {
      update(v=>({...v,meter:clearMeter(),rides:[meter,...v.rides]}));
      sound([660]);
    } else {sound([240]);setNotice('Dieser Wechsel ist im aktuellen Betriebszustand nicht verfügbar.');}
  }
  function toggleExtra() {
    if (stateRef.current.meter.status==='frei') return;
    update(s=>({...s,meter:{...s.meter,extra:s.meter.extra ? 0 : s.meter.tariff.animal}}));
    sound([820]);
  }
  function routeAdapter() {
    const config=stateRef.current.settings;
    return online && config.routing ? osrm(config.routingUrl || demoRouting) : null;
  }
  const generatorIndex=useRef(0);
  async function generate(blocked:()=>boolean,manual=false) {
    const start=stateRef.current;
    if (pending.current||blocked()||!available(start)||document.hidden) return;
    pending.current=true;
    setGenerating(true);
    const id=++generatorIndex.current;
    try {
      const {job,message}=await localOrders(start.settings,currentFix,start.history,routeAdapter());
      if (id!==generatorIndex.current||blocked()||!available(stateRef.current)||document.hidden||start.settings!==stateRef.current.settings) return;
      if (!job) {if(manual)setNotice(message);return;}
      update(s=>({...s,active:{...job,offeredAt:Date.now()}}));
      if(start.settings.orderSound) beep([775,1050,775]);
    } catch {
      if (manual) setNotice('Lokales Angebot konnte nicht erzeugt werden.');
    } finally {pending.current=false;setGenerating(false);}
  }
  function importData(json:string) {
    const current=stateRef.current;
    if (current.active||current.meter.status!=='frei') throw new Error('Laufenden Auftrag oder Taxameter zuerst beenden.');
    const result=snapshotSchema.safeParse(JSON.parse(json));
    if(!result.success) throw new Error('Das Backup hat ein ungültiges Format.');
    const parsed=restore(result.data,Date.now());
    update(()=>({...parsed,session:current.session}));
    setNotice('Lokale Daten wurden importiert.');
  }
  function toggleSimulation() {
    if (!import.meta.env.DEV) return;
    setFix(null);
    setSimulated(v=>!v);
  }
  return {state,ready,problem,notice,setNotice,now,online,fix:currentFix,gpsMessage,update,book,unbook,setAvailability,settings,
    transition,meterAction,toggleExtra,routeAdapter,generate,generating,visible,importData,sound,simulated,toggleSimulation,
    inject:(lat:number,lon:number)=>{if(import.meta.env.DEV&&simulated) sample({lat,lon,accuracy:5,at:Date.now(),heading:null,speed:null});},
    retryGps:()=>{setFix(null);setGpsRetry(n=>n+1);},
  };
}
export type Dispatch = ReturnType<typeof useDispatch>;
