import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, CarFront, ChevronRight, CircleHelp, ClipboardList, Crosshair, Delete, Gauge, House, MapPin, Menu, Navigation, Pause, Play, Radio, UserRound, X } from 'lucide-react';
import StreetMap from './Map';
import Preferences from './Preferences';
import { activeTariff, available, canBook, cents, deadline, distance, driverStatus, duration, euro, idleAllowed, metresLabel, nearRoute, orderLabels, profile, sectors, selectDriver, type Order, type Route } from './domain';
import { googleMaps, unlockAudio } from './services';
import { useDispatch, type Dispatch } from './useDispatch';

const clock = (n:number) => new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Berlin'}).format(n);
const date = (n:number) => new Intl.DateTimeFormat('de-DE',{dateStyle:'full',timeZone:'Europe/Berlin'}).format(n);
const tabs = [
  ['/', 'Start', House], ['/auftraege','Aufträge',ClipboardList], ['/karte','Karte',MapPin],
  ['/taxameter','Taxameter',Gauge], ['/menue','Menü',Menu],
] as const;
const cancellation = ['Kunde nicht angetroffen','Kunde storniert','Fahrzeugproblem','Falsche Adresse','Sonstiges'];
const tutorialSteps = [
  ['/', 'status','Fahrerstatus','Hier siehst du, ob du frei, eingebucht, in Pause oder im Auftrag bist.'],
  ['/', 'gps','GPS-Anzeige','Die Genauigkeit entscheidet, ob die App eine Einbuchung zulässt.'],
  ['/', 'sectors','Sektorliste','Die App sortiert geprüfte Taxistände nach Luftlinie.'],
  ['/', 'sectors','Sektor einbuchen','Öffne einen Stand. Einbuchen ist nur mit genauem GPS innerhalb des Radius möglich.'],
  ['/auftraege','orders','Aufträge','Hier findest du den aktiven lokalen Auftrag und den bisherigen Verlauf.'],
  ['/auftraege','orders','Auftragsannahme','Du hast acht Sekunden. Nach der Annahme folgt die Anfahrt.'],
  ['/karte','map','Navigation','Die Karte zeigt GPS und bei aktiver Navigation die Straßenroute.'],
  ['/taxameter','meter','Taxameter','START beginnt die Messung, KASSE beendet sie, FREI speichert die Fahrt.'],
  ['/menue','settings','Fahreranzeige','Die Fahreranzeige erscheint nach der gewählten Leerlaufzeit und blendet sich beim Antippen aus.'],
  ['/menue','settings','Einstellungen','Hier konfigurierst du GPS, Aufträge, Navigation, Tarif und lokale Datensicherung.'],
] as const;

function Brand(){return <div className="brand"><span className="brand-icon"><CarFront size={26} strokeWidth={2.2}/></span><span>Taxi Duisburg <b>6×3</b><small>FAHRER-APP</small></span></div>;}
function Avatar({large=false}:{large?:boolean}){
  const [missing,setMissing]=useState(false);
  return <span className={'avatar '+(large?'large':'')}>{missing?<UserRound size={large?78:25} strokeWidth={1.25}/>:<img src={import.meta.env.BASE_URL+'fahrerbilder/fahrer.png'} onError={()=>setMissing(true)} alt="Justin Danes"/>}</span>;
}
function Title({tag,title,children}:{tag:string;title:string;children?:ReactNode}) {
  return <div className="page-title"><div><div className="eyebrow">{tag}</div><h1>{title}</h1></div>{children}</div>;
}
function Dialog({label,onClose,children}:{label:string;onClose?:()=>void;children:ReactNode}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const dialog=ref.current!;
    dialog.showModal();
    return ()=>dialog.close();
  },[]);
  return <dialog ref={ref} className="dialog" aria-label={label} onCancel={event=>{event.preventDefault();onClose?.();}}>
    <div className="dialog-inner">{onClose&&<button type="button" className="close icon-btn" aria-label="Schließen" onClick={onClose}><X size={23}/></button>}{children}</div>
  </dialog>;
}
function Login({now,onConfirm}:{now:number;onConfirm:()=>void}){
  const [code,setCode]=useState('');
  const [error,setError]=useState(false);
  function submit(){
    if(selectDriver(code)) onConfirm();
    else {setError(true);setCode('');}
  }
  return <main className="entry">
    <header className="entry-header"><Brand/><span className="entry-clock">{clock(now)}</span></header>
    <div className="login-body">
      <div className="eyebrow">{date(now)}</div><h1>Fahrer anmelden</h1>
      <label className="code-label" htmlFor="driver-code">Fahrer-Code</label>
      <form onSubmit={e=>{e.preventDefault();submit();}}>
        <input id="driver-code" className="code" type="password" inputMode="none" autoComplete="off" maxLength={4} value={code} placeholder="○ ○ ○ ○" onChange={e=>{setCode(e.target.value.replace(/[^0-9]/g,''));setError(false);}}/>
        <p className="login-error" role="alert">{error?'Fahrer-Code nicht gefunden.':'Lokale Profilauswahl'}</p>
        <div className="keypad">
          {'123456789'.split('').map(n=><button type="button" key={n} onClick={()=>{setError(false);setCode(v=>(v+n).slice(0,4));}}>{n}</button>)}
          <button type="button" onClick={()=>{setCode('');setError(false);}}>C</button>
          <button type="button" onClick={()=>{setError(false);setCode(v=>(v+'0').slice(0,4));}}>0</button>
          <button type="button" aria-label="Letzte Ziffer löschen" onClick={()=>setCode(v=>v.slice(0,-1))}><Delete size={23}/></button>
        </div>
        <button className="button primary full" type="submit">Anmelden <ArrowRight size={19}/></button>
      </form>
    </div>
    <footer className="entry-footer"><Radio size={15}/> Taxi-Duisburg 6x3 · Lokaler Fahrerbetrieb</footer>
  </main>;
}
function DriverScreen({idle,now,go}:{idle:boolean;now:number;go:()=>void}){
  return <main className={'entry driver-entry '+(idle?'idle':'')} onClick={idle?go:undefined}>
    <header className="entry-header"><Brand/><span className="entry-clock">{clock(now)}</span></header>
    <div className="driver-card">
      <div className="eyebrow">{idle?'Sie fahren mit':'FAHRERPROFIL'}</div>
      <h1>{idle?profile.name:'Guten Tag, Justin!'}</h1>
      <button className="photo-button" onClick={idle?undefined:go} aria-label={idle?'Zur App zurück':'Fahrtbetrieb starten'}><Avatar large/></button>
      {!idle&&<><h2>{profile.name}</h2><p>{profile.role}</p></>}
      <p>{profile.center}</p>
      <button className="button primary" onClick={idle?undefined:go}>{idle?'Zur App zurück':'Fahrtbetrieb starten'}<ArrowRight size={18}/></button>
    </div>
  </main>;
}

function JobSummary({job}:{job:Order}){
  return <div className="job-summary">
    <span className="pill">{job.kind}</span>
    <h2>{job.customer}</h2>
    <dl><dt>Abholung</dt><dd>{job.pickup.label}</dd>
      {job.destination&&<><dt>Ziel</dt><dd>{job.destination.label}</dd></>}
      <dt>Anfahrt</dt><dd>{job.initialRoute?metresLabel(job.initialRoute.distance)+' · ca. '+Math.ceil(job.initialRoute.duration/60)+' Min.':'Keine Straßenroute berechnet'}</dd>
    </dl>
  </div>;
}
function MeterPage({d}:{d:Dispatch}){
  const [view,setView]=useState<'tarif'|'fahrten'|null>(null);
  const m=d.state.meter;
  const price=cents(m);
  const tariff=activeTariff(m,m.status==='kasse'?m.end:d.now);
  return <>
    <Title tag="FAHRPREISANZEIGE" title="Taxameter"/>
    <section className="meter-panel" data-anchor="meter">
      <div className="meter-line"><span>FAHRPREIS</span><span className="pill">{m.status.toUpperCase()}</span></div>
      <strong className="fare">{euro(price)}</strong>
      <div className="meter-grid"><span>Wegstrecke<b>{metresLabel(m.metres)}</b></span><span>Fahrzeit<b>{duration(m.start?(m.end||d.now)-m.start:0)}</b></span><span>Wartezeit<b>{duration(m.wait*1000)}</b></span><span>Zuschlag<b>{euro(m.extra)}</b></span></div>
      <p className="subtle">{m.status==='frei' ? 'Gewählter Tarif: '+d.state.settings.tariffMode : 'Aktiver Tarif: '+tariff}</p>
      <p className="subtle">Nicht geeichte Fahrpreisanzeige</p>
    </section>
    {m.gap&&<p className="alert">Messlücke erkannt. Fehlende GPS-Strecken wurden nicht ergänzt.</p>}
    <div className="button-grid">
      <button className="button accept" onClick={()=>d.meterAction('besetzt')}>START</button>
      <button className="button primary" onClick={()=>d.meterAction('kasse')}>KASSE</button>
      <button className="button" onClick={()=>d.meterAction('frei')}>FREI</button>
      <button className="button" onClick={d.toggleExtra} disabled={m.status==='frei'}>ZUSCHLAG</button>
      <button className="button" onClick={()=>setView('tarif')}>TARIF</button>
      <button className="button" onClick={()=>setView('fahrten')}>FAHRTEN</button>
    </div>
    {view&&<Dialog label={view==='tarif'?'Tarif auswählen':'Fahrtenhistorie'} onClose={()=>setView(null)}>
      <h2>{view==='tarif'?'Tarif auswählen':'Fahrtenhistorie'}</h2>
      {view==='tarif'?<>
        <p>Die Auswahl gilt ab der nächsten Fahrt.</p>
        {(['auto','tag','nacht'] as const).map(mode=><button key={mode} className={'button full '+(d.state.settings.tariffMode===mode?'primary':'')} onClick={()=>{d.settings({tariffMode:mode});d.sound([780,890]);setView(null);}}>{{auto:'Automatisch',tag:'Tagtarif',nacht:'Nachttarif'}[mode]}</button>)}
      </>:d.state.rides.length?d.state.rides.map((ride,i)=><div className="history-row" key={i}><span>{new Date(ride.start).toLocaleString('de-DE')}</span><strong>{euro(cents(ride))} · {metresLabel(ride.metres)}{ride.gap?' · Messlücke':''}</strong></div>):<p>Es sind noch keine Fahrten gespeichert.</p>}
    </Dialog>}
  </>;
}
export default function App(){
  const d=useDispatch();
  const {state:s,fix,now}=d;
  const navigate=useNavigate();
  const {pathname}=useLocation();
  const [welcome,setWelcome]=useState(false);
  const [idle,setIdle]=useState(false);
  const [sectorId,setSectorId]=useState<number|null>(null);
  const [showAll,setShowAll]=useState(false);
  const [details,setDetails]=useState(false);
  const [cancel,setCancel]=useState(false);
  const [reason,setReason]=useState('');
  const [historyJob,setHistoryJob]=useState<Order|null>(null);
  const [nav,setNav]=useState(false);
  const [navTarget,setNavTarget]=useState<'abholung'|'ziel'|null>(null);
  const [route,setRoute]=useState<Route|null>(null);
  const [routeError,setRouteError]=useState('');
  const [activeStep,setActiveStep]=useState(0);
  const [routeRetry,setRouteRetry]=useState(0);
  const routeTick=useRef(0);
  const tutorial=s.tutorial ? tutorialSteps[s.tutorial-1] : null;
  const offer=s.active?.status==='angeboten'?s.active:null;
  const job=s.active?.status!=='angeboten'?s.active:null;
  const selected=sectors.find(item=>item.id===sectorId);
  const target=job&&(navTarget==='ziel'||(!navTarget&&job.status==='besetzt')) ? job.destination??job.pickup : job?.pickup;
  const tutorialAnchor=(tutorial&&tutorial[1])||undefined;
  const overlay=!!(offer||selected||cancel||tutorial||historyJob);
  const conditions=useRef({overlay,nav});
  conditions.current={overlay,nav};
  const busy=()=>conditions.current.overlay||conditions.current.nav||!!document.querySelector('dialog[open]');
  const selectSector=useCallback((id:number)=>setSectorId(id),[]);
  const listed=[...sectors].sort((a,b)=>{
    if(fix&&a.point&&b.point)return distance(fix,a.point)-distance(fix,b.point);
    if(a.point&&!b.point)return -1;
    if(b.point&&!a.point)return 1;
    return a.id-b.id;
  });
  useEffect(()=>{if(offer){setIdle(false);setDetails(false);}},[offer?.id]);
  useEffect(()=>{
    if(d.ready&&tutorial)navigate(tutorial[0]);
  },[d.ready,s.tutorial,navigate]);
  useEffect(()=>{
    if(!job){setNav(false);setRoute(null);setCancel(false);}
  },[job?.id]);
  useEffect(()=>setNavTarget(null),[job?.status]);
  useEffect(()=>{
    if (!s.settings.idle || !idleAllowed(s.session,nav,overlay) || !d.visible) return;
    let timer:number;
    const restart=()=>{
      clearTimeout(timer);
      timer=window.setTimeout(()=>{if(!busy())setIdle(true);},s.settings.idleSec*1000);
    };
    restart();
    window.addEventListener('pointerdown',restart);
    window.addEventListener('keydown',restart);
    return ()=>{clearTimeout(timer);window.removeEventListener('pointerdown',restart);window.removeEventListener('keydown',restart);};
  },[s.session,s.settings.idle,s.settings.idleSec,nav,overlay,d.visible,idle,pathname]);
  const generator=useRef(d.generate);
  generator.current=d.generate;
  useEffect(()=>{
    if(!s.session||!s.settings.auto||!d.visible) return;
    const timer=setInterval(()=>void generator.current(busy),s.settings.interval*1000);
    return ()=>clearInterval(timer);
  },[s.session,s.settings.auto,s.settings.interval,d.visible]);
  useEffect(()=>{
    if (!nav) return;
    routeTick.current=0;
    setActiveStep(0);
    setRoute(null);
  },[nav,target?.point.source,routeRetry]);
  useEffect(()=>{
    if(!nav||!target||!fix) return;
    if(routeTick.current && Date.now()-routeTick.current<30000) return;
    if (route && nearRoute(fix,route.points)) return;
    const adapter=d.routeAdapter();
    if(!adapter){setRouteError('Routing ist offline oder nicht freigegeben. Externe Navigation ist verfügbar.');return;}
    routeTick.current=Date.now();
    setRouteError('Straßenroute wird berechnet …');
    const token=routeTick.current;
    void adapter(fix,target.point).then(result=>{
      if(routeTick.current!==token)return;
      setRoute(result);setActiveStep(0);setRouteError('');
    }).catch(()=>{
      if(routeTick.current!==token)return;
      setRouteError('Straßenroute momentan nicht verfügbar. Nutze Google Maps oder berechne erneut.');
    });
  },[nav,target?.point.source,fix?.at,s.settings.routing,s.settings.routingUrl,d.online,routeRetry]);
  useEffect(()=>{
    if(!nav||!route||!fix||route.steps.length<2) return;
    const next=route.steps[activeStep+1];
    if(next && distance(fix,next)<35) setActiveStep(i=>i+1);
  },[fix?.at,route,nav]);
  function stepTutorial(step:number) {
    d.update(v=>({...v,tutorial:step>0&&step<=10?step:0}));
  }
  function openNav(){
    if (!target) return;
    if (s.settings.navigation==='google') {window.open(googleMaps(target.point),'_blank','noopener,noreferrer');return;}
    setNav(true);
    setRouteError(fix?'Straßenroute wird berechnet …':'Interne Navigation wartet auf ein genaues GPS-Signal.');
    navigate('/karte');
  }
  function stopNav(){setNav(false);routeTick.current=0;setRoute(null);setRouteError('');}
  const startup = () => {unlockAudio();d.update(v=>({...v,session:true}));setWelcome(false);navigate('/');};
  const logout = () => {
    if(s.active||s.meter.status!=='frei'){d.setNotice('Laufenden Auftrag oder Taxameter zuerst beenden.');return;}
    d.update(v=>({...v,session:false,sector:null,availability:'frei',pauseAt:0,tutorial:0}));navigate('/');
  };

  if(!d.ready)return <main className="loading"><Brand/><p>Lokale Daten werden geladen …</p></main>;
  if(!s.session)return welcome?<DriverScreen idle={false} now={now} go={startup}/>:<Login now={now} onConfirm={()=>{unlockAudio();setWelcome(true);}}/>;
  const fixLabel=fix?'GPS ±'+Math.round(fix.accuracy)+' m':'GPS sucht';
  return <div className="app" data-theme={s.settings.theme} data-highlight={tutorialAnchor} onPointerDown={unlockAudio}>
    <header className="topbar"><Brand/><div className="top-right"><strong>{clock(now)}</strong><small>{profile.code} · {d.online?'Online':'Offline'}</small></div></header>
    {d.simulated&&<p className="alert">Entwicklermodus · künstliche GPS-Position</p>}
    <main className="content" inert={!!tutorial||idle}>
      {d.problem&&<p className="alert" role="alert">{d.problem}</p>}
      {pathname==='/'&&<>
        <Title tag={date(now)} title="Fahrtbetrieb"/>
        <div className="status-card" data-anchor="status">
          <div className="status-icon"><Activity size={25}/></div>
          <div><span className="eyebrow">FAHRERSTATUS</span><h2>{driverStatus(s)}</h2><p>{s.availability==='pause'?duration(now-s.pauseAt):s.sector!==null?'Sektor '+s.sector+' · '+sectors.find(a=>a.id===s.sector)?.name:profile.name}</p></div>
          <span className={'pill '+(available(s)?'good':'')}>{d.online?'Online':'Offline'}</span>
        </div>
        <div className="quick-actions" data-anchor="gps">
          <button className="button" aria-label="GPS-Status und Standortfreigabe" onClick={()=>navigate('/menue#gps')}><Crosshair size={18}/>{fixLabel}</button>
          {s.sector!==null?<button className="button" onClick={d.unbook}>Ausbuchen</button>:
            <button className="button" disabled={!!s.active||s.meter.status!=='frei'} onClick={()=>d.setAvailability(s.availability==='frei'?'pause':'frei')}>{s.availability==='frei'?<Pause size={18}/>:<Play size={18}/>} {s.availability==='frei'?'Pause starten':s.availability==='pause'?'Pause beenden':'Verfügbar'}</button>}
        </div>
        {!fix&&<p className="subtle gps-copy">{d.gpsMessage}</p>}
        <section data-anchor="sectors">
          <div className="section-title"><div><div className="eyebrow">TAXISTÄNDE</div><h2>Sektoren {fix?'in der Nähe':''}</h2></div><button className="icon-btn" aria-label="Sektoren auf der Karte öffnen" onClick={()=>navigate('/karte')}><MapPin size={22}/></button></div>
          <div className="sector-list">{listed.slice(0,showAll?listed.length:6).map(item=>{
            const here=canBook(fix,item.point,s.settings.radius);
            return <button className={'sector-row '+(here?'in-range':'')} key={item.id} onClick={()=>setSectorId(item.id)}>
              <b className="sector-id">{String(item.id).padStart(2,'0')}</b>
              <span><strong>{item.name}</strong><small>{item.district||'Ohne festen Standort'}{here?' · im Radius':''}</small></span>
              <span className="sector-distance"><b>{fix&&item.point?metresLabel(distance(fix,item.point)):'—'}</b><small>Taxen: 0</small></span><ChevronRight size={17}/>
            </button>;
          })}</div>
          <button className="button full" onClick={()=>setShowAll(v=>!v)}>{showAll?'Weniger Sektoren':'Alle '+sectors.length+' Sektoren'}</button>
        </section>
      </>}
      {pathname==='/auftraege'&&<>
        <Title tag="LOKALER AUFTRAGSBETRIEB" title="Aufträge"/>
        <section data-anchor="orders">
          {job?<div className="panel">
            <p className="eyebrow">{orderLabels[job.status]}</p><JobSummary job={job}/>
            <p className="subtle">{job.comment} · {job.id}</p>
            <div className="stack">
              <button className="button primary" onClick={openNav}><Navigation size={18}/> Navigation starten</button>
              {target&&<a className="button" href={googleMaps(target.point)} target="_blank" rel="noreferrer">Mit Google Maps navigieren</a>}
              {job.status==='anfahrt'&&<button className="button accept" onClick={()=>{if(d.transition('kunde'))stopNav();}}>Am Kunden</button>}
              {job.status==='kunde'&&<button className="button accept" onClick={()=>d.transition('besetzt')}>Fahrgast aufgenommen</button>}
              {job.status==='besetzt'&&<><button className="button" onClick={()=>navigate('/taxameter')}>Taxameter öffnen</button>
                <button className="button accept" onClick={()=>{if(d.transition('abgeschlossen'))stopNav();}}>Fahrt abschließen</button></>}
              <button className="button danger" onClick={()=>{setReason('');setCancel(true);}}>Auftrag stornieren</button>
            </div>
          </div>:<div className="panel empty"><ClipboardList size={32}/><h2>Kein aktiver Auftrag</h2><p>Aufträge werden auf diesem Gerät erzeugt.</p><button className="button primary" disabled={!available(s)||d.generating} onClick={()=>void d.generate(busy,true)}>{d.generating?'Abholort wird geprüft …':'Testauftrag anfragen'}</button>
          {s.settings.filter&&!s.settings.routing&&<p className="subtle"><NavLink to="/menue#navigation">Routing für den Anfahrtsfilter freigeben</NavLink></p>}</div>}
          <div className="section-title"><h2>Verlauf</h2></div>
          {s.history.length?s.history.map(item=><button className="sector-row" key={item.id} onClick={()=>setHistoryJob(item)}><span><strong>{item.customer}</strong><small>{item.pickup.label}</small></span><span className="pill">{orderLabels[item.status]}</span></button>):<p className="subtle">Noch keine gespeicherten Aufträge.</p>}
        </section>
      </>}
      {pathname==='/karte'&&<>
        <Title tag={nav?'ROUTENFÜHRUNG':'OPENSTREETMAP'} title={nav?'Navigation':'Karte'}/>
        <section data-anchor="map">
          <StreetMap fix={fix} radius={s.settings.radius} selected={s.sector} job={job} trip={nav?route:job?.initialRoute} onSector={selectSector} online={d.online}/>
          {nav&&target&&<div className="panel route-panel">
            <h2>{target.label}</h2>
            {job?.destination&&<div className="quick-actions">
              <button className="button" aria-pressed={target===job.pickup} onClick={()=>setNavTarget('abholung')}>Zur Abholung</button>
              <button className="button" aria-pressed={target===job.destination} onClick={()=>setNavTarget('ziel')}>Zum Fahrtziel</button>
            </div>}
            {route&&<><p>{metresLabel(route.distance)} · ca. {Math.ceil(route.duration/60)} Min.</p>
              {route.steps.length>0&&<ol className="turns" start={activeStep+1}>{route.steps.slice(activeStep,activeStep+4).map((step,i)=><li key={i}>{step.label}</li>)}</ol>}</>}
            {routeError&&<p role="status">{routeError}</p>}
            <p className="subtle">Die App für die GPS-Navigation geöffnet lassen.</p>
            <div className="stack"><button className="button" onClick={()=>setRouteRetry(i=>i+1)}>Route neu berechnen</button>
            <a className="button" href={googleMaps(target.point)} target="_blank" rel="noreferrer">Mit Google Maps navigieren</a>
            <button className="button danger" onClick={stopNav}>Navigation beenden</button></div>
          </div>}
        </section>
      </>}
      {pathname==='/taxameter'&&<MeterPage d={d}/>}
      {pathname==='/menue'&&<Preferences d={d} tutorial={()=>stepTutorial(1)} logout={logout}/>}
    </main>
    <nav className="tabs" aria-label="Hauptnavigation" inert={!!tutorial||idle}>{tabs.map(([to,label,Icon])=><NavLink key={to} end to={to}><Icon size={21}/><span>{label}</span></NavLink>)}</nav>
    {idle&&!offer&&<DriverScreen idle now={now} go={()=>setIdle(false)}/>}
    {d.notice&&<div className="toast" role="status">{d.notice}</div>}
    {selected&&<Dialog label={selected.name} onClose={()=>setSectorId(null)}>
      <span className="eyebrow">SEKTOR {selected.id}</span><h2>{selected.name}</h2><p>{selected.district} · {selected.address||'Kein Standort angegeben'}</p>
      <p>Taxen: 0 <small>· fester Anzeigewert</small></p>
      {selected.point?<><p>Einbuchungsradius: {s.settings.radius} m{fix?' · Entfernung: '+metresLabel(distance(fix,selected.point)):''}</p>
        <a className="text-link" href={selected.point.source} target="_blank" rel="noreferrer">Koordinatenquelle ansehen</a>
      </>:<p className="alert">{selected.review}. Einbuchung nicht verfügbar.</p>}
      {s.sector===selected.id?<button className="button full" onClick={()=>{d.unbook();setSectorId(null);}}>Ausbuchen</button>:
        <button className="button primary full" disabled={!available(s)||!canBook(fix,selected.point,s.settings.radius)} onClick={()=>{d.book(selected);setSectorId(null);}}>Einbuchen</button>}
    </Dialog>}
    {offer&&<Dialog label="Neuer Auftrag">
      <div className="offer-head"><span className="eyebrow">NEUER AUFTRAG</span><strong aria-label="Verbleibende Sekunden">{Math.max(0,Math.ceil((deadline(offer)-now)/1000))}</strong></div>
      <JobSummary job={offer}/>
      {details?<p className="panel">{offer.comment}. Auftragsnummer {offer.id}</p>:<StreetMap fix={fix} radius={s.settings.radius} job={offer} trip={offer.initialRoute} compact online={d.online}/>}
      <div className="offer-actions">
        <button className="button accept" onClick={()=>{if(d.transition('anfahrt'))navigate('/auftraege');}}>Annehmen</button>
        <button className="button" onClick={()=>setDetails(v=>!v)}>{details?'Karte':'Details'}</button>
        <button className="button danger" onClick={()=>d.transition('abgelehnt','Manuell abgelehnt')}>Ablehnen</button>
      </div>
    </Dialog>}
    {cancel&&<Dialog label="Auftrag stornieren" onClose={()=>setCancel(false)}>
      <h2>Auftrag stornieren?</h2><label className="field">Grund (optional)<select value={reason} onChange={e=>setReason(e.target.value)}><option value="">Ohne Angabe</option>{cancellation.map(item=><option key={item}>{item}</option>)}</select></label>
      <button className="button danger full" onClick={()=>{if(d.transition('storniert',reason)){stopNav();setCancel(false);}}}>Stornierung bestätigen</button>
    </Dialog>}
    {historyJob&&<Dialog label="Auftragsdetails" onClose={()=>setHistoryJob(null)}><JobSummary job={historyJob}/><p>{orderLabels[historyJob.status]} {historyJob.reason&&'· '+historyJob.reason}</p>{historyJob.cents!==undefined&&<p>{euro(historyJob.cents)} · {metresLabel(historyJob.metres??0)}</p>}<p className="subtle">{historyJob.id}</p></Dialog>}
    {tutorial&&<aside className="tutorial" aria-label="Tutorial">
      <div className="eyebrow"><CircleHelp size={16}/> SCHRITT {s.tutorial} VON 10</div><h2>{tutorial[2]}</h2><p>{tutorial[3]}</p>
      <div className="button-grid"><button className="button" disabled={s.tutorial===1} onClick={()=>stepTutorial(s.tutorial-1)}>Zurück</button>
      <button className="button" onClick={()=>stepTutorial(0)}>Überspringen</button>
      <button className="button primary" onClick={()=>stepTutorial(s.tutorial+1)}>{s.tutorial===10?'Beenden':'Weiter'}</button></div>
    </aside>}
  </div>;
}
