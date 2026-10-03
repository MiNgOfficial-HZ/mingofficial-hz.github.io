import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const renderer=app.slice(app.indexOf('  var MD_FENCE'),app.indexOf('  /* ---------- 弹窗系统'));
const ctx={mediaUrl:u=>u};vm.createContext(ctx);vm.runInContext(renderer,ctx);
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name);}
const html=(s,map=false)=>ctx.mdToHtml(s,map);
test('Highlight, nested emphasis and code protection',()=>{
  assert.equal(html('==重点 **加粗**=='),'<p><mark>重点 <strong>加粗</strong></mark></p>');
  assert.equal(html(String.fromCharCode(96)+'==代码=='+String.fromCharCode(96)),'<p><code>==代码==</code></p>');
});
test('All heading levels and quote escaping',()=>{
  for(let i=1;i<=6;i++) assert.equal(html('#'.repeat(i)+' 标题'),'<h'+i+'>标题</h'+i+'>');
  assert.equal(html('> 引用\n> 内容'),'<blockquote>引用 内容</blockquote>');
});
test('Paragraph lines retain actual source positions',()=>{
  const src=Array.from({length:30},(_,i)=>'第'+(i+1)+'行').join('\n');
  const rendered=html(src,true);
  for(let i=1;i<=30;i++)assert.match(rendered,new RegExp('<span data-source-line="'+i+'" data-source-end="'+i+'">第'+i+'行</span>'));
});
test('Fences, display math and subsequent content retain lines',()=>{
  const fence=String.fromCharCode(96).repeat(3);
  const src=['# 开始','','$$','x^2','+ y^2','$$','','正文',fence+'js','const x = 1;','const y = 2;',fence,'','## 结束'].join('\n');
  const rendered=html(src,true);
  assert.match(rendered,/data-source-line="3" data-source-end="6" class="math-pending"/);
  assert.match(rendered,/data-source-line="10" data-source-end="10">const x/);
  assert.match(rendered,/<h2 data-source-line="14" data-source-end="14">结束/);
  assert(!html(src).includes('data-source-line'));
});
test('Tables, list rows, task lists and blank lines retain lines',()=>{
  const rendered=html('| A | B |\n|---|---|\n| a | b |\n\n- one\n- [x] two\n\n> q1\n> q2',true);
  assert.match(rendered,/<tr data-source-line="3"/);
  assert.match(rendered,/<li data-source-line="6" data-source-end="6" class="md-task"/);
  assert.match(rendered,/<span data-source-line="9" data-source-end="9">q2/);
});
test('Markdown does not emit raw scripts or unquoted image attributes',()=>{
  assert(!html('<script>alert(1)</script>').includes('<script>'));
  assert(!html('![a"onerror="alert](https://example.com/a"onload="alert)').includes('"onerror="'));
  assert(!html('[bad](javascript:alert)').includes('<a'));
});
const guides=app.slice(app.indexOf('  function studyBoard('),app.indexOf('  /* ---------- 旅行攻略'));
const idNodes={guideArticles:{},guideResultCount:{},studyList:{addEventListener(){}}};
const guideCtx={S:{studies:[]},$:id=>idNodes[id.slice(1)],URLSearchParams,location:{search:''},SECTION_ROUTES:{study:{path:'/friends/guides/'}},
  esc:s=>String(s||''),authorsOf:t=>[{nick:t.author||'站长'}],actionsHTML:()=>'',emptyHTML:s=>s};
vm.createContext(guideCtx);vm.runInContext(guides,guideCtx);
test('All legacy Fenjue titles and category migrate without changing content',()=>{
  assert.equal(guideCtx.studyBoard({title:'高数焚诀｜N0oo02',category:'笔记'}),'高数焚诀');
  assert.equal(guideCtx.studyBoard({title:'旧笔记',category:'焚诀'}),'高数焚诀');
  assert.equal(guideCtx.studyBoard({title:'别的教程',category:'编程'}),'编程');
});
test('Board, multiple keywords, author and inclusive month filters',()=>{
  guideCtx.S.studies=[
    {id:'a',category:'高数焚诀',title:'微积分',content:'洛必达法则',author:'甲',date:'2026-09'},
    {id:'b',category:'高数焚诀',title:'微积分',content:'求导',author:'乙',date:'2026-10'},
    {id:'c',category:'编程',title:'微积分',content:'洛必达法则',author:'甲',date:'2026-09'}
  ];
  guideCtx.renderGuideArticles({board:'高数焚诀',q:'洛必达 甲',from:'2026-09',to:'2026-09',order:'newest'});
  assert.match(idNodes.guideArticles.innerHTML,/data-id="a"/);assert(!idNodes.guideArticles.innerHTML.includes('data-id="b"'));assert(!idNodes.guideArticles.innerHTML.includes('data-id="c"'));
  assert.equal(idNodes.guideResultCount.textContent,'显示 1 / 2 篇');
  guideCtx.renderGuideArticles({board:'高数焚诀',q:'',from:'2026-10',to:'2026-09',order:'newest'});
  assert.match(idNodes.guideResultCount.textContent,/起始月份晚于/);
});
console.log(checks+' editor/guide behavior checks passed.');
