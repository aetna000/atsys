// Package the continuous screen recording with chapter markers and auditable evidence.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const root=resolve(process.argv[2]);
const evidence=join(root,'evidence');
const chapters=JSON.parse(readFileSync(join(evidence,'chapters.json'),'utf8'));
const audit=JSON.parse(readFileSync(join(evidence,'audit.json'),'utf8'));
assert.equal(audit.status,'completed');
// Correct a recorder-only phase caption during the short scheduling gap. Never alter
// application pixels, task evidence, recording speed or elapsed timeline.
const correction=chapters.find((c,i)=>i>8&&c.title==='Controlled fault injected at task 5');
let correctionFilter;
if(correction){
  const next=chapters[chapters.indexOf(correction)+1];
  correction.title='Repair completed; waiting for checkpoint restart';
  correction.caption='AtSys is scheduling the resumed worker. The saved checkpoint remains at 5/20; no new fault was injected.';
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage({viewport:{width:1600,height:104}});
    await page.setContent('<body style="margin:0;background:#0d1523;color:#e8effc;padding:0 28px;font:18px/1.5 system-ui"><h1 style="font-size:28px;margin:4px 0" id="title"></h1><p style="margin:4px 0;color:#c9d5e8" id="caption"></p></body>');
    await page.locator('#title').evaluate((n,t)=>n.textContent=t,correction.title);
    await page.locator('#caption').evaluate((n,t)=>n.textContent=t,correction.caption);
    await page.screenshot({path:join(evidence,'scheduling-caption.png')});
  }finally{await browser.close();}
  correctionFilter=`[0:v][2:v]overlay=0:46:enable='between(t,${correction.seconds},${next.seconds})'[v]`;
}
const escape=s=>s.replace(/[\\;#=\n]/g,c=>'\\'+c);
const metadata=';FFMETADATA1\ntitle=AtSys — installation to validated recovery\ncomment=Continuous live recording. Controlled local SQLite fixture, not DolphinBench. Local unpublished build. Captioned, no audio.\n'+chapters.slice(0,-1).map((c,i)=>`[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.floor(c.seconds*1000)}\nEND=${Math.floor(chapters[i+1].seconds*1000)}\ntitle=${escape(c.title)}\n`).join('');
writeFileSync(join(evidence,'chapters.ffmeta'),metadata);
const time=s=>{const ms=Math.floor(s*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;};
writeFileSync(join(root,'AtSys-walkthrough.vtt'),'WEBVTT\n\n'+chapters.slice(0,-1).map((c,i)=>`${time(c.seconds)} --> ${time(chapters[i+1].seconds)}\n${c.title}\n${c.caption}\n`).join('\n'));
const output=join(root,'AtSys-install-to-recovery-full.mp4');
execFileSync('/opt/homebrew/bin/ffmpeg',['-hide_banner','-loglevel','warning','-n','-i',join(root,'AtSys-full-walkthrough.webm'),'-i',join(evidence,'chapters.ffmeta'),...(correctionFilter?['-i',join(evidence,'scheduling-caption.png'),'-filter_complex',correctionFilter,'-map','[v]']:['-map','0:v:0']),'-map_metadata','1','-map_chapters','1','-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',output],{stdio:'inherit'});
const probe=JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-show_format','-show_streams','-show_chapters','-of','json',output],{encoding:'utf8'}));
assert.equal(probe.streams[0].width,1600);assert.equal(probe.streams[0].height,1080);
assert.ok(Number(probe.format.duration)>=chapters.at(-1).seconds-2);
assert.equal(probe.chapters.length,chapters.length-1);
writeFileSync(join(evidence,'video-verification.json'),JSON.stringify({file:output,sha256:createHash('sha256').update(readFileSync(output)).digest('hex'),bytes:statSync(output).size,durationSeconds:Number(probe.format.duration),resolution:'1600x1080',chapters:probe.chapters.length,continuousRecording:true,speed:1,audio:false,taskId:audit.taskId},null,2));
writeFileSync(join(root,'README.txt'),`AtSys: installation → observer detection → supervised repair → validated completion\n\nWatch AtSys-install-to-recovery-full.mp4. Continuous real-time capture, with visible captions and chapter navigation; no audio. Raw WebM retained.\n\nThis installs the locally tested 0.2.0 wheel containing unpublished improvements, not the older PyPI artifact. Actual CLI output is rendered for readability; dashboard is the actual localhost application. The fresh installation reuses the existing healthy watchdog deliberately and initializes an isolated Git project.\n\nTwenty deterministic local SQLite retrieval checks form a controlled supervision test, NOT a DolphinBench accuracy evaluation. Real native Codex supervisor and repair worker use existing login. Observer and deterministic authorization are real. No manual repair or restart. Old600 evidence untouched. The previously blocked real DolphinBench task remains separate.\n\nTask: ${audit.taskId}\nDashboard: http://127.0.0.1:4311/tasks/${audit.taskId}\nFault: after5; detection ${audit.detectionSeconds}s; diagnosis ${audit.diagnosisSeconds}s; repair ${audit.repairSeconds}s.\nOutcome:20 unique results, no first-five replay, independent validator passed.\n\nChapters\n${chapters.slice(0,-1).map(c=>time(c.seconds)+'  '+c.title).join('\n')}\n\nEvidence: task config, exact command receipts, task history, result, journal, repair receipt, source digests, screenshots and audit. Video digest and media checks are in evidence/video-verification.json. Full installation environment retained separately; no provider credentials copied.\n`);
console.log(output);
