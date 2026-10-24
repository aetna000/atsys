// Records actual installation output and live UI. Controlled fixture, not DolphinBench.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const repo = resolve('.');
const destination = resolve(process.argv[2] || '/Users/javadtaghia/Movies/AtSys-recovery-walkthrough-20261024');
const base = 'http://127.0.0.1:4311';
mkdirSync(destination, { recursive: true, mode: 0o700 });
const support = join(destination, 'evidence');
mkdirSync(support, { recursive: true, mode: 0o700 });
const project = resolve('.atsys/drills',basename(destination));
mkdirSync(project, { recursive: true, mode: 0o700 });
const fixture = ['runner.mjs', 'validate.mjs'].map(n => join(repo, 'examples/recovery20', n));
const digests = () => Object.fromEntries(fixture.map(p => [p, createHash('sha256').update(readFileSync(p)).digest('hex')]));
const before = digests();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1080 }, recordVideo: { dir: join(destination, 'raw'), size: { width: 1600, height: 1080 } } });
const page = await context.newPage();
const video = page.video();
const started = Date.now();
const chapters = [];
const commands = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let taskId;
await page.setContent(`<!doctype html><html><head><style>
*{box-sizing:border-box}body{margin:0;background:#0d1523;color:#e8effc;font:18px/1.5 system-ui}header{height:150px;padding:18px 28px;border-bottom:1px solid #33445c}small{color:#8fc5ff;font-weight:700;letter-spacing:1px}h1{font-size:28px;margin:5px 0}p{margin:4px 0;color:#c9d5e8}#clock{float:right;color:#adc1db}#terminal{padding:24px 35px}pre{font:19px/1.6 ui-monospace,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere;color:#d9ebff}iframe{width:100%;height:930px;border:0;background:white;display:none}#label{color:#98adc7;font-size:14px}.command{color:#8ce4be}
</style></head><body><header><span id="clock"></span><small>ATSYS • LIVE CONTROLLED RECOVERY • LOCAL BUILD</small><h1 id="title"></h1><p id="caption"></p></header><section id="terminal"><div id="label">Actual command output rendered for recording — not a macOS Terminal capture</div><pre id="output"></pre></section><iframe title="Actual live AtSys dashboard" id="dashboard"></iframe></body></html>`);
await page.evaluate(() => { const t=Date.now(); setInterval(()=>document.getElementById('clock').textContent='Elapsed '+Math.floor((Date.now()-t)/1000)+'s',1000); });
async function chapter(title, caption) {
  chapters.push({seconds:(Date.now()-started)/1000,title,caption});
  await page.locator('#title').evaluate((n,t)=>n.textContent=t,title);
  await page.locator('#caption').evaluate((n,t)=>n.textContent=t,caption);
  console.log(title, caption);
}
async function show(text) { await page.locator('#output').evaluate((n,t)=>n.textContent=t,text); }
async function command(executable,args,cwd=project) {
  const display = '$ '+executable+' '+args.join(' ');
  await show(display+'\n\nRunning…');
  const result = await new Promise((accept,reject)=>{
    const child=spawn(executable,args,{cwd,env:process.env});let output='';
    child.stdout.on('data',d=>{output+=d;});child.stderr.on('data',d=>{output+=d;});
    child.on('error',reject);child.on('close',code=>accept({code,output}));
  });
  commands.push({at:new Date().toISOString(),executable,args,cwd,...result});
  await show(display+'\n\n'+result.output.trim().split('\n').slice(-24).join('\n'));
  assert.equal(result.code,0,result.output);return result.output;
}
let finalTask;
try {
  await chapter('Install AtSys in a fresh environment', 'This installs the locally tested wheel, including unpublished recovery/UI improvements—not a new PyPI release.');
  await sleep(4000);
  const venv=join(destination,'installation-env');
  await command('/opt/homebrew/bin/uv',['venv',venv]); await sleep(3000);
  await command('/opt/homebrew/bin/uv',['pip','install','--python',join(venv,'bin/python'),join(repo,'release/readable-monitor-local/atsys-0.2.0-py3-none-any.whl')]);
  await sleep(5000);
  const atsys=join(venv,'bin/atsys');
  await command(atsys,['--version']); await sleep(3000);
  await chapter('Initialize the isolated project', 'Attach the skill and run the setup pilot. Reuse the healthy watchdog; do not replace the existing service or old benchmark evidence.');
  await command('/usr/bin/git',['init','-q',project]);
  await sleep(3000);
  const init=JSON.parse(await command(atsys,['init','--project',project,'--no-service','--no-dashboard']));
  await show('$ atsys init --project <isolated-project> --no-service --no-dashboard\n\n'+JSON.stringify(init,null,2));
  await sleep(5000);
  await chapter('Configure twenty tasks and independent acceptance', 'Controlled SQLite retrieval fixture. Fault after task 5; 12-second progress timeout; two retries; separate, scoped repair.');
  const configPath=join(support,'task-config.json');
  await command(atsys,['task','template','--project',project,'--objective','Twenty-task controlled recovery walkthrough','--allow-repair','--output',configPath]);
  const config=JSON.parse(readFileSync(join(repo,'.atsys/tasks/recovery20-confirm-20261024.json'),'utf8'));
  config.name='Recorded 20-task recovery walkthrough (controlled fixture)';config.cwd=project;
  config.objective='Record20 controlled local retrieval tasks, intentional stall after5, native supervisor diagnosis and policy-authorized repair, safe resume and independent validation. NOT DolphinBench.';
  writeFileSync(configPath,JSON.stringify(config,null,2));
  await show('Selected task configuration (full JSON saved with this video)\n\n'+JSON.stringify({worker:config.worker,argv:config.argv,validator:config.validator,validationArgv:config.validationArgv,progressFile:config.progressFile,progressTimeoutSeconds:config.progressTimeoutSeconds,recovery:config.recovery,maxRetries:config.maxRetries,allowRepair:config.allowRepair,networkAccess:config.networkAccess},null,2));
  await sleep(9000);
  await chapter('Doctor checks configuration before starting', 'Verify the write/read pilot and executables without running the workload. Then confirm durable watchdog protection.');
  const doctor=JSON.parse(await command(atsys,['doctor','--config',configPath]));
  await show('$ atsys doctor --config task-config.json\n\n'+JSON.stringify({ready:doctor.ready,checks:doctor.checks?.map(c=>({name:c.name,passed:c.passed}))},null,2));
  assert.equal(doctor.ready,true);await sleep(6000);
  await command(atsys,['service','status']);await sleep(5000);
  await chapter('Submit once; observe the actual dashboard', 'The managed worker owns execution. This recorder only watches; it does not repair or restart the task.');
  const submit=JSON.parse(await command(atsys,['task','submit','--config',configPath]));
  taskId=submit.id??submit.task?.id;assert.ok(taskId,'Submission must return a task ID');
  writeFileSync(join(support,'task-id.txt'),taskId+'\n');
  await page.locator('#terminal').evaluate(n=>n.style.display='none');
  await page.locator('#dashboard').evaluate((n,url)=>{n.style.display='block';n.src=url;},base+'/tasks/'+taskId);
  const frame=page.frameLocator('#dashboard');
  await frame.getByRole('button',{name:'Edit task wiring'}).waitFor();
  let lastStage='';
  const deadline=Date.now()+900000;
  while(Date.now()<deadline){
    const state=await(await fetch(base+'/api/operations')).json();
    const t=state.tasks.find(t=>t.id===taskId);assert.ok(t);finalTask=t;
    const progress=t.attempts.findLast(a=>a.phase==='worker'&&a.progress)?.progress;
    const workers=t.attempts.filter(a=>a.phase==='worker');
    const stage=t.status==='completed'?'completed':t.status==='needs_attention'?'blocked':t.status==='supervising'?'supervisor':t.status==='repairing'?'repair':t.status==='validating'?'validator':workers.length>1?'resumed':progress?.completed===5?'fault':'running';
    if(stage!==lastStage){
      const text={running:['Worker executes the twenty retrieval checks','Watch the durable counter advance. The worker saves an application checkpoint after every task.'],fault:['Controlled fault injected at task 5','The engine is disabled. The process is alive and printing, but progress is frozen. No manual intervention.'],supervisor:['Observer detected the stall → supervisor investigates','The deterministic observer stopped the stalled attempt. Native Codex diagnoses read-only and proposes a repair.'],repair:['Policy authorized a separate repair worker','Only engine configuration and its repair receipt may change. Supervisor diagnosis does not itself authorize arbitrary writes.'],resumed:['Resume from the checkpoint, not from the beginning','The engine has been repaired. AtSys runs the declared resume command; tasks 1–5 are not replayed.'],validator:['Independent validator checks the outcome','A worker success message is not enough. Acceptance checks task IDs, correct results, fault injection and repair evidence.'],completed:['Completed — independently validated 20/20','Twenty unique local results; controlled fault recovered. This is supervision evidence, not a DolphinBench accuracy score.'],blocked:['Recovery needs attention','The real task state is preserved. No success is claimed without independent acceptance.']}[stage];
      await chapter(...text);lastStage=stage;
      await page.screenshot({path:join(support,stage+'.png')});
    }
    if(['completed','needs_attention','stopped'].includes(t.status))break;
    await sleep(500);
  }
  writeFileSync(join(support,'task-evidence.json'),JSON.stringify(finalTask,null,2));
  assert.equal(finalTask.status,'completed');
  const events=readFileSync(join(project,'journal.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  const results=events.filter(e=>e.type==='task.completed');
  assert.deepEqual(results.map(e=>e.task_id),Array.from({length:20},(_,i)=>i+1));
  assert.deepEqual(finalTask.attempts.map(a=>a.phase),['worker','supervisor','repair','worker','validator']);
  assert.deepEqual(digests(),before);
  const [first,supervisor,repair,resume,validator]=finalTask.attempts;
  assert.equal(resume.progress.completed,20);assert.equal(validator.validation.passed,true);
  const fault=events.find(e=>e.type==='fault.injected');assert.equal(fault.afterTask,5);
  const seconds=(e,s)=>(Date.parse(e)-Date.parse(s))/1000;
  const audit={kind:'controlled-local-fixture-not-dolphinbench',taskId,status:finalTask.status,completed:results.length,firstFiveNotReplayed:true,manualRepair:false,sourceDigests:before,faultAfterTask:5,detectionSeconds:seconds(first.endedAt,fault.at),diagnosisSeconds:seconds(supervisor.endedAt,supervisor.startedAt),repairSeconds:seconds(repair.endedAt,repair.startedAt),validation:validator.validation};
  writeFileSync(join(support,'audit.json'),JSON.stringify(audit,null,2));
  for(const name of ['result.json','journal.jsonl','repair-receipt.json','progress.json'])copyFileSync(join(project,name),join(support,name));
  await sleep(7000);
  await chapter('Inspect the receipts and final status', 'The full recording, task configuration, journal, validator outcome and source digests are saved together. No old benchmark was modified.');
  await page.locator('#dashboard').evaluate(n=>n.style.display='none');
  await page.locator('#terminal').evaluate(n=>n.style.display='block');
  await command(atsys,['task','status',taskId]);await sleep(9000);
  await show('Verified recovery\n\n'+JSON.stringify(audit,null,2));await sleep(10000);
} finally {
  writeFileSync(join(support,'commands.json'),JSON.stringify(commands,null,2));
  chapters.push({seconds:(Date.now()-started)/1000,title:'End',caption:''});
  writeFileSync(join(support,'chapters.json'),JSON.stringify(chapters,null,2));
  await context.close();
  await video.saveAs(join(destination,'AtSys-full-walkthrough.webm'));
  await browser.close();
  console.log('RECORDING_SAVED',destination,'TASK',taskId);
}
