// Read-only operator view and independent audit of the controlled local fixture.
import {chromium} from '@playwright/test';
import {mkdirSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const [id,label='confirmation',base='http://127.0.0.1:4311']=process.argv.slice(2);
if(!id)throw new Error('Usage: node scripts/observe-recovery-drill.mjs TASK_ID [LABEL] [URL]');
const root=resolve('.atsys/usability-20261024',label);mkdirSync(root,{recursive:true,mode:0o700});
const sourcePaths=['examples/recovery20/runner.mjs','examples/recovery20/validate.mjs'];
const hashSources=()=>Object.fromEntries(sourcePaths.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
const original=hashSources();
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1440,height:1050}});
const seen=new Set(),samples=[];
let previous='',lastTask;
try{
  for(let n=0;n<600;n++){
    const state=await(await fetch(base+'/api/operations')).json();
    const task=state.tasks.find(t=>t.id===id);assert.ok(task,'Managed task must exist');lastTask=task;
    const worker=task.attempts.findLast(a=>a.phase==='worker');
    const progress=task.attempts.findLast(a=>a.phase==='worker'&&a.progress)?.progress;
    const signal=task.status+':'+(progress?.completed??'unknown');
    if(signal!==previous){console.log(new Date().toISOString(),signal);samples.push({at:new Date().toISOString(),status:task.status,progress,phase:task.attempts.at(-1)?.phase});previous=signal;}
    const stage=task.status==='completed'?'completed':task.status==='needs_attention'?'blocked':task.status==='supervising'?'supervisor':task.status==='repairing'?'repair':progress?.completed===5&&worker?.status==='running'?'fault-at5':progress?.completed>=6&&task.attempts.filter(a=>a.phase==='worker').length>1?'resumed':null;
    if(stage&&!seen.has(stage)){
      await page.goto(base+'/tasks/'+id);await page.getByRole('button',{name:'Edit task wiring'}).waitFor();
      await page.screenshot({path:join(root,stage+'.png'),animations:'disabled'});seen.add(stage);
      writeFileSync(join(root,'observations.json'),JSON.stringify({id,samples,stages:[...seen]},null,2));
    }
    if(['completed','needs_attention','stopped'].includes(task.status))break;
    await new Promise(r=>setTimeout(r,1000));
  }
  writeFileSync(join(root,'task-evidence.json'),JSON.stringify(lastTask,null,2));
  const t=lastTask;assert.equal(t.status,'completed','Drill must pass independent acceptance');
  const events=readFileSync(join(t.config.cwd,'journal.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  const faults=events.filter(e=>e.type==='fault.injected');assert.equal(faults.length,1);assert.equal(faults[0].afterTask,5);
  const completed=events.filter(e=>e.type==='task.completed');assert.deepEqual(completed.map(e=>e.task_id),Array.from({length:20},(_,i)=>i+1));
  assert.deepEqual(t.attempts.map(a=>a.phase),['worker','supervisor','repair','worker','validator']);
  const [first,supervisor,repair,resumed,validator]=t.attempts;
  assert.match(first.failure,/Progress stalled/);assert.equal(first.progress.completed,5);
  assert.equal(supervisor.proposal.action,'repair');assert.equal(repair.repairResult.fixed,true);
  assert.equal(resumed.progress.completed,20,'Final progress must be flushed, not left at19');
  assert.equal(validator.validation.passed,true);
  assert.ok(t.events.some(e=>e.type==='repair.authorized'));
  assert.deepEqual(hashSources(),original,'Runner and validator must remain unchanged');
  const receipt=statSync(join(t.config.cwd,'repair-receipt.json')).mtimeMs;
  assert.ok(receipt>=Date.parse(repair.startedAt)&&receipt<=Date.parse(repair.endedAt)+1000,'Repair receipt must be produced during the authorized repair');
  const seconds=(end,start)=>(Date.parse(end)-Date.parse(start))/1000;
  const report={kind:'controlled-local-memory-fixture-not-dolphinbench',id,status:t.status,completed:completed.length,uniqueTaskIds:new Set(completed.map(e=>e.task_id)).size,faultAfterTask:5,faultDetectionSeconds:seconds(first.endedAt,faults[0].at),diagnosisSeconds:seconds(supervisor.endedAt,supervisor.startedAt),repairSeconds:seconds(repair.endedAt,repair.startedAt),totalSeconds:seconds(validator.endedAt,t.createdAt),firstFiveNotReplayed:true,finalReportedProgress:resumed.progress,independentAcceptance:validator.validation,sourceDigests:original,stagesCaptured:[...seen],manualRepairPerformed:false};
  writeFileSync(join(root,'audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
