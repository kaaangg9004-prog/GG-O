/** Integration foundation. Production uses the shared backend; see docs/SERVER-CONNECTION.md.
 * Never wire real checkout to local demo state or trust a client-supplied total.
 */
import { backendConfig } from './backend-config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    backendConfig.url;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    backendConfig.publishableKey;

  if (!url || !key) return null;

  if (!client) {
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    });
  }

  return client;
}

function requiredClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error('회원 시스템이 아직 연결되지 않았습니다.');
  return supabase;
}

async function currentUser() {
  const supabase = requiredClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('로그인이 필요합니다.');
  return { supabase, user: data.user };
}

export const memberService = {
  async signUp(email: string, password: string, name: string) {
    if (password.length < 12) throw new Error('비밀번호는 12자 이상이어야 합니다.');
    const { data, error } = await requiredClient().auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name.trim() },
        emailRedirectTo: typeof window === 'undefined' ? undefined : `${window.location.origin}/#my`,
      },
    });
    if (error) throw error;
    return data;
  },
  async signIn(email: string, password: string) {
    const { data, error } = await requiredClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },
  async signOut() {
    const { error } = await requiredClient().auth.signOut();
    if (error) throw error;
  },
  async profile() {
    const { supabase, user } = await currentUser();
    const { data, error } = await supabase
      .from('profiles')
      .select('id,handle,display_name,bio,avatar_path')
      .eq('id', user.id)
      .single();
    if (error) throw error;
    return data;
  },
  async updateProfile(profile: { display_name: string; handle: string; bio: string }) {
    const { supabase, user } = await currentUser();
    const { error } = await supabase.from('profiles').update(profile).eq('id', user.id);
    if (error) throw error;
  },
};

export const communityService = {
  async feed() {
    return (await import('./anonymous-service')).anonymousGateway()!.posts();
  },
  async createPost(post: { title: string; caption: string; topic: string }) {
    return (await import('./anonymous-service')).anonymousGateway()!.write('post.create', {
      title: post.title,
      body: post.caption,
      topic: post.topic,
    });
  },
  async comment(postId: string, body: string) {
    return (await import('./anonymous-service')).anonymousGateway()!.write('comment.create', {
      post_id: postId,
      body,
    });
  },
  async comments(postId: string) {
    return (await import('./anonymous-service')).anonymousGateway()!.comments('post', postId);
  },
  async report(postId: string, reason: string, commentId?: string) {
    return (await import('./anonymous-service')).anonymousGateway()!.report(
      commentId ? 'comment' : 'post',
      commentId ?? postId,
      reason,
    );
  },
};

export const shopService = {
  async catalog() {
    const { data, error } = await requiredClient()
      .from('products')
      .select('id,name,brand,category,price_vnd,original_price_vnd,description,image_path,variants,variant_images,stock,origin,materials,size,care,detail_content,detail_images')
      .eq('active', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
  async orders() {
    const { supabase, user } = await currentUser();
    const { data, error } = await supabase
      .from('orders')
      .select('id,status,currency,total_vnd,tracking_number,created_at,order_items(product_name,variant,quantity,unit_price_vnd)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  },
  async checkout(): Promise<never> {
    throw new Error('실제 결제는 아직 활성화되지 않았습니다. 사업자, 결제사와 배송 정책을 먼저 확정해야 합니다.');
  },
};

/** Server-enforced admin action. Never infer administrator access from a URL. */
export const moderationService = {
  async restore(id: string) {
    const { supabase } = await currentUser();
    const { error } = await supabase.rpc('restore_reported_content', { p_report_id: id });
    if (error) throw error;
  },
  async queue() {
    const { supabase } = await currentUser();
    const { data, error } = await supabase
      .from('reports')
      .select('id,post_id,comment_id,reason,status,action,created_at,reviewed_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return data;
  },
  async resolve(id: string, decision: 'hidden' | 'dismissed') {
    const { supabase } = await currentUser();
    const { error } = await supabase.rpc('moderate_report', {
      p_report_id: id,
      p_decision: decision,
    });
    if (error) throw error;
  },
};