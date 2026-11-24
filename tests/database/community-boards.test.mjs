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
      create table auth.users(id uuid primary key,email text,created_at timestamptz not null default now(),raw_app_meta_data jsonb not null default '{}',raw_user_meta_data jsonb not null default '{}');
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
    const authorMigration = files.find(file => file.endsWith('_community_post_author_admin.sql'));
    assert.ok(authorMigration);
    await db.exec(readFileSync(new URL(authorMigration, directory), 'utf8'));
    const author = await call('authenticated', admin, 'site_admin_post_author', [old.id]);
    assert.equal(author.id, member);
    assert.equal(author.email, member + '@example.test');
    await assert.rejects(call('authenticated', member, 'site_admin_post_author', [old.id]), /GGO_ADMIN_REQUIRED/);
    await assert.rejects(read('site_admin_post_author', [old.id]), /permission denied/);
    const privileges = await db.query(`select
      has_column_privilege('authenticated','public.posts','user_id','SELECT') as member,
      has_column_privilege('anon','public.posts','user_id','SELECT') as guest`);
    assert.deepEqual(privileges.rows[0], { member: false, guest: false });
    const anonymousPost = await read('anonymous_post', [old.id]);
    assert.equal('user_id' in anonymousPost, false);
    assert.equal('email' in anonymousPost, false);
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

    const postAction = (action, topic = null, user = admin) =>
      call('authenticated', user, 'site_admin_post_action', [post.id, action, topic]);
    await assert.rejects(postAction('hide', null, member), /GGO_ADMIN_REQUIRED/);
    await postAction('category', '사진');
    assert.equal((await read('anonymous_post', [post.id])).topic, '사진');
    await postAction('hide');
    await assert.rejects(read('anonymous_post', [post.id]), /GGO_NOT_FOUND/);
    await postAction('restore');
    await postAction('delete');
    await assert.rejects(read('anonymous_post', [post.id]), /GGO_NOT_FOUND/);
    await postAction('restore');
    assert.equal((await read('anonymous_post', [post.id])).title, '다음 일정');

    const styleMigration = files.find(file => file.endsWith('_community_post_style.sql'));
    assert.ok(styleMigration);
    await db.exec(readFileSync(new URL(styleMigration, directory), 'utf8'));
    await manage('board.create', { board: '새 게시판' });
    const adminCatalog = await call('authenticated', admin, 'community_board_catalog', [false]);
    const defaults = { '공지': '#c23147', '정보': '#3567c3', '핫템': '#b65b27', '사진': '#161616' };
    for (const board of adminCatalog) {
      for (const [label, color] of Object.entries(defaults)) {
        assert.equal(board.prefixes.find(item => item.label === label)?.color, color);
      }
    }
    const memberCatalog = await call('authenticated', member, 'community_board_catalog', [false]);
    assert.ok(memberCatalog.every(board => board.prefixes.every(item => item.label !== '공지')));
    const notice = adminCatalog.find(board => board.name === '자유').prefixes.find(item => item.label === '공지');
    await assert.rejects(write('post.update', { id: old.id, title: '기존 게시글', body: '보관할 본문', prefix_id: notice.id }), /GGO_ADMIN_REQUIRED/);
    await write('post.update', { id: old.id, title: '기존 게시글', body: '보관할 본문', body_size: 'large', body_color: '#24556b' });
    const styled = await read('anonymous_post', [old.id]);
    assert.equal(styled.body_size, 'large');
    assert.equal(styled.body_color, '#24556b');
    await assert.rejects(write('post.update', { id: old.id, title: '기존 게시글', body: '보관할 본문', body_color: 'invalid' }), /check constraint/);
    const adminNotice = await call('service_role', null, 'anonymous_trusted_write', [admin, null, 'post.create', {
      title: '운영자 공지', body: '운영자 게시글', topic: '자유', prefix_id: notice.id,
    }]);
    assert.equal((await read('anonymous_post', [adminNotice.id])).prefix.label, '공지');

    const imageMigration = files.find(file => file.endsWith('_community_post_images.sql'));
    assert.ok(imageMigration);
    await db.exec(readFileSync(new URL(imageMigration, directory), 'utf8'));
    const imagePath = 'a0000000-0000-4000-8000-000000000003.webp';
    await db.query("insert into storage.objects(bucket_id,name,owner_id) values('community-inline-media',$1,$2)", [imagePath, member]);
    await db.exec('grant select on storage.objects to anon');
    const visibleImages = async () => {
      await db.exec('set role anon');
      try {
        return (await db.query("select name from storage.objects where bucket_id='community-inline-media'")).rows;
      } finally {
        await db.exec('reset role');
      }
    };
    assert.deepEqual(await visibleImages(), []);
    const images = [{ path: imagePath, offset: 2, width: 55 }];
    await assert.rejects(call('service_role', null, 'anonymous_trusted_write', [admin, null, 'post.update', {
      id: adminNotice.id, title: '운영자 공지', body: '운영자 게시글', images,
    }]), /GGO_INVALID_INPUT/);
    await write('post.update', { id: old.id, title: '기존 게시글', body: '윗글아랫글', images });
    assert.deepEqual((await read('anonymous_post', [old.id])).images, images);
    assert.deepEqual(await visibleImages(), [{ name: imagePath }]);
    await call('authenticated', admin, 'site_admin_post_action', [old.id, 'hide', null]);
    assert.deepEqual(await visibleImages(), []);

    const orderMigration = files.find(file => file.endsWith('_reorder_community_boards.sql'));
    assert.ok(orderMigration);
    await db.exec(readFileSync(new URL(orderMigration, directory), 'utf8'));
    await manage('board.create', { board: '가 게시판', position: 0 });
    await manage('board.create', { board: '나 게시판', position: 0 });
    const order = async () => (await read('community_board_catalog', [false])).map(board => board.name);
    const before = await order();
    const boardIndex = before.indexOf('나 게시판');
    const expected = [...before];
    [expected[boardIndex - 1], expected[boardIndex]] = [expected[boardIndex], expected[boardIndex - 1]];
    const move = (board, step, user = admin) => call('authenticated', user, 'community_board_move', [board, step]);
    await assert.rejects(move('나 게시판', -1, member), /GGO_ADMIN_REQUIRED/);
    await move('나 게시판', -1);
    assert.deepEqual(await order(), expected);
    await move('나 게시판', 1);
    await move(before[0], -1);
    assert.deepEqual(await order(), before);

    const hashtagsMigration = files.find(file => file.endsWith('_community_hashtags.sql'));
    assert.ok(hashtagsMigration);
    await db.exec(readFileSync(new URL(hashtagsMigration, directory), 'utf8'));
    await write('post.update', { id: post.id, title: '다음 일정', body: '날짜를 확인하세요', hashtags: '#여행 #맛집, Seoul #SEOUL' });
    assert.deepEqual((await read('anonymous_post', [post.id])).tags, ['여행', '맛집', 'Seoul']);
    for (const term of ['#여행', '여행', '#seoul']) {
      assert.deepEqual((await read('anonymous_feed', ['사진', 30, null, null, term])).map(row => row.id), [post.id]);
    }
    assert.deepEqual(await read('anonymous_feed', ['사진', 30, null, null, '#여']), []);
    await assert.rejects(write('post.update', { id: post.id, title: '다음 일정', body: '날짜를 확인하세요', hashtags: 'a b c d e f g' }), /GGO_INVALID_INPUT/);
    await write('post.update', { id: post.id, title: '다음 일정', body: '날짜를 확인하세요' });
    assert.deepEqual((await read('anonymous_post', [post.id])).tags, ['여행', '맛집', 'Seoul']);
    await write('post.update', { id: post.id, title: '다음 일정', body: '날짜를 확인하세요', hashtags: '' });
    assert.deepEqual(await read('anonymous_feed', ['사진', 30, null, null, '#여행']), []);

    const translationMigration = files.find(file => file.endsWith('_community_translations.sql'));
    assert.ok(translationMigration);
    await db.exec(readFileSync(new URL(translationMigration, directory), 'utf8'));
    await manage('board.create', { board: '여행', label_vi: 'Du lịch', label_en: 'Travel' });
    await manage('board.update', { board: '여행', label_ko: '여행 이야기' });
    const translatedBoard = (await read('community_board_catalog', [false])).find(board => board.name === '여행');
    assert.deepEqual(translatedBoard.labels, { ko: '여행 이야기', vi: 'Du lịch', en: 'Travel' });
    const translations = { vi: { title: 'Thông báo mới', body: 'Vui lòng đọc thông báo.' } };
    await manage('notice.create', { board: '여행', title: '알려드립니다', body: '한국어 공지 내용', translations });
    const [translatedNotice] = await read('community_board_highlights', ['여행']);
    assert.equal(translatedNotice.title, '알려드립니다');
    assert.deepEqual(translatedNotice.notice_translations, translations);
    await assert.rejects(manage('notice.update', { board: '여행', id: translatedNotice.id, title: '알려드립니다', body: '한국어 공지 내용', translations }, member), /GGO_ADMIN_REQUIRED/);

    const videoMigration = files.find(file => file.endsWith('_community_post_videos.sql'));
    assert.ok(videoMigration);
    await db.exec(readFileSync(new URL(videoMigration, directory), 'utf8'));
    const videoPath = 'a0000000-0000-4000-8000-000000000004.mp4';
    await db.query("insert into storage.objects(bucket_id,name,owner_id) values('community-inline-media',$1,$2)", [videoPath, member]);
    const video = { path: videoPath, offset: 0, width: 100 };
    await write('post.update', { id: post.id, title: '다음 일정', body: '영상 본문', images: [video] });
    assert.deepEqual((await read('anonymous_post', [post.id])).images, [video]);
    assert.deepEqual(await visibleImages(), [{ name: videoPath }]);
    await postAction('hide');
    assert.deepEqual(await visibleImages(), []);

    const deletionMigration = files.find(file => file.endsWith('_delete_empty_community_board.sql'));
    assert.ok(deletionMigration);
    await db.exec(readFileSync(new URL(deletionMigration, directory), 'utf8'));
    const deleteBoard = (board, user = admin) => call('authenticated', user, 'community_board_delete_empty', [board]);
    await assert.rejects(deleteBoard('새 게시판', member), /GGO_ADMIN_REQUIRED/);
    await assert.rejects(deleteBoard('사진'), /GGO_BOARD_NOT_EMPTY/);
    await assert.rejects(deleteBoard('여행'), /GGO_BOARD_NOT_EMPTY/);
    await deleteBoard('새 게시판');
    assert.ok(!(await order()).includes('새 게시판'));
    await manage('board.create', { board: '새 게시판' });
    assert.ok((await order()).includes('새 게시판'));

    const rolesMigration = files.find(file => file.endsWith('_community_admin_member_roles.sql'));
    assert.ok(rolesMigration);
    await db.exec(readFileSync(new URL(rolesMigration, directory), 'utf8'));
    const adminCall = (user, name, args) => call('authenticated', user, name, args);
    const changeRole = (actor, target, role) => adminCall(actor, 'site_admin_change_member_role', [target, role]);
    const search = (actor, query) => adminCall(actor, 'site_admin_search_members', [query, 50, 0]);
    assert.deepEqual((await search(admin, member + '@EXAMPLE.TEST')).map(row => row.id), [member]);
    assert.deepEqual((await search(admin, member)).map(row => row.id), [member]);
    await assert.rejects(search(member, '@example.test'), /GGO_ADMIN_REQUIRED/);
    await assert.rejects(changeRole(admin, admin, 'user'), /GGO_SELF_ROLE_CHANGE/);
    await assert.rejects(changeRole(member, admin, 'user'), /GGO_ADMIN_REQUIRED/);
    await changeRole(admin, member, 'admin');
    assert.equal((await adminCall(member, 'anonymous_access', [])).is_admin, true);
    assert.equal((await search(member, admin)).length, 1);
    await manage('board.update', { board: '새 게시판', position: 5 }, member);
    await adminCall(admin, 'site_admin_post_action', [old.id, 'restore', null]);
    const postByAdmin = await read('anonymous_post', [old.id]);
    assert.equal(postByAdmin.is_admin_author, true);
    assert.equal('user_id' in postByAdmin, false);
    assert.equal((await read('anonymous_comments', ['post', old.id]))[0].is_admin_author, true);
    await changeRole(admin, member, 'user');
    assert.equal((await adminCall(member, 'anonymous_access', [])).is_admin, false);
    await assert.rejects(search(member, admin), /GGO_ADMIN_REQUIRED/);
    await assert.rejects(manage('board.update', { board: '새 게시판', position: 6 }, member), /GGO_ADMIN_REQUIRED/);
    assert.equal((await read('anonymous_post', [old.id])).is_admin_author, false);
    assert.equal((await read('anonymous_comments', ['post', old.id]))[0].is_admin_author, false);

    const basicInfoMigration = files.find(file => file.endsWith('_admin_member_basic_info.sql'));
    assert.ok(basicInfoMigration);
    await db.exec(readFileSync(new URL(basicInfoMigration, directory), 'utf8'));
    await db.query("update auth.users set created_at=$2, raw_user_meta_data=$3 where id=$1", [member, '2026-11-20T02:00:00Z', { full_name: 'QA Sample Member', gender: 'female', phone: 'test-only' }]);
    const [found] = await search(admin, 'sample member');
    assert.equal(found.name, 'QA Sample Member');
    assert.equal(found.gender, 'female');
    assert.equal(new Date(found.created_at).toISOString(), '2026-11-20T02:00:00.000Z');
    assert.equal('phone' in found, false);
    assert.equal((await search(admin, admin))[0].gender, null);
    await assert.rejects(search(member, 'sample member'), /GGO_ADMIN_REQUIRED/);
    assert.equal((await adminCall(admin, 'site_admin_post_author', [old.id])).name, 'QA Sample Member');

    await adminCall(admin, 'site_admin_post_action', [post.id, 'delete', null]);
    const archiveMigration = files.find(file => file.endsWith('_separate_archived_community_content.sql'));
    assert.ok(archiveMigration);
    await db.exec(readFileSync(new URL(archiveMigration, directory), 'utf8'));
    const listContent = (section, user = admin) => adminCall(user, 'site_admin_community_content', [section, 50, 0]);
    await assert.rejects(listContent('deleted_posts', member), /GGO_ADMIN_REQUIRED/);
    assert.ok((await listContent('deleted_posts')).some(item => item.id === post.id && item.topic === '사진'));
    assert.ok(!(await listContent('posts')).some(item => item.id === post.id));
    await deleteBoard('사진');
    assert.ok(!(await order()).includes('사진'));
    await assert.rejects(adminCall(admin, 'site_admin_post_action', [post.id, 'restore', null]), /GGO_RESTORE_BOARD_REQUIRED/);
    await adminCall(admin, 'site_admin_post_action', [post.id, 'restore', '자유']);
    assert.equal((await read('anonymous_post', [post.id])).topic, '자유');
    const oldComment = (await listContent('comments')).find(item => item.post_title === '기존 게시글');
    await write('comment.delete', { id: oldComment.id });
    assert.ok((await listContent('deleted_comments')).some(item => item.id === oldComment.id));
    assert.ok(!(await listContent('comments')).some(item => item.id === oldComment.id));
    await adminCall(admin, 'site_admin_post_action', [old.id, 'delete', null]);
    const archived = await db.query('select topic,archived_topic from public.posts where id=$1', [old.id]);
    assert.deepEqual(archived.rows[0], { topic: null, archived_topic: '자유' });
  } finally {
    await db.close();
  }
});
