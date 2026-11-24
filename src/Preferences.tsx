import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown, CircleHelp, Crosshair, Download, LogOut, Settings2, Upload, UserRound } from 'lucide-react';
import { cityTariff, pickups, profile, sectors, sourceTariff, type Settings } from './domain';
import { demoRouting } from './services';
import type { Dispatch } from './useDispatch';

function Panel({title,children,id,open=false}:{title:string;children:ReactNode;id?:string;open?:boolean}){
  return <details className="panel setting-panel" id={id} open={open||undefined}>
    <summary>{title}<ChevronDown size={18}/></summary><div className="setting-body">{children}</div>
  </details>;
}
function Toggle({label,checked,onChange}:{label:string;checked:boolean;onChange:(value:boolean)=>void}){
  return <label className="toggle"><span>{label}</span><input type="checkbox" role="switch" checked={checked} onChange={e=>onChange(e.target.checked)}/></label>;
}
function Choice<T extends string|number>({label,value,options,onChange}:{label:string;value:T;options:readonly (readonly [T,string])[];onChange:(value:T)=>void}){
  return <label className="field">{label}<select value={value} onChange={e=>{
    const selected=options.find(([item])=>String(item)===e.target.value);
    if(selected)onChange(selected[0]);
  }}>{options.map(([item,text])=><option key={item} value={item}>{text}</option>)}</select></label>;
}
function NumberField({label,value,min,max,step=1,onChange}:{label:string;value:number;min:number;max:number;step?:number;onChange:(value:number)=>void}){
  return <label className="field">{label}<input key={value} type="number" defaultValue={value} min={min} max={max} step={step} onBlur={e=>{
    const next=e.target.valueAsNumber;
    if(Number.isFinite(next)&&e.target.checkValidity())onChange(next);
    else e.target.value=String(value);
  }}/></label>;
}
export default function Preferences({d,tutorial,logout}:{d:Dispatch;tutorial:()=>void;logout:()=>void}){
  const {settings:s,meter,active,availability}=d.state;
  const {hash}=useLocation();
  const [profileMissing,setProfileMissing]=useState(false);
  const [review,setReview]=useState(false);
  const [simLat,setSimLat]=useState('51.404');
  const [simLon,setSimLon]=useState('6.765');
  useEffect(()=>{
    if(hash!=='#gps'&&hash!=='#navigation')return;
    const panel=document.getElementById(hash.slice(1)) as HTMLDetailsElement|null;
    if(panel){panel.open=true;panel.scrollIntoView({block:'nearest'});}
  },[hash]);
  const setting = <K extends keyof Settings,>(key:K)=>(value:Settings[K])=>d.settings({[key]:value});
  const tariff = <K extends keyof Settings['tariff'],>(key:K)=>(value:number)=>d.settings({tariff:{...s.tariff,[key]:value}});
  function exportData(){
    const url=URL.createObjectURL(new Blob([JSON.stringify(d.state,null,2)],{type:'application/json'}));
    const a=document.createElement('a');
    a.href=url;a.download='taxi-duisburg-backup.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
    d.setNotice('Die lokale Datensicherung wurde erstellt.');
  }
  return <>
    <div className="page-title"><div><div className="eyebrow">FAHRER & SYSTEM</div><h1>Menü</h1></div><Settings2 size={24}/></div>
    <div className="stack" data-anchor="settings">
      <Panel title="Allgemein" open>
        <Toggle label="Fahreranzeige bei Inaktivität" checked={s.idle} onChange={setting('idle')}/>
        <Choice label="Zeit bis zur Fahreranzeige" value={s.idleSec} options={[[30,'30 Sekunden'],[60,'60 Sekunden'],[120,'2 Minuten'],[300,'5 Minuten'],[600,'10 Minuten']]} onChange={setting('idleSec')}/>
        <Choice label="Design" value={s.theme} options={[[ 'dunkel','Dunkel'],['hell','Hell'],['system','System']]} onChange={setting('theme')}/>
        <button className="button" disabled={!!active||meter.status!=='frei'} onClick={()=>d.setAvailability(availability==='abwesend'?'frei':'abwesend')}>{availability==='abwesend'?'Verfügbar melden':'Nicht verfügbar melden'}</button>
      </Panel>
      <Panel title="GPS und Sektoren" id="gps" open={hash==='#gps'}>
        <p>{d.fix?'GPS verfügbar · ±'+Math.round(d.fix.accuracy)+' m':d.gpsMessage}</p>
        <button className="button" onClick={d.retryGps}><Crosshair size={17}/> Position aktualisieren</button>
        <NumberField label="Einbuchungsradius in Metern" value={s.radius} min={30} max={500} onChange={setting('radius')}/>
        <Toggle label="Beim Verlassen automatisch ausbuchen" checked={s.autoOut} onChange={setting('autoOut')}/>
        <p className="subtle">{sectors.filter(p=>p.point).length} von {sectors.length} Sektoren haben belegte Koordinaten.</p>
      </Panel>
      <Panel title="Aufträge">
        <Toggle label="Automatische lokale Angebote" checked={s.auto} onChange={setting('auto')}/>
        <Choice label="Zeit zwischen Auftragsangeboten" value={s.intervalMin===undefined?'legacy':s.intervalMin+'-'+s.intervalMax}
          options={[
            ['legacy','Bisherige Einstellung ('+s.interval+' Sekunden)'],
            ['10-20','10–20 Sekunden'],['20-60','20–60 Sekunden'],['60-120','1–2 Minuten'],
            ['120-300','2–5 Minuten'],['300-600','5–10 Minuten'],
          ]} onChange={value=>{
            if(value==='legacy'){d.settings({intervalMin:undefined,intervalMax:undefined});return;}
            const [intervalMin,intervalMax]=value.split('-').map(Number);
            d.settings({intervalMin,intervalMax});
          }}/>
        <p className="subtle">Bei jedem freien Wartezyklus wird ein neuer Abstand innerhalb der Zeitspanne gewählt. GPS- und Anfahrtsfilter gelten weiterhin.</p>
        <Toggle label="Aufträge nach Entfernung filtern" checked={s.filter} onChange={setting('filter')}/>
        <NumberField label="Maximale Anfahrtszeit in Minuten" value={s.maxMin} min={2} max={20} onChange={setting('maxMin')}/>
        <Toggle label="Auftragssounds" checked={s.orderSound} onChange={setting('orderSound')}/>
        <p className="subtle">{pickups.filter(p=>p.point).length} von {pickups.length} Einträgen haben belegte Koordinaten.</p>
        <button className="button" onClick={()=>setReview(!review)}>{review?'Abholkatalog schließen':'Abholkatalog öffnen'}</button>
        {review&&<ul className="catalog">{pickups.map(item=><li key={item.id}>
          <strong>{item.name}</strong> · {item.address}<br/>{item.point?<a href={item.point.source} target="_blank" rel="noreferrer">{item.note||'Koordinatenquelle'}</a>:<span>{item.note||'Standort prüfen'}</span>}
        </li>)}</ul>}
      </Panel>
      <Panel title="Navigation" id="navigation" open={hash==='#navigation'}>
        <Choice label="Standardnavigation" value={s.navigation} options={[[ 'intern','Intern'],['google','Google Maps']]} onChange={setting('navigation')}/>
        <Toggle label="Gesprochene Abbiegehinweise" checked={s.voice} onChange={setting('voice')}/>
        <Toggle label="Online-Routing freigeben" checked={s.routing} onChange={setting('routing')}/>
        <p className="subtle">Für Straßenrouten und den Anfahrtsfilter werden Start und Ziel an den gewählten Routingdienst übertragen. Der kostenlose FOSSGIS-Dienst ist für einzelne Testanfragen vorgesehen.</p>
        <label className="field">Eigener OSRM-Endpunkt (optional)<input type="url" defaultValue={s.routingUrl} placeholder={demoRouting} onBlur={e=>{
          const value=e.currentTarget.value.trim();
          try{
            if(value){
              const url=new URL(value);
              if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||value.length>300)throw new Error();
            }
            setting('routingUrl')(value);
          }catch{e.currentTarget.value=s.routingUrl;d.setNotice('Gültigen HTTPS-Endpunkt ohne Zugangsdaten eintragen.');}
        }}/></label>
        <a className="text-link" href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noreferrer">Routingdienst und Nutzungsbedingungen</a>
      </Panel>
      <Panel title="Taxameter">
        <p className="subtle">Nicht geeichte Anzeige. Tarifparameter gelten ab der nächsten Fahrt.</p>
        <Toggle label="Taxameter-Sounds" checked={s.meterSound} onChange={setting('meterSound')}/>
        <Choice label="Fahrzeugtarif" value={s.vehicle} options={[[ 'standard','Standard'],['kombi','Bestellter Kombi'],['gross','Großtaxe']]} onChange={setting('vehicle')}/>
        <NumberField label="Grundpreis in Cent" value={s.tariff.base} min={0} max={100000} onChange={tariff('base')}/>
        <NumberField label="Wegschritt Tag in Metern" value={s.tariff.day} min={1} max={1000} step={0.01} onChange={tariff('day')}/>
        <NumberField label="Wegschritt Nacht in Metern" value={s.tariff.night} min={1} max={1000} step={0.01} onChange={tariff('night')}/>
        <NumberField label="Wartezeitschritt in Sekunden" value={s.tariff.wait} min={1} max={3600} step={0.01} onChange={tariff('wait')}/>
        <NumberField label="Preisschritt in Cent" value={s.tariff.increment} min={1} max={10000} onChange={tariff('increment')}/>
        <NumberField label="Tierzuschlag in Cent" value={s.tariff.animal} min={0} max={100000} onChange={tariff('animal')}/>
        <button className="button" onClick={()=>{d.settings({tariff:cityTariff});d.setNotice('Duisburger Tarifwerte geladen.');}}>Duisburger Tarifwerte laden</button>
        <a className="text-link" href={sourceTariff} target="_blank" rel="noreferrer">Stadt Duisburg · Fassung ab 01.09.2025</a>
      </Panel>
      <Panel title="Fahrerprofil">
        <div className="profile-settings">
          <span className="avatar">{profileMissing?<UserRound size={24}/>:<img src={import.meta.env.BASE_URL+'fahrerbilder/fahrer.png'} alt={profile.name} onError={()=>setProfileMissing(true)}/>}</span>
          <div><strong>{profile.name}</strong><p>{profile.role}</p></div>
        </div>
        <p>{profile.center}<br/>{profile.company}<br/>Fahrer-Code {profile.code}</p>
        <button className="button" onClick={logout}>Fahrer wechseln</button>
      </Panel>
      <Panel title="System">
        <p>Version 1.1.0 · {d.online?'Online':'Offline'}</p>
        <button className="button" onClick={tutorial}><CircleHelp size={18}/> Tutorial starten</button>
        <button className="button" onClick={exportData}><Download size={18}/> Daten exportieren</button>
        <label className="button file-picker"><Upload size={18}/> Daten importieren<input type="file" accept="application/json,.json" onChange={async e=>{
          const input=e.currentTarget;
          const file=input.files?.[0];
          if(!file)return;
          try{if(file.size>12_000_000)throw new Error('Das Backup ist zu groß.');d.importData(await file.text());}
          catch(error){d.setNotice(error instanceof Error?error.message:'Backup konnte nicht geladen werden.');}
          finally{input.value='';}
        }}/></label>
        <button className="button danger" onClick={logout}><LogOut size={18}/> Abmelden</button>
      </Panel>
      {import.meta.env.DEV&&<Panel title="Entwickler-Testmodus">
        <Toggle label="Künstliche GPS-Position aktivieren" checked={d.simulated} onChange={d.toggleSimulation}/>
        {d.simulated&&<><label className="field">Breitengrad<input value={simLat} onChange={e=>setSimLat(e.target.value)}/></label>
          <label className="field">Längengrad<input value={simLon} onChange={e=>setSimLon(e.target.value)}/></label>
          <button className="button" onClick={()=>{
            const lat=Number(simLat),lon=Number(simLon);
            if(simLat&&simLon&&Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lon)&&Math.abs(lon)<=180)d.inject(lat,lon);
            else d.setNotice('Ungültige Koordinaten.');
          }}>Testposition setzen</button></>}
      </Panel>}
    </div>
  </>;
}
