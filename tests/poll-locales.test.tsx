import './dom-setup';
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {cleanup,render} from '@testing-library/react';
import {LocaleProvider} from '../src/components/locale-provider';
import {PollDetail,PollEditor} from '../src/components/polls';
import {castPollVote,openLocalPoll,seedPolls} from '../src/lib/polls';
import {readState} from '../src/lib/store';
afterEach(()=>{cleanup();localStorage.clear();});
function remaining(root:HTMLElement){const values:string[]=[];const walker=document.createTreeWalker(root,4);let node:Node|null;while(node=walker.nextNode())if(!node.parentElement?.closest('[translate=no],textarea')&&/[가-힣]/.test(node.textContent??''))values.push(node.textContent!);return values;}
test('poll creation, choice settings, detail images, results and locked editing have complete Vietnamese and English interface copy',()=>{
  const poll=seedPolls[0],actor={id:'member',isAdmin:false},answers=Object.fromEntries(poll.questions.map(q=>[q.id,q.options[0].id])),state=castPollVote(readState(null),poll.id,poll.revision,answers,actor);
  for(const locale of ['vi','en'] as const)for(const child of [<PollEditor key="empty" onSave={async()=>true} onCancel={()=>{}}/>,<PollEditor key="locked" poll={poll} locked onSave={async()=>true} onCancel={()=>{}}/>,<PollDetail key="results" detail={openLocalPoll(state,poll.id,actor)}/>]){cleanup();const ui=render(<LocaleProvider initialLocale={locale}>{child}</LocaleProvider>);assert.deepEqual(remaining(ui.container),[],locale);}
});
