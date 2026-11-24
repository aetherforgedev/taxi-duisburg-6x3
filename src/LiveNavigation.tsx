import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, CornerUpLeft, CornerUpRight, Flag, List, RefreshCw, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import StreetMap from './Map';
import { metresLabel, type Order, type Route } from './domain';
import { guidance } from './navigation';
import { googleMaps, osrm, demoRouting } from './services';
import type { Dispatch } from './useDispatch';

type Props={d:Dispatch;job:Order;onClose:()=>void;onArrive:()=>void};
type Step=Route['steps'][number];
function Turn({step,size=46}:{step?:Step;size?:number}){
  if(step?.type==='arrive')return <Flag size={size}/>;
  if(step?.modifier==='uturn')return <RotateCcw size={size}/>;
  if(step?.type==='roundabout'||step?.type==='rotary')return <span className="roundabout-arrow">↻{step.exit&&<small>{step.exit}</small>}</span>;
  if(step?.modifier?.includes('left'))return <CornerUpLeft size={size}/>;
  if(step?.modifier?.includes('right'))return <CornerUpRight size={size}/>;
  return <ArrowUp size={size}/>;
}
export default function LiveNavigation({d,job,onClose,onArrive}:Props){
  const [destination,setDestination]=useState(job.status==='besetzt'&&job.destination?'ziel':'abholung');
  const target=destination==='ziel'&&job.destination?job.destination:job.pickup;
  const [route,setRoute]=useState<Route|null>(null);
  const [message,setMessage]=useState('');
  const [loading,setLoading]=useState(false);
  const [retry,setRetry]=useState(0);
  const [list,setList]=useState(false);
  const progress=useRef<number|undefined>(undefined);
  const request=useRef(0);
  const lastRequest=useRef(0);
  const offCount=useRef(0);
  const checkedAt=useRef(0);
  const voiceKeys=useRef(new Set<string>());
  const current=useMemo(()=>route&&d.fix?guidance(route,d.fix,progress.current):null,[route,d.fix]);
  const offRoute=!!(current&&current.offRoute>Math.max(45,(d.fix?.accuracy??0)+20));
  useEffect(()=>{
    if(current&&!offRoute)progress.current=current.offset;
  },[current,offRoute]);
  useEffect(()=>{
    request.current++;
    lastRequest.current=0;offCount.current=0;checkedAt.current=0;progress.current=undefined;
    voiceKeys.current.clear();setRoute(null);setLoading(false);setMessage('');
  },[target.point.source,retry,d.state.settings.routingUrl]);
  useEffect(()=>{
    if(!d.fix)return;
    if(d.fix.at!==checkedAt.current){
      offCount.current=offRoute?offCount.current+1:0;
      checkedAt.current=d.fix.at;
    }
    if(route&&offCount.current<3)return;
    if(loading||Date.now()-lastRequest.current<15000)return;
    if(!d.online){setMessage('Offline · Route kann aktuell nicht neu berechnet werden.');return;}
    if(!d.state.settings.routing){setMessage('Für die Navigation Online-Routing freigeben.');return;}
    lastRequest.current=Date.now();
    const token=++request.current;
    setLoading(true);setMessage(route?'Route wird angepasst …':'Route wird berechnet …');
    const routing=osrm(d.state.settings.routingUrl||demoRouting);
    void routing(d.fix,target.point).then(result=>{
      if(token!==request.current)return;
      setRoute(result);progress.current=undefined;offCount.current=0;
      voiceKeys.current.clear();setMessage('');
    }).catch(()=>{
      if(token===request.current)setMessage('Routingdienst nicht erreichbar. Erneut versuchen oder Google Maps öffnen.');
    }).finally(()=>{if(token===request.current)setLoading(false);});
  },[d.fix?.at,d.online,d.state.settings.routing,d.state.settings.routingUrl,route,offRoute,retry,target.point.source,loading]);
  useEffect(()=>()=>{request.current++;window.speechSynthesis?.cancel();},[]);
  useEffect(()=>{
    if(!d.state.settings.voice||!current?.step||offRoute||!d.fix||document.hidden||!('speechSynthesis' in window))return;
    const stage=current.arrived?'arrived':current.toTurn<40?'now':current.toTurn<200?'soon':'prepare';
    const key=current.next+'-'+stage;
    if(voiceKeys.current.has(key))return;
    voiceKeys.current.add(key);
    const prefix=current.toTurn<40?'Jetzt': 'In '+Math.round(current.toTurn/10)*10+' Metern';
    const text=current.arrived?'Sie haben das Ziel erreicht.':prefix+'. '+current.step?.label;
    if(!text)return;
    const utterance=new SpeechSynthesisUtterance(text);
    utterance.lang='de-DE';utterance.rate=1;
    const voice=speechSynthesis.getVoices().find(voice=>voice.lang.startsWith('de')&&voice.localService);
    if(voice)utterance.voice=voice;
    speechSynthesis.cancel();speechSynthesis.speak(utterance);
  },[current?.next,current?.toTurn,current?.arrived,offRoute,d.fix?.at,d.state.settings.voice]);
  useEffect(()=>{
    if(!d.state.settings.voice)window.speechSynthesis?.cancel();
  },[d.state.settings.voice]);
  useEffect(()=>{
    if(!('wakeLock' in navigator))return;
    let ended=false;
    let lock:WakeLockSentinel|undefined;
    const acquire=async()=>{
      if(document.hidden)return;
      try{const next=await navigator.wakeLock.request('screen');if(ended)await next.release();else lock=next;}catch{}
    };
    void acquire();
    document.addEventListener('visibilitychange',acquire);
    return ()=>{ended=true;document.removeEventListener('visibilitychange',acquire);void lock?.release();};
  },[]);
  const safe=current&&!offRoute&&d.fix?current:null;
  const arrived=!!safe?.arrived;
  const turn=safe?.step;
  const minutes=safe?Math.max(1,Math.ceil(safe.seconds/60)):null;
  const eta=safe?new Date(d.now+safe.seconds*1000).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}):null;
  const lanes=route&&safe ? route.steps[Math.max(0,safe.next-1)]?.lanes:undefined;
  return <section className="live-navigation" aria-label="Live-Navigation">
    <StreetMap fix={d.fix} radius={d.state.settings.radius} job={job} online={d.online} navigating
      ahead={safe?.ahead??route?.points} travelled={safe?.travelled}/>
    <div className="navigation-banner" role="status">
      <div className="maneuver-icon"><Turn step={turn}/></div>
      <div className="maneuver-copy">
        <strong className="turn-distance">{!d.fix?'GPS wird gesucht':arrived?'Ziel erreicht':offRoute?'Route verlassen':safe?metresLabel(safe.toTurn):'Navigation'}</strong>
        <h1>{arrived?target.label:turn?.street||turn?.label||target.label}</h1>
        {turn&& !arrived&&<p>{turn.label}</p>}
      </div>
      <button className="icon-btn" aria-label="Navigation schließen" onClick={onClose}><X/></button>
      {safe?.after&&!arrived&&<div className="next-maneuver"><Turn step={safe.after} size={20}/><span>Danach · {safe.after.street||safe.after.label}</span></div>}
      {lanes&&lanes.length>0&&<div className="lane-guidance" aria-label="Spurempfehlung">{lanes.map((lane,i)=><span key={i} className={lane.valid?'valid':''}>{lane.indications.map(indication=>indication.includes('left')?'↰':indication.includes('right')?'↱':'↑').join('')}</span>)}</div>}
    </div>
    <div className="navigation-side">
      <span className="north-indicator" title="Karte nach Norden ausgerichtet">N ↑</span>
      <button className="icon-btn" aria-label={d.state.settings.voice?'Sprachansagen ausschalten':'Sprachansagen einschalten'}
        onClick={()=>d.settings({voice:!d.state.settings.voice})}>{d.state.settings.voice?<Volume2/>:<VolumeX/>}</button>
      <button className="icon-btn" aria-label="Abbiegeliste öffnen" onClick={()=>setList(v=>!v)}><List/></button>
    </div>
    {d.fix?.speed!==null&&d.fix?.speed!==undefined&&<div className="navigation-speed"><b>{Math.round(d.fix.speed*3.6)}</b><small>km/h</small></div>}
    <div className="navigation-bottom">
      {!d.online&&route&&<p className="navigation-message">Offline · GPS folgt der geladenen Route. Neue Karten und Routen benötigen Internet.</p>}
      {message&&<p className="navigation-message" role="status">{message}</p>}
      {!d.fix&&<p className="navigation-message">{d.gpsMessage} · Bitte die App geöffnet lassen.</p>}
      {!d.state.settings.routing&&<button className="button primary full" onClick={()=>d.settings({routing:true})}>Online-Routing freigeben</button>}
      {!safe&&<div className="quick-actions">
        <button className="button" disabled={loading} onClick={()=>{setLoading(false);setRetry(n=>n+1);}}><RefreshCw size={17}/> Erneut versuchen</button>
        <a className="button" href={googleMaps(target.point)} target="_blank" rel="noreferrer">Google Maps</a>
      </div>}
      <div className="navigation-eta"><strong>{arrived?'Angekommen':minutes!==null?minutes+' Min.':'— Min.'}</strong><span>{safe?metresLabel(safe.remaining):'— km'}<small>{eta?'Ankunft '+eta:'Ankunft wird ermittelt'}</small></span></div>
      <p className="navigation-target">{destination==='ziel'?'Fahrtziel':'Abholung'} · {target.label}</p>
      {arrived&&destination==='abholung'&&job.status==='anfahrt'&&<button className="button accept full" onClick={onArrive}>Am Kunden</button>}
      <div className="navigation-footer">
        {job.destination&&<button className="button" onClick={()=>setDestination(v=>v==='ziel'?'abholung':'ziel')}>{destination==='ziel'?'Zur Abholung':'Zum Fahrtziel'}</button>}
        <button className="button" onClick={onClose}>Zum Auftrag</button>
      </div>
    </div>
    {safe?.currentStreet&&<span className="current-street">{safe.currentStreet}</span>}
    {list&&<div className="navigation-directions">
      <div className="section-title"><h2>Abbiegehinweise</h2><button className="icon-btn" aria-label="Abbiegeliste schließen" onClick={()=>setList(false)}><X/></button></div>
      {route?.steps.slice(safe?.next??0).map((step,i)=><div className="direction-row" key={i}><Turn step={step} size={24}/><span>{step.label}<small>{metresLabel(step.distance)}</small></span></div>)}
      {!route&&<p>Die Straßenroute wird benötigt.</p>}
    </div>}
  </section>;
}
