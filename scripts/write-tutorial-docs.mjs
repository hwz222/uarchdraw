// Keep complete code listings synchronized with their executable checkpoint files.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const directory=resolve(import.meta.dirname,'../examples/tutorials');
const course=JSON.parse(readFileSync(resolve(directory,'course.json'),'utf8'));
const source=entry=>readFileSync(resolve(directory,entry.source),'utf8').trimEnd();
const flags=entry=>entry.view?.overview?' --overview':entry.view?.focus?' --focus '+entry.view.focus:'';
const list=items=>items.map(t=>'- '+t).join('\n');
const code=entry=>'```text\n'+source(entry)+'\n```';
const images=entry=>`![${entry.title??'Exercise result'}](images/${entry.id}.png)`;
const plural=(n,word)=>n+' '+word+(n===1?'':'s');
const counts=entry=>`**Checkpoint:** ${plural(entry.checks.symbols,'symbol')} and ${plural(entry.checks.nets,'named net')}${entry.checks.sinks!==undefined?', '+plural(entry.checks.sinks,'receiving port'):''}.`;
for(const [index,lesson] of course.lessons.entries()){
  const prev=index?`[Previous: ${course.lessons[index-1].title}](${course.lessons[index-1].id}.md)`:'[Setup](README.md#setup)';
  const next=index+1<course.lessons.length?`[Next: ${course.lessons[index+1].title}](${course.lessons[index+1].id}.md)`:'[Next: advanced reference diagrams](../README.md)';
  const parts=[`# Lesson ${lesson.id}: ${lesson.title}`,`[Course](README.md) · ${prev} · ${next}`,
    `**Goal:** ${lesson.goal}`,'## Before you start',list(lesson.prerequisites),
    'Run every command from the repository root after building. Use a plain-text editor. For each step, replace the contents of `work.uarch` with the complete source below. These are runnable checkpoints, not fragments to paste blindly into the previous file. Keep your own edits in `work.uarch`; the checked-in checkpoint is your recovery copy.'];
  for(const [i,entry] of lesson.steps.entries()){
    parts.push(`## Step ${i+1}: ${entry.title}`,list(entry.learn),`[Complete checkpoint source](${entry.source})`,code(entry),
      '### Run it',`\`\`\`sh\nnode dist/cli.js check work.uarch${flags(entry)}\nnode dist/cli.js render work.uarch -o output/tutorial-work${flags(entry)}\n\`\`\``,
      'Open `output/tutorial-work.svg` or `output/tutorial-work.png`. Refresh the viewer after each successful render. Compare your result with this image; a different output folder does not change the diagram.',
      '### What you should see',counts(entry),list(entry.observe),images(entry));
  }
  if(lesson.errors.length){
    parts.push('## Make a mistake and repair it','Try these deliberately broken copies separately from your working file. `check` must exit with status 1 and print the named error; it does not write diagrams. An old preview is not evidence that a failed command succeeded.');
    for(const entry of lesson.errors){
      parts.push(`### ${entry.title}`,`[Deliberately faulty source](${entry.source})`,
        `\`\`\`sh\nnode dist/cli.js check examples/tutorials/${entry.source}${entry.flags.length?' '+entry.flags.join(' '):''}\n\`\`\``,
        `**Expected error fragment:** \`${entry.expected}\`.`,list(entry.explanation));
    }
    parts.push('After trying the repair in `work.uarch`, run its normal `check` and `render` commands again. Recover by pasting the matching successful checkpoint if needed.');
  }
  const exercise={...lesson.exercise,id:'solution-'+lesson.id,title:'Lesson '+lesson.id+' exercise result'};
  parts.push('## Try it yourself',exercise.task,'Make the change in `work.uarch`, then check, render and inspect it before opening the answer.',
    '<details>\n<summary>Show the complete answer and expected image</summary>',`[Runnable answer](${exercise.source})`,list(exercise.explanation),code(exercise),
    `\`\`\`sh\nnode dist/cli.js render examples/tutorials/${exercise.source}${flags(exercise)} -o output/tutorial-answer-${lesson.id}\n\`\`\``,counts(exercise),images(exercise),'</details>',
    '## Before you move on','Explain these points using your own drawing:',list(lesson.reviewQuestions),
    `Confirm the visible result, not just the command exit code. ${next}.`);
  writeFileSync(resolve(directory,lesson.id+'.md'),parts.join('\n\n')+'\n');
}
console.log(`${course.lessons.length} lesson documents synchronized with complete sources.`);
