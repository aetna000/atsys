// CONTROLLED LOCAL MEMORY FIXTURE. Not DolphinBench and not model-quality evidence.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, renameSync, writeFileSync, appendFileSync } from 'node:fs';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value) => { writeFileSync(path + '.pending', JSON.stringify(value, null, 2)); renameSync(path + '.pending', path); };
const journal = (type, fields = {}) => appendFileSync('journal.jsonl', JSON.stringify({at:new Date().toISOString(),type,...fields})+'\n');
const db = new DatabaseSync('fixture.sqlite');
db.exec('CREATE TABLE IF NOT EXISTS memories(id INTEGER PRIMARY KEY, project TEXT NOT NULL, token TEXT NOT NULL UNIQUE, content TEXT NOT NULL); CREATE TABLE IF NOT EXISTS results(task_id INTEGER PRIMARY KEY, actual_id INTEGER NOT NULL, passed INTEGER NOT NULL, completed_at TEXT NOT NULL)');
if (!existsSync('state.json')) {
  for (let id=1; id<=20; id++) db.prepare('INSERT INTO memories VALUES(?,?,?,?)').run(id,'controlled-fixture',`module_${id}`,`Project module_${id} has maintenance rule ${id}.`);
  save('engine.json',{enabled:true});
  save('state.json',{format:'controlled-memory-recovery-v1',completed:0,total:20,faultInjected:false});
  save('progress.json',{completed:0,total:20,checkpoint:'CONTROLLED FIXTURE: local database ready; not DolphinBench'});
  journal('fixture.initialized',{kind:'controlled-local-memory-fixture-not-dolphinbench'});
}
if (process.argv.includes('--preflight')) {
  const state=read('state.json');
  if (!read('engine.json').enabled) throw new Error('engine.json must have enabled=true');
  if (db.prepare('SELECT count(*) AS n FROM results').get().n!==state.completed) throw new Error('checkpoint/results mismatch');
  console.log(`Pilot passed: ${state.completed}/20 durable tasks; engine enabled.`);
  db.close();
  process.exit(0);
}
let waiting=false;
if (read('state.json').completed === 20) { console.log('All20 fixture results already durable; nothing replayed.'); db.close(); process.exit(0); }
const timer=setInterval(()=>{
  const state=read('state.json');
  if (!read('engine.json').enabled) {
    if (!waiting) { journal('fault.waiting',{completed:state.completed}); console.log('CONTROLLED FAULT: engine.json disabled after 5/20. Process alive; progress cannot advance until authorized repair.');waiting=true; }
    else console.log('Waiting for authorized engine configuration repair; no additional task executed.');
    return;
  }
  const id=state.completed+1;
  const actual=db.prepare('SELECT id FROM memories WHERE project=? AND token=?').get('controlled-fixture',`module_${id}`);
  if (!actual) throw new Error('Fixture retrieval unexpectedly returned no result');
  db.prepare('INSERT INTO results VALUES(?,?,?,?)').run(id,actual.id,Number(actual.id===id),new Date().toISOString());
  state.completed=id;
  if (id===5 && !state.faultInjected) {
    state.faultInjected=true;
    save('engine.json',{enabled:false,reason:'Deliberately injected recoverable setup fault after task5'});
    journal('fault.injected',{afterTask:5});
  }
  save('state.json',state);
  save('progress.json',{completed:id,total:20,checkpoint:`CONTROLLED FIXTURE: ${id}/20 local retrieval checks; ${id===5?'fault injected; awaiting observer':id===20?'all results ready for independent validation':'durable receipt saved'}`});
  journal('task.completed',{task_id:id,actual_id:actual.id,passed:actual.id===id});
  console.log(`Task ${String(id).padStart(2,'0')}/20: ${actual.id===id?'PASS':'FAIL'}; checkpoint saved.`);
  if (id===20) {
    clearInterval(timer);
    save('result.json',{kind:'controlled-local-memory-fixture-not-dolphinbench',completed:20,total:20,passed:true,results:db.prepare('SELECT * FROM results ORDER BY task_id').all()});
    console.log('20/20 fixture tasks complete. Independent acceptance still required.');
    db.close();
  }
},2000);
process.on('SIGTERM',()=>{clearInterval(timer);db.close();process.exit(143);});
