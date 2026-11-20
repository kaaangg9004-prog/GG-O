-- GG-O foundation. Apply to a NEW Supabase project after selecting the owner project.
-- No payment provider, paid resource, or real order is created by this migration.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_.]{3,24}$'),
  display_name text not null check (char_length(display_name) between 2 and 40),
  bio text not null default '' check (char_length(bio) <= 160),
  avatar_path text,
  created_at timestamptz not null default now()
);

-- Roles are separate from editable profiles. No client may assign its own role.
create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','moderator'))
);
create function public.is_admin() returns boolean language sql stable security definer
set search_path = '' as $$
  select exists(select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin');
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create function public.handle_new_user() returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  insert into public.profiles(id, handle, display_name)
  values (new.id, 'ggo_' || substr(replace(new.id::text,'-',''),1,16),
    case when char_length(trim(new.raw_user_meta_data->>'display_name')) between 2 and 40
      then trim(new.raw_user_meta_data->>'display_name') else 'GG-O Friend' end);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.products (
  id text primary key,
  name text not null, brand text not null,
  category text not null check (category in ('beauty','accessories','lifestyle')),
  price_vnd bigint not null check (price_vnd > 0),
  original_price_vnd bigint check (original_price_vnd >= price_vnd),
  description text not null,
  image_path text not null,
  variants text[] not null check (cardinality(variants) > 0),
  stock integer not null default 0 check (stock >= 0),
  active boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.cart_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  variant text not null,
  quantity integer not null check (quantity between 1 and 99),
  primary key(user_id, product_id, variant)
);
create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,product_id)
);
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  caption text not null check (char_length(trim(caption)) between 3 and 1500),
  image_path text not null,
  topic text not null check (topic in ('Style','Beauty','Life')),
  tags text[] not null default '{}' check (cardinality(tags) <= 6),
  status text not null default 'published' check (status in ('published','hidden')),
  created_at timestamptz not null default now()
);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create table public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key(post_id,user_id)
);
create table public.saved_posts (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key(post_id,user_id)
);
create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(follower_id,following_id), check(follower_id <> following_id)
);
create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  primary key(blocker_id,blocked_id), check(blocker_id <> blocked_id)
);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  status text not null default 'pending' check(status in ('pending','reviewed')),
  created_at timestamptz not null default now(), unique(reporter_id,post_id)
);

-- Orders are read-only to clients. Trusted server checkout/webhooks must calculate
-- prices, shipping, taxes, stock and payment status before inserting/updating.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  status text not null default 'pending' check(status in ('pending','paid','processing','shipped','delivered','cancelled','refunded')),
  currency text not null default 'VND' check(currency='VND'),
  subtotal_vnd bigint not null check(subtotal_vnd >= 0),
  shipping_vnd bigint not null check(shipping_vnd >= 0),
  tax_vnd bigint not null check(tax_vnd >= 0),
  total_vnd bigint generated always as (subtotal_vnd + shipping_vnd + tax_vnd) stored,
  shipping_address jsonb not null,
  payment_reference text unique,
  tracking_number text,
  created_at timestamptz not null default now()
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null references public.products(id),
  product_name text not null, variant text not null,
  quantity integer not null check(quantity > 0),
  unit_price_vnd bigint not null check(unit_price_vnd > 0)
);

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.products enable row level security;
alter table public.cart_items enable row level security;
alter table public.favorites enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.saved_posts enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Remove default Supabase grants and opt each operation in explicitly.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.products, public.posts, public.comments, public.likes, public.follows to anon, authenticated;
grant update(display_name,handle,bio,avatar_path) on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select,insert,update,delete on public.cart_items to authenticated;
grant select,insert,delete on public.favorites, public.saved_posts, public.blocks to authenticated;
grant insert,delete on public.likes, public.follows to authenticated;
grant insert,delete on public.posts, public.comments to authenticated;
grant update(caption,image_path,topic,tags) on public.posts to authenticated;
grant update(body) on public.comments to authenticated;
grant select,insert on public.reports to authenticated;
grant select on public.orders, public.order_items to authenticated;

create policy profiles_read on public.profiles for select using(true);
create policy profiles_update_self on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy own_role_read on public.user_roles for select to authenticated using(user_id=(select auth.uid()));
create policy products_read on public.products for select using(active or public.is_admin());
create policy cart_self on public.cart_items for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.products p where p.id=product_id and p.active and variant=any(p.variants) and quantity<=p.stock));
create policy favorites_self on public.favorites for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy posts_read on public.posts for select using(status='published' or user_id=(select auth.uid()) or public.is_admin());
create policy posts_insert_self on public.posts for insert to authenticated with check(user_id=(select auth.uid()) and status='published' and image_path like (select auth.uid())::text || '/%');
create policy posts_update_self on public.posts for update to authenticated using(user_id=(select auth.uid()) and status='published') with check(user_id=(select auth.uid()) and status='published' and image_path like (select auth.uid())::text || '/%');
create policy posts_delete_self on public.posts for delete to authenticated using(user_id=(select auth.uid()));
create policy comments_read on public.comments for select using(exists(select 1 from public.posts p where p.id=post_id and p.status='published'));
create policy comments_insert_self on public.comments for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.posts p where p.id=post_id and p.status='published'));
create policy comments_update_self on public.comments for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy comments_delete_self on public.comments for delete to authenticated using(user_id=(select auth.uid()));
create policy likes_read on public.likes for select using(exists(select 1 from public.posts p where p.id=post_id and p.status='published'));
create policy likes_insert_self on public.likes for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.posts p where p.id=post_id and p.status='published'));
create policy likes_delete_self on public.likes for delete to authenticated using(user_id=(select auth.uid()));
create policy saved_posts_self on public.saved_posts for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy follows_read on public.follows for select using(true);
create policy follows_insert_self on public.follows for insert to authenticated with check(follower_id=(select auth.uid()));
create policy follows_delete_self on public.follows for delete to authenticated using(follower_id=(select auth.uid()));
create policy blocks_self on public.blocks for all to authenticated using(blocker_id=(select auth.uid())) with check(blocker_id=(select auth.uid()));
create policy reports_insert_self on public.reports for insert to authenticated with check(reporter_id=(select auth.uid()) and status='pending');
create policy reports_read on public.reports for select to authenticated using(reporter_id=(select auth.uid()) or public.is_admin());
create policy orders_read on public.orders for select to authenticated using(user_id=(select auth.uid()) or public.is_admin());
create policy order_items_read on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and (o.user_id=(select auth.uid()) or public.is_admin())));

create index posts_feed_idx on public.posts(status, created_at desc);
create index posts_author_idx on public.posts(user_id,created_at desc);
create index comments_post_idx on public.comments(post_id,created_at);
create index follows_target_idx on public.follows(following_id);
create index orders_customer_idx on public.orders(user_id,created_at desc);
create index order_items_order_idx on public.order_items(order_id);
create index reports_queue_idx on public.reports(status,created_at);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('community-media','community-media',true,5242880,array['image/jpeg','image/png','image/webp']);
create policy community_media_read on storage.objects for select using(bucket_id='community-media');
create policy community_media_insert on storage.objects for insert to authenticated with check(bucket_id='community-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy community_media_delete on storage.objects for delete to authenticated using(bucket_id='community-media' and (storage.foldername(name))[1]=(select auth.uid())::text);

commit;
