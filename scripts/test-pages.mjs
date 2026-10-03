import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const router = app.slice(app.indexOf('  var VIEWS = ['), app.indexOf('  /* ============================================================\n     数学公式'));
const context = { location:{pathname:'/',hash:'',search:''}, window:{addEventListener(){}}, document:{} };
vm.createContext(context); vm.runInContext(router, context);
let checks=0;
function check(actual, expected, message) { assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message); checks++; }
for (const [pathname, view, section] of [
  ['/', 'home', ''], ['/index.html','home',''], ['/space/','space',''], ['/space/index.html','space',''], ['/friends/','friends',''],
  ['/space/writing/','space','travel'], ['/space/footprints/','space','footprint'], ['/space/tech/','space','tech'], ['/space/devices/','space','devices'],
  ['/friends/moments/','friends','moments'], ['/friends/guides/','friends','study'], ['/friends/trips/','friends','trips']
]) {
  context.location.pathname=pathname; context.location.hash='';
  const result=context.routeForLocation();
  check([result.view,result.section||''],[view,section],'Direct route: '+pathname);
  const filename=path.join(root,pathname.endsWith('/')?pathname+'index.html':pathname);
  const html=fs.readFileSync(filename,'utf8');
  check(/id="account" hidden/.test(html),true,'Admin must start hidden before authentication');
  if(section) {
    check(new RegExp('id="'+section+'">').test(html),true,'Initial static section must be visible');
    check(/id="sectionBreadcrumb"[^>]* hidden/.test(html),false,'Direct page must have a visible breadcrumb');
  }
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  check(new Set(ids).size,ids.length,'No duplicate ids: '+pathname);
  for(const m of html.matchAll(/(?:src|href)="(\/[^"?#]+)(?:\?[^"#]*)?"/g)) {
    const file=path.join(root,m[1].endsWith('/')?m[1]+'index.html':m[1]);
    assert.ok(fs.existsSync(file),'Missing local asset or destination: '+m[1]); checks++;
  }
}
for(const [hash,view,section] of [['#space','space',''],['#friends','friends',''],['#travel','space','travel'],['#footprint','space','footprint'],['#tech','space','tech'],['#devices','space','devices'],['#moments','friends','moments'],['#study','friends','study'],['#trips','friends','trips']]) {
  context.location.pathname='/';context.location.hash=hash;
  const result=context.routeForLocation();check([result.view,result.section||''],[view,section],'Legacy bookmark: '+hash);
}
for(const [hash,external] of [['#photo','/photo/'],['#projects','/projects/'],['#games','/games/']]) {context.location.hash=hash;check(context.routeForLocation().external,external,'Existing independent page: '+hash);}
for(const [id,count] of [['spaceDirectory',6],['friendsDirectory',4]]) {
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const section=html.match(new RegExp('<section[^>]*id="'+id+'"[\\s\\S]*?<\\/section>'))[0];
  check([...section.matchAll(/class="directory-card /g)].length,count,'Exactly '+count+' entry banners');
}
console.log(checks+' route, bookmark, static-page and local-link checks passed.');
