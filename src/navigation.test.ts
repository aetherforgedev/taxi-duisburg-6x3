import { describe, expect, it } from 'vitest';
import { initial, snapshotSchema, type Route } from './domain';
import { guidance, offerDelay, projectRoute, routeLengths } from './navigation';

const points=[{lat:51.4,lon:6.76},{lat:51.402,lon:6.76},{lat:51.402,lon:6.764}];
const lengths=routeLengths(points);
const route:Route={points,distance:500,duration:120,steps:[
  {...points[0],label:'Losfahren',distance:222,duration:60,offset:0,street:'Teststraße',type:'depart'},
  {...points[1],label:'Rechts abbiegen',distance:278,duration:60,offset:lengths[1],street:'Zielstraße',modifier:'right',type:'turn'},
  {...points[2],label:'Ziel erreicht',distance:0,duration:0,offset:lengths[2],type:'arrive'},
]};
describe('Live navigation and offer timing',()=>{
  it('draws a new bounded delay for each cycle and preserves legacy settings',()=>{
    expect(offerDelay({...initial().settings,intervalMin:10,intervalMax:20},()=>0)).toBe(10000);
    expect(offerDelay({...initial().settings,intervalMin:20,intervalMax:60},()=>0.9999)).toBe(60000);
    const old={...initial().settings,interval:45,intervalMin:undefined,intervalMax:undefined};
    expect(offerDelay(old)).toBe(45000);
    const saved=initial();
    delete saved.settings.intervalMin;
    delete saved.settings.intervalMax;
    expect(snapshotSchema.parse(saved).settings.interval).toBe(90);
  });
  it('updates turn distance, remaining route, ETA and arrival from GPS progress',()=>{
    const start=guidance(route,points[0]);
    const midway=guidance(route,{lat:51.401,lon:6.76});
    expect(start.step?.modifier).toBe('right');
    expect(midway.toTurn).toBeCloseTo(start.toTurn/2,0);
    expect(midway.remaining).toBeLessThan(start.remaining);
    expect(midway.seconds).toBeCloseTo(90,0);
    expect(guidance(route,{lat:51.40195,lon:6.76}).step?.modifier).toBe('right');
    const after=guidance(route,{lat:51.402,lon:6.761});
    expect(after.step?.type).toBe('arrive');
    expect(after.currentStreet).toBe('Zielstraße');
    expect(guidance(route,points[2]).arrived).toBe(true);
  });
  it('projects onto segments and detects an actual deviation',()=>{
    expect(projectRoute({lat:51.401,lon:6.76},points).offRoute).toBeCloseTo(0);
    expect(projectRoute({lat:51.401,lon:6.77},points).offRoute).toBeGreaterThan(300);
    expect(projectRoute({lat:51.401,lon:6.76},points).point.lat).toBeCloseTo(51.401,5);
  });
});
