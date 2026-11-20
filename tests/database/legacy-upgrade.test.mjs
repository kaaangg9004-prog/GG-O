import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
test('all existing migrations upgrade to the new private RPC model without retaining column grants or old comment writers',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create schema extensions;
 create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb not null default '{}',raw_user_meta_data jsonb not null default '{}');
 create table auth.identities(user_id uuid references auth.users(id),provider text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text);
 alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;`);
 const directory=new URL('../../supabase/migrations/',import.meta.url),files=readdirSync(directory).filter(f=>f.endsWith('.sql')).sort();
 for(const file of files)await db.exec(readFileSync(new URL(file,directory),'utf8'));
 const privileges=(await db.query("select has_column_privilege('anon','public.posts','user_id','SELECT') private,has_column_privilege('anon','public.posts','title','SELECT') old_column,has_function_privilege('authenticated','public.poll_comment(text,text)','EXECUTE') old_write,has_function_privilege('authenticated','public.anonymous_trusted_write(uuid,inet,text,jsonb)','EXECUTE') trusted_write")).rows[0];assert.deepEqual(privileges,{private:false,old_column:false,old_write:false,trusted_write:false});
 await db.exec('set role anon');const feed=await db.query('select public.anonymous_posts() feed');assert.deepEqual(feed.rows[0].feed,[]);await db.exec('reset role');
 }finally{await db.close();}
});
