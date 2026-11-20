import test from 'node:test';
import assert from 'node:assert/strict';
import {demoMemberActivity} from '../src/lib/site-admin';
import {readState} from '../src/lib/store';
import type {Post} from '../src/lib/types';
test('member activity separates accounts, counts board/poll comments and received resolved reports',()=>{
 const state=readState(null);state.deviceKey='device';
 const posts:Post[]=[{id:'p',ownerKey:'device',title:'test',caption:'body',topic:'자유',image:'',tags:[],likes:0,views:0,createdAt:'2026-11-16',comments:[{id:'c',ownerKey:'device:BBBB',text:'comment',createdAt:'2026-11-16'}]}];
 state.pollComments=[{id:'pc',pollId:'poll',userKey:'demo:device',text:'opinion',createdAt:''}];
 state.pollBallots=[{pollId:'poll',userKey:'demo:device',answers:{},revision:1,createdAt:''}];
 state.reports=[{id:'r',target:{postId:'p'},reason:'기타',detail:'',excerpt:'',createdAt:'',status:'dismissed'},{id:'r2',target:{postId:'p',commentId:'c'},reason:'기타',detail:'',excerpt:'',createdAt:'',status:'hidden'}];
 state.hiddenPosts=['p'];state.deletedPosts=['p'];state.hiddenComments=['c'];
 assert.deepEqual(demoMemberActivity(state,'AAAA',posts),{post_count:1,comment_count:1,poll_count:1,received_report_count:1});
 assert.deepEqual(demoMemberActivity(state,'BBBB',posts),{post_count:0,comment_count:1,poll_count:0,received_report_count:1});
});
