import './dom-setup';
import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanup,fireEvent,render,waitFor,within} from '@testing-library/react';
import {SupportBoard} from '../src/components/support';
import type {SupportGateway,SupportTicket} from '../src/lib/support-types';
import {LocaleProvider} from '../src/components/locale-provider';

test('opening a support ticket preserves its queue and saving a reply completes it',async()=>{
  let operator=true;
  let status:SupportTicket['status']='waiting';
  const ticket=()=>({id:'qa-ticket',ownerId:'owner',authorId:'회원',title:'문의 시험',category:'일반 문의' as const,status,createdAt:'2026-11-24T00:00:00Z',updatedAt:'2026-11-24T00:00:00Z'});
  const member=()=>({id:operator?'admin':'owner',handle:'시험 계정',joinedAt:'2026-11-24T00:00:00Z',orders:[],demo:false});
  const gateway:SupportGateway={
    mode:'server',access:async()=>({isAdmin:operator}),list:async()=>[ticket()],
    open:async()=>({ticket:ticket(),body:'가상 문의 본문',replies:[]}),
    create:async()=>ticket().id,member:async()=>member(),
    reply:async()=>{status='answered';},
    complete:async()=>{status='answered';},
  };
  try{
    let ui=render(<SupportBoard isDemoAccount={false} member={member} gateway={gateway}/>);
    fireEvent.click(await ui.findByRole('button',{name:'문의 시험'}));
    const dialog=within(ui.getByRole('dialog'));
    await dialog.findByText('가상 문의 본문');
    assert.equal(status,'waiting');
    fireEvent.change(dialog.getByLabelText('운영자 답변 작성'),{target:{value:'가상 답변'}});
    fireEvent.click(dialog.getByRole('button',{name:'답변 등록'}));
    await dialog.findByText('답변 완료');
    assert.equal(dialog.queryByRole('button',{name:'만족'}),null);
    fireEvent.click(dialog.getByRole('button',{name:'닫기'}));
    await ui.findByText('새로운 문의가 없습니다.');
    fireEvent.click(within(ui.getByRole('group',{name:'문의 상태'})).getByRole('button',{name:/답변 완료/}));
    await ui.findByRole('button',{name:'문의 시험'});
    cleanup();
    operator=false;
    ui=render(<LocaleProvider initialLocale="vi"><SupportBoard isDemoAccount={false} member={member} gateway={gateway}/></LocaleProvider>);
    fireEvent.click(await ui.findByRole('button',{name:'문의 시험'}));
    const form=ui.getByRole('dialog').querySelector('form')!;
    fireEvent.change(form.querySelector('input')!,{target:{value:'fixture123'}});
    fireEvent.submit(form);
    assert.equal(ui.queryByRole('button',{name:'Hài lòng'}),null);
    await waitFor(()=>assert.equal(status,'answered'));
    await within(ui.getByRole('dialog')).findByText('Đã phản hồi');
  }finally{cleanup();localStorage.clear();}
});
