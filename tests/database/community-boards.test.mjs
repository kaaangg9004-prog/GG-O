import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

test('board management preserves old posts and guards metadata changes on the server', async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const admin = 'a0000000-0000-4000-8000-000000000001';
  const member = 'a0000000-0000-4000-8000-000000000002';
  const directory = new URL('../../supabase/migrations/', import.meta.url);
  async function call(role, user, name, args) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? '']);
    await db.exec('set role ' + role);
    try {
      const result = await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args);
      return result.rows[0].value;
    } finally {
      await db.exec('reset role');
    }
  }
  const manage = (action, data, user = admin) => call('authenticated', user, 'community_board_manage', [action, data]);
  const write = (action, data) => call('service_role', null, 'anonymous_trusted_write', [member, null, action, data]);
  const read = (name, args) => call('anon', null, name, args);

  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage; create schema extensions;
      create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb not null default '{}',raw_user_meta_data jsonb not null default '{}');
      create table auth.identities(user_id uuid references auth.users(id),provider text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;`);
    const files = readdirSync(directory).filter(file => file.endsWith('.sql')).sort();
    const index = files.findIndex(file => file.endsWith('_community_board_management.sql'));
    assert.ok(index >= 0);
    const migration = files[index];
    for (const file of files.slice(0, index)) await db.exec(readFileSync(new URL(file, directory), 'utf8'));
    for (const id of [admin, member]) {
      await db.query("insert into auth.users(id,email,raw_app_meta_data) values($1,$2,'{\"provider\":\"google\"}')", [id, id + '@example.test']);
      await db.query("insert into auth.identities values($1,'google')", [id]);
    }
    await db.query("update public.profiles set role='admin' where id=$1", [admin]);
    const old = await write('post.create', { title: '기존 게시글', body: '보관할 본문', topic: '자유' });
    await write('comment.create', { post_id: old.id, body: '보관할 댓글' });
    await db.exec(readFileSync(new URL(migration, directory), 'utf8'));
    assert.equal((await read('anonymous_post', [old.id])).title, '기존 게시글');
    assert.equal((await read('anonymous_comments', ['post', old.id]))[0].body, '보관할 댓글');

    await assert.rejects(manage('board.create', { board: '일정' }, member), /GGO_ADMIN_REQUIRED/);
    await assert.rejects(call('authenticated', member, 'community_board_catalog', [true]), /GGO_ADMIN_REQUIRED/);
    await manage('board.create', { board: '일정', position: 1 });
    await manage('board.create', { board: '사진', position: 2 });
    await manage('prefix.save', { board: '일정', label: '정보', color: '#126734' });
    await assert.rejects(manage('prefix.save', { board: '일정', label: '공지', color: '#126734' }), /GGO_INVALID_INPUT/);
    const prefix = (await read('community_board_catalog', [false]))[0].prefixes[0];
    assert.equal(prefix.color, '#126734');
    await assert.rejects(write('post.create', { title: '다른 분류', body: '맞지 않는 말머리', topic: '사진', prefix_id: prefix.id }), /GGO_INVALID_INPUT/);

    const post = await write('post.create', { title: '다음 일정', body: '날짜를 확인하세요', topic: '일정', prefix_id: prefix.id });
    await manage('notice.create', { board: '일정', title: '게시판 공지', body: '안내 사항입니다' });
    await manage('post.pin', { board: '일정', id: post.id, rank: 1 });
    let highlights = await read('community_board_highlights', ['일정']);
    assert.deepEqual(highlights.map(row => row.title), ['게시판 공지', '다음 일정']);
    assert.deepEqual(await read('community_board_highlights', ['사진']), []);
    assert.equal(highlights[1].prefix.label, '정보');
    assert.ok(!('user_id' in highlights[1]));

    await manage('prefix.archive', { board: '일정', id: prefix.id });
    assert.deepEqual((await read('community_board_catalog', [false]))[0].prefixes, []);
    assert.equal((await read('anonymous_post', [post.id])).prefix.label, '정보');
    await assert.rejects(write('post.create', { title: '새 글', body: '비활성 말머리', topic: '일정', prefix_id: prefix.id }), /GGO_INVALID_INPUT/);
    await manage('notice.archive', { board: '일정', id: highlights[0].id });
    await manage('post.pin', { board: '일정', id: post.id, rank: null });
    highlights = await read('community_board_highlights', ['일정']);
    assert.deepEqual(highlights, []);
    await manage('board.update', { board: '일정', active: false });
    assert.ok(!(await read('anonymous_feed', ['전체'])).some(row => row.id === post.id));
    await assert.rejects(read('anonymous_post', [post.id]), /GGO_NOT_FOUND/);
    await manage('board.update', { board: '일정', active: true });
    assert.equal((await read('anonymous_post', [post.id])).title, '다음 일정');
  } finally {
    await db.close();
  }
});
