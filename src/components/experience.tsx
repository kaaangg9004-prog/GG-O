'use client';

import {useLocalized} from './locale-provider';
import {AdminConsole} from './admin-console';
import {MagazineManager} from './magazine-manager';
import {listedArticles,magazineGateway,isPresetMagazineText,type MagazineArticle} from '@/lib/magazine';
import {siteAdminGateway,manageLocalPost,demoMemberCanWrite,setDemoMemberState,postIsHot,demoMemberActivity} from '@/lib/site-admin';
import {defaultSiteSettings,parseSiteSettings,recordPostView,HOT_TITLE,type SiteSettings} from '@/lib/community';
import {InformationLinks} from './information-links';
import {MemberBoard,AnonymousAdmin} from './member-board';
import {anonymousGateway} from '@/lib/anonymous-service';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowUpRight,Bell,Check,Download,Flag,Heart,LifeBuoy,LayoutDashboard,Mail,Menu,MessageSquare,Plus,Search,ShieldCheck,UserRound,X} from 'lucide-react';
import {articles,dateLabel} from '@/lib/data';
import {initialState,readState,STORAGE_KEY,toggleId} from '@/lib/store';
import {addReport,boardPosts,resolveReport,restoreReportedContent,visiblePosts,postReportCount,AUTO_HIDE_REPORTS,publicPost} from '@/lib/board';
import type {LocalState,Post,ReportReason,ReportTarget,View,PollSummary} from '@/lib/types';
import {EmptyState,Logo,Modal,SectionTitle} from './ui';
import {Composer} from './panels';
import {Board,BoardDetail} from './board';
import {Moderation} from './moderation';
import {reactToEvent} from '@/lib/event-reactions';
import {listedEvents,saveEvent,removeEvent} from '@/lib/event-catalog';
import {NewsPage} from './news';
import {editorialGateway,type SharedNews} from '@/lib/editorial-service';
import type {CommunityEvent} from '@/lib/types';
import {listedNews} from '@/lib/news';
import {EventsPage} from './events';
import {SupportBoard} from './support';
import {demoMemberDate} from '@/lib/support-demo';
import {demoOwnerKey} from '@/lib/demo-login';
import {HomeHero} from './home-hero';
import {BottomDock} from './bottom-dock';
import {EmergencyPage,EmergencyAdmin} from './emergency';
import {primaryNavigation} from '@/lib/navigation';
import {NavigationIcon} from './navigation-icon';
import {EmergencyDemoInbox} from './emergency-demo-inbox';
import {canUseEmergencyDemoInbox,makeEmergencyDemoRecord} from '@/lib/emergency-demo';
import type {EmergencyDemoRecord} from '@/lib/emergency-demo';
import {listedPolls,isPresetPollText} from '@/lib/polls';
import {pollGateway} from '@/lib/poll-service';
import {PollGrid,PollsHub} from './polls';
import {getSupabase} from '@/lib/supabase-service';
import {serverSupportGateway} from '@/lib/support-service';
import {emergencyGateway} from '@/lib/emergency-service';
import {ADMIN_NOTICE_KEY} from '@/lib/admin-notice';
import {isPresetEventText} from '@/lib/localized-content';

const views:View[]=['home','news','polls','community','journal','events','my','admin','support','emergency','emergency-admin'];
const protectedViews:View[]=['my','admin','support','emergency-admin'];
const normalize=(value:string):View=>['shop','catalog','favorites'].includes(value)?'polls':views.includes(value as View)?value as View:'home';
const nav=primaryNavigation;
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
export default function Experience({authenticated=false,onRequireAuth=()=>{},onLogin,onLogout,accountLabel='',isDemoAccount=false,accountId,accountJoinedAt}:{authenticated?:boolean;onRequireAuth?:(resume:()=>void)=>void;onLogin?:()=>void;onLogout?:()=>void;accountLabel?:string;isDemoAccount?:boolean;accountId?:string;accountJoinedAt?:string}={}){
  const localize=useLocalized(),liveGateway=useMemo(()=>anonymousGateway(),[]),adminGateway=useMemo(()=>siteAdminGateway(),[]),journalGateway=useMemo(()=>magazineGateway(),[]),editorial=useMemo(()=>editorialGateway(),[]);
  const [mobileHome, setMobileHome] = useState(false);
  const [view,setView]=useState<View>('home'),[data,setData]=useState<LocalState>(initialState),[ready,setReady]=useState(false),[toast,setToast]=useState('');
  const [selectedPost,setPost]=useState<string|null>(null),[selectedPoll,setPoll]=useState<string|null>(null),[article,setArticle]=useState<(typeof articles)[number]|null>(null);
  const [panel,setPanel]=useState<'compose'|'info'|'notifications'|'admin-notice'|null>(null),[info,setInfo]=useState(''),[mobileMenu,setMobileMenu]=useState(false),[install,setInstall]=useState<InstallEvent|null>(null);
  const [remoteNews,setRemoteNews]=useState<SharedNews[]>([]),[remoteEvents,setRemoteEvents]=useState<CommunityEvent[]>([]),[remoteReactions,setRemoteReactions]=useState<Record<string,'like'|'dislike'>>({}),[serverCanWrite,setServerCanWrite]=useState(false);
  const [serverAdmin,setServerAdmin]=useState(false),[demoEmergencyRequests,setDemoEmergencyRequests]=useState<EmergencyDemoRecord[]>([]),[remotePolls,setRemotePolls]=useState<PollSummary[]|null>(null),[remoteSettings,setRemoteSettings]=useState<SiteSettings|null>(null),[remoteArticles,setRemoteArticles]=useState<MagazineArticle[]|null>(null);
  const authRef=useRef(authenticated),dataRef=useRef(data),viewRef=useRef(view);authRef.current=authenticated;dataRef.current=data;viewRef.current=view;
  const demoAdmin=authenticated&&canUseEmergencyDemoInbox(isDemoAccount,accountLabel),canManage=authenticated&&(demoAdmin||serverAdmin),canOpenEmergencyAdmin=canManage;
  const events=editorial?remoteEvents:listedEvents(data),polls=useMemo(()=>listedPolls(data),[data.pollEdits,data.deletedPollIds]);
  const ownerKey=isDemoAccount?demoOwnerKey(accountLabel,data.deviceKey):data.deviceKey;
  const settings=isDemoAccount||!getSupabase()?data.settings:remoteSettings??defaultSiteSettings;
  const canWriteCommunity=editorial?serverCanWrite:canManage||settings.communityWritingEnabled&&(!isDemoAccount||demoMemberCanWrite(data,accountLabel));
  const actor={canWrite:canWriteCommunity,id:authenticated?(isDemoAccount?`demo:${ownerKey}`:accountId??null):null,isAdmin:canManage&&ready};
  const request=(action:()=>void)=>{if(authRef.current){action();return;}onRequireAuth(action);};
  const notify=useCallback((message:string)=>setToast(message),[]);
  const mutate=(fn:(state:LocalState)=>LocalState)=>{if(!authRef.current||!ready)return false;try{const next=fn(dataRef.current);localStorage.setItem(STORAGE_KEY,JSON.stringify(next));dataRef.current=next;setData(next);return true;}catch(error){notify(error instanceof Error&&/[가-힣]/.test(error.message)?error.message:'저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.');return false;}};
  const goRaw=(next:View,detailId?:string)=>{setView(next);viewRef.current=next;setPost(null);setPoll(null);setPanel(null);setArticle(null);setMobileMenu(false);window.history.pushState(null,'',next==='home'?'#':`#${next}${detailId?'?id='+encodeURIComponent(detailId):''}`);window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});};
  const go=(next:View)=>{next=normalize(next);goRaw(next);if(protectedViews.includes(next)&&!authRef.current)onRequireAuth(()=>goRaw(next));};
  const liveBoard=!!getSupabase()&&!(authenticated&&isDemoAccount);
  const write=()=>{if(liveBoard){go('community');return;}request(()=>{if(!canWriteCommunity){notify('게시글·댓글 작성이 잠시 중단되었습니다.');return;}setPanel('compose');});};
  const openPoll=(id:string)=>{goRaw('polls');setPoll(id);};
  const openInfo=(title:string)=>{setInfo(title);setPanel('info');};
  const updatePost=(id:string,fn:(post:Post)=>Post)=>mutate(state=>{const post=boardPosts(state).find(post=>post.id===id);return post?{...state,posts:[...state.posts.filter(post=>post.id!==id),fn(post)]}:state;});
  const openPost=(id:string)=>{const post=boardPosts(dataRef.current).find(p=>p.id===id);if(post){const next=recordPostView(dataRef.current,post);if(next!==dataRef.current){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next));dataRef.current=next;setData(next);}catch{}}}setPost(id);};
  useEffect(()=>{
    authRef.current=authenticated;
    try{const restored=readState(localStorage.getItem(STORAGE_KEY));dataRef.current=restored;setData(restored);localStorage.setItem(STORAGE_KEY,JSON.stringify(restored));}catch{setData(readState(null));setToast('브라우저 저장 공간을 사용할 수 없습니다. 저장 기능을 허용한 뒤 다시 열어 주세요.');}setReady(true);
    const hash=()=>{const raw=window.location.hash.slice(1).split('?')[0],next=normalize(raw);if(raw&&raw!==next)window.history.replaceState(null,'',`#${next}`);setView(next);viewRef.current=next;setPost(null);setPoll(null);setPanel(null);if(protectedViews.includes(next)&&!authRef.current)onRequireAuth(()=>goRaw(next));};hash();window.addEventListener('hashchange',hash);window.addEventListener('popstate',hash);
    const sync=(event:StorageEvent)=>{if(event.key===STORAGE_KEY){const restored=readState(event.newValue);dataRef.current=restored;setData(restored);}};window.addEventListener('storage',sync);
    const before=(event:Event)=>{event.preventDefault();setInstall(event as InstallEvent);};window.addEventListener('beforeinstallprompt',before);
    if('serviceWorker'in navigator&&process.env.NODE_ENV==='production')navigator.serviceWorker.register('/sw.js').then(registration=>registration.update()).catch(()=>{});
    return()=>{authRef.current=false;window.removeEventListener('hashchange',hash);window.removeEventListener('popstate',hash);window.removeEventListener('storage',sync);window.removeEventListener('beforeinstallprompt',before);};
  },[]);
  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 700px)');
    const update = () => setMobileHome(viewport.matches);
    update();
    viewport.addEventListener('change', update);
    return () => viewport.removeEventListener('change', update);
  }, []);
  useEffect(()=>{setDemoEmergencyRequests([]);},[authenticated,isDemoAccount,accountLabel,accountId]);
  useEffect(()=>{let active=true;setServerAdmin(false);setServerCanWrite(false);const client=getSupabase();if(authenticated&&!isDemoAccount&&accountId&&client)client.rpc('anonymous_access').then(({data,error})=>{if(active&&!error){setServerAdmin(data?.is_admin===true);setServerCanWrite(data?.can_write===true);}});return()=>{active=false;};},[authenticated,isDemoAccount,accountId]);
  useEffect(() => {
    if (!canManage || !serverAdmin || !accountId) return;
    const key = ADMIN_NOTICE_KEY + accountId;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {}
    let active = true;
    const checks = [
      serverSupportGateway().list(true).then(tickets => tickets.some(ticket => ticket.status === 'waiting')),
      emergencyGateway().list('new').then(requests => requests.length > 0),
      adminGateway?.overview().then(stats => stats.reports > 0),
    ];
    for (const check of checks) {
      check?.then(hasPending => {
        if (!active || !hasPending) return;
        active = false;
        try { sessionStorage.setItem(key, '1'); } catch {}
        setPanel('admin-notice');
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [accountId, adminGateway, canManage, serverAdmin]);
  useEffect(()=>{let active=true;const gateway=pollGateway();if(gateway)gateway.list().then(rows=>{if(active)setRemotePolls(rows);}).catch(()=>{if(active)setRemotePolls([]);});return()=>{active=false;};},[]);
  useEffect(()=>{let active=true;const client=getSupabase();if(client){client.rpc('community_settings').then(({data,error})=>{if(active&&!error)setRemoteSettings(parseSiteSettings(data));});journalGateway?.list().then(rows=>{if(active)setRemoteArticles(rows);}).catch(()=>{if(active)setRemoteArticles([]);});}return()=>{active=false;};},[journalGateway]);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),5000);return()=>clearTimeout(timer);},[toast]);
  useEffect(()=>{document.title=localize.text(`${nav.find(item=>item.id===view)?.label??(view==='journal'?'매거진':view==='admin'?'사이트 관리':view==='support'?'고객지원':view==='emergency-admin'?'긴급 요청함':'내 활동')} · GG-O`);},[view,localize.locale]);
  const news=editorial?remoteNews:listedNews(data);
  const openFeature=(section:'news'|'events',id:string)=>goRaw(section,id);
  const magazine=liveBoard?remoteArticles??[]:listedArticles(data);
  const posts=visiblePosts(data),activePost=posts.find(post=>post.id===selectedPost);
  const report=(target:ReportTarget,reason:ReportReason,detail:string)=>{if(!authenticated){onRequireAuth(()=>{});return false;}const saved=mutate(state=>addReport(state,target,reason,detail,accountId??ownerKey));if(saved)notify(!target.commentId&&postReportCount(data,target.postId)+1===AUTO_HIDE_REPORTS?'신고가 50건 누적되어 게시글을 우선 숨겼습니다. 운영자 검토를 기다려 주세요.':'신고가 접수됐습니다. 같은 내용은 한 번만 신고할 수 있습니다.');return saved;};
  const pending=data.reports.filter(report=>report.status==='pending').length;
  const homePolls=(remotePolls??polls).slice(0,4).map(poll=>({...poll,title:polls.some(seed=>seed.id===poll.id&&isPresetPollText(seed,poll.title))?localize.text(poll.title):poll.title}));
  const openArticle=(item:MagazineArticle)=>{if(liveBoard&&journalGateway)journalGateway.open(item.id).then(setArticle).catch(()=>notify('매거진을 불러오지 못했습니다.'));else setArticle(item);};
  const articleCard=(item:MagazineArticle)=><button className="journal-card" key={item.id} onClick={()=>openArticle(item)}><div className="journal-image"><img src={item.image} alt="" loading="lazy"/><span className="circle-button"><ArrowUpRight size={22}/></span></div><div className="journal-meta"><span translate={isPresetMagazineText(item,item.tag)?'yes':'no'}>{item.tag}</span><span translate={isPresetMagazineText(item,item.read)?'yes':'no'}>{item.read}</span></div><h3 translate={isPresetMagazineText(item,item.title)?'yes':'no'}>{item.title}</h3><p translate={isPresetMagazineText(item,item.excerpt)?'yes':'no'}>{item.excerpt}</p></button>;
  const memberOnly=<EmptyState title="로그인하고 함께해요." text="로그인하면 글과 이벤트를 읽고 투표와 의견 나누기에 참여할 수 있습니다." action="로그인" onAction={()=>request(()=>{})}/>;
  const refreshEditorial=async()=>{if(!editorial)return;const [news,events]=await Promise.all([editorial.news(),editorial.events()]);setRemoteNews(news);setRemoteEvents(events);if(authenticated)setRemoteReactions(await editorial.reactions());};
  useEffect(()=>{if(!editorial)return;let active=true;setRemoteReactions({});const run=async()=>{try{const [n,e,r]=await Promise.all([editorial.news(),editorial.events(),authenticated?editorial.reactions():Promise.resolve({})]);if(active){setRemoteNews(n);setRemoteEvents(e);setRemoteReactions(r);}}catch{if(active)notify('소식·이벤트를 불러오지 못했습니다. 새로고침해 주세요.');}};void run();window.addEventListener('focus',run);return()=>{active=false;window.removeEventListener('focus',run);};},[editorial,authenticated,accountId,view]);
  const editorialAction=async(action:()=>Promise<void>)=>{try{await action();await refreshEditorial();notify('서버에 저장했습니다.');return true;}catch(e){notify(e instanceof Error?e.message:'저장하지 못했습니다.');return false;}};
  const eventPanel=<EventsPage events={events} reactions={editorial?remoteReactions:data.eventReactions} canManage={canManage&&ready} onSave={event=>{if(!canManage)return false;return editorial?editorialAction(()=>editorial.save('event',event)):mutate(state=>saveEvent(state,event));}} onDelete={id=>{if(!canManage)return false;return editorial?editorialAction(()=>editorial.remove('event',id)):mutate(state=>removeEvent(state,id));}} onReact={(id,reaction)=>request(()=>{if(editorial){void editorialAction(()=>editorial.react(id,remoteReactions[id]===reaction?null:reaction));}else mutate(state=>reactToEvent(state,id,reaction));})}/>;
  const pollPanel=<PollsHub state={data} actor={actor} demoMode={authenticated&&isDemoAccount} mutate={mutate} onRequireAuth={onRequireAuth} selectedId={selectedPoll} onSelect={setPoll}/>;
  const supportPanel=<SupportBoard key={actor.id??'guest'} isDemoAccount={isDemoAccount} member={()=>({id:accountId??`demo:${ownerKey}`,handle:accountLabel,joinedAt:accountJoinedAt??demoMemberDate(),orders:data.orders,demo:isDemoAccount})}/>;
  const emergencyPanel=demoAdmin?<EmergencyDemoInbox records={demoEmergencyRequests} onViewed={id=>setDemoEmergencyRequests(old=>old.map(record=>record.id===id&&record.status==='new'?{...record,status:'viewed'}:record))} onResolved={id=>setDemoEmergencyRequests(old=>old.map(record=>record.id===id?{...record,status:'resolved'}:record))} onWrite={()=>go('emergency')}/>:<EmergencyAdmin isDemoAccount={isDemoAccount} onHome={()=>go('home')}/>;
  const notice=settings.notice[localize.locale]||settings.notice.vi||settings.notice.ko||settings.notice.en;
  const allPosts=boardPosts(data);
  const managedPosts=allPosts.map(p=>({id:p.id,title:p.title,body:p.caption,topic:p.topic,views:p.views,created_at:p.createdAt,status:data.hiddenPosts.includes(p.id)?'hidden':'published',deleted:data.deletedPosts.includes(p.id),comments:publicPost(p,{...data,hiddenComments:[]}).comments.map(c=>({id:c.id,body:c.text,hidden:data.hiddenComments.includes(c.id),author_label:c.author_label}))}));
  const demoMembers=(['AAAA','BBBB'] as const).map(id=>({id,handle:id,email:null,role:id==='BBBB'?'admin' as const:'user' as const,status:demoMemberCanWrite(data,id)?'active' as const:data.demoMemberStatuses[id]?.status??'active' as const,suspended_until:data.demoMemberStatuses[id]?.suspendedUntil??null,created_at:'2026-11-14T00:00:00Z',...demoMemberActivity(data,id,allPosts)}));
  const journalPanel=<MagazineManager articles={magazine} onOpen={async id=>liveBoard&&journalGateway?journalGateway.open(id):magazine.find(a=>a.id===id)!} onSave={async value=>{if(!canManage)throw new Error('운영자 권한이 필요합니다.');if(liveBoard&&journalGateway){await journalGateway.save(value);setRemoteArticles(await journalGateway.list());}else if(!mutate(state=>({...state,articleEdits:[...state.articleEdits.filter(a=>a.id!==value.id),value],deletedArticleIds:state.deletedArticleIds.filter(id=>id!==value.id)})))throw new Error('저장하지 못했습니다.');}} onDelete={async id=>{if(!canManage)throw new Error('운영자 권한이 필요합니다.');if(liveBoard&&journalGateway){await journalGateway.remove(id);setRemoteArticles(await journalGateway.list());}else if(!mutate(state=>({...state,deletedArticleIds:Array.from(new Set([...state.deletedArticleIds,id]))})))throw new Error('저장하지 못했습니다.');}}/>;
  const mobileMemberHome = authenticated && mobileHome;
  const homeCommunity = <section className={mobileMemberHome ? "shell home-feed home-feed-priority" : "home-feed"}><SectionTitle label="COMMUNITY" title={mobileMemberHome ? "최신 커뮤니티 글" : "짧게 나누는 이야기"} action="커뮤니티" onAction={()=>go('community')}/>{!liveBoard&&<p className="demo-content-label">예시 게시글</p>}{liveBoard?<MemberBoard key={accountId??'guest'} authenticated={authenticated} compact initialFilter={mobileMemberHome ? "전체" : "hot"} onRequireAuth={resume=>onRequireAuth(resume??(()=>{}))}/>:<Board canModerate={canManage} posts={posts.slice(0,3)} state={data} onOpen={openPost} onWrite={write} onModeration={()=>go('admin')} compact initialFilter={mobileMemberHome ? "전체" : "hot"}/>}<button className="text-link home-write" onClick={write}>나도 이야기 남기기<Plus size={17}/></button></section>;
  return localize(<>
    <a className="skip-link" href="#main-content" onClick={e=>{e.preventDefault();document.getElementById('main-content')?.focus();}}>본문 바로가기</a><div className="announcement"><span><i/>{authenticated&&isDemoAccount?<><span>{demoAdmin?'운영자 시점':'일반 사용자 시점'}</span> · <b translate="no">{accountLabel}</b></>:<>GG-O</>}</span><span>K-문화 · 플레이 · 커뮤니티</span></div>
    <header className={`site-header ${authenticated?'is-member':'is-guest'}`}><div className="header-inner"><button className="logo-button" onClick={()=>go('home')} aria-label="GG-O 홈"><Logo/></button><nav aria-label="주 메뉴">{nav.map(item=><a key={item.id} href={`#${item.id}`} className={`${view===item.id?'active':''} nav-${item.id}`} aria-current={view===item.id?'page':undefined} onClick={e=>{e.preventDefault();go(item.id);}}><span className={`primary-nav-icon primary-nav-icon-${item.id}`}><NavigationIcon view={item.id} size={18}/></span><span>{item.label}</span></a>)}</nav><div className="header-actions"><button className="icon-button search-toggle has-header-tooltip" aria-label="투표 검색" data-tooltip={localize.text('투표 검색')} onClick={()=>{go('polls');setTimeout(()=>document.getElementById('poll-search')?.focus(),100);}}><Search size={21}/></button>{authenticated&&<><button className="icon-button notification-trigger has-header-tooltip" aria-label="알림" data-tooltip={localize.text('알림')} onClick={()=>setPanel('notifications')}><Bell size={20}/>{canManage&&pending>0&&<span className="count-badge">{pending}</span>}</button><button className="icon-button support-trigger has-header-tooltip" aria-label="고객지원" data-tooltip={localize.text('고객지원')} onClick={()=>go('support')}><LifeBuoy size={21}/></button>{canManage&&<button className="icon-button site-admin-trigger" aria-label="사이트 관리" title="사이트 관리" onClick={()=>go('admin')}><LayoutDashboard size={20}/></button>}{canOpenEmergencyAdmin&&<button className="icon-button emergency-inbox-trigger" aria-label={demoAdmin?'요청 예시 보관함':'비공개 긴급 요청함'} title={demoAdmin?'요청 예시 보관함':'비공개 긴급 요청함'} onClick={()=>go('emergency-admin')}><ShieldCheck size={20}/></button>}<button className="icon-button account-toggle has-header-tooltip" aria-label="내 활동" data-tooltip={localize.text('내 정보')} onClick={()=>go('my')}><UserRound size={21}/></button></>}<div className="header-auth">{authenticated?<button onClick={onLogout}>로그아웃</button>:<><button onClick={()=>onLogin?onLogin():request(()=>{})}>로그인</button><i/><a href="/signup/">회원가입</a></>}</div><button className="icon-button mobile-menu-toggle" aria-label="메뉴 열기" aria-expanded={mobileMenu} onClick={()=>setMobileMenu(value=>!value)}>{mobileMenu?<X size={22}/>:<Menu size={22}/>}</button></div></div>{mobileMenu&&<nav className="mobile-menu" aria-label="모바일 메뉴">{nav.map(item=><a key={item.id} href={`#${item.id}`} onClick={e=>{e.preventDefault();go(item.id);}}>{item.label}<ArrowUpRight size={17}/></a>)}<button onClick={()=>go('journal')}>매거진<ArrowUpRight size={17}/></button><button onClick={()=>go('support')}>고객지원<LifeBuoy size={17}/></button><button onClick={()=>go('my')}>내 활동<UserRound size={17}/></button>{canManage&&<button onClick={()=>go('admin')}>신고 관리<Flag size={17}/></button>}</nav>}</header>
    {notice&&<div className="site-notice" role="status"><span translate="no">{notice}</span></div>}<main id="main-content" tabIndex={-1}>
      {view==='home'&&<>{mobileMemberHome&&homeCommunity}<HomeHero onCommunity={()=>go('community')} onPolls={()=>go('polls')}/>
      <section className="shell home-discover"><SectionTitle label="DISCOVER GG-O" title="지금, GG-O에서" action="모든 소식" onAction={()=>go('news')}/>
      <div className="home-feature-grid">{news[0]&&<button className="home-feature feature-news" onClick={()=>openFeature('news',news[0].id)}><img src={news[0].image} alt=""/><div><span className="feature-chip">GG-O 소식</span><h2 translate="no">{news[0].title}</h2><p translate="no">{news[0].body.slice(0,90)}</p><span className="feature-link">소식 읽기<ArrowUpRight size={20}/></span></div></button>}
      {events[0]&&<button className="home-feature feature-event" onClick={()=>openFeature('events',events[0].id)}><img src={events[0].image} alt=""/><div><span className="feature-chip">이벤트 · {events[0].status}</span><h2>{events[0].title}</h2><p><span>{events[0].schedule||'일정 미정'}</span> · <span translate={isPresetEventText(events[0],events[0].location)?'yes':'no'}>{events[0].location}</span></p><span className="feature-link">상세정보 읽기<ArrowUpRight size={20}/></span></div></button>}</div></section>
      <div className="shell home-content-grid home-balanced"><section className="home-polls"><SectionTitle label="YOUR PICK" title="오늘의 취향 투표" action="전체 투표" onAction={()=>go('polls')}/><PollGrid polls={homePolls.slice(0,2)} onOpen={openPoll}/></section>
      {!mobileMemberHome&&homeCommunity}</div>
      <section className="section shell home-journal"><SectionTitle label="GG-O 매거진" title="취향을 넓히는 시간" action="더 읽어보기" onAction={()=>go('journal')}/><div className="journal-grid">{magazine.slice(0,2).map(articleCard)}</div></section></>}

      {view==='news'&&<NewsPage state={data} canManage={canManage&&ready} actor={actor.id} canWrite={canWriteCommunity} mutate={mutate} onRequireAuth={()=>onRequireAuth(()=>{})}/>}
      {view==='polls'&&pollPanel}
      {view==='community'&&<section className="shell section page-section community-page"><div className="page-heading"><div><h1>커뮤니티</h1><p>한국 문화와 일상, 익명으로 편하게 이야기해요.</p></div></div>{liveBoard?<MemberBoard key={accountId??'guest'} authenticated={authenticated} onRequireAuth={resume=>onRequireAuth(resume??(()=>{}))}/>:<Board canModerate={canManage} posts={posts} state={data} onOpen={openPost} onWrite={write} onModeration={()=>go('admin')}/>}</section>}
      {view==='journal'&&<section className="shell section page-section"><div className="page-heading"><div><p className="eyebrow">GG-O 매거진</p><h1>새로운 취향을 발견해요.</h1><p>패션, 뷰티, 음악과 일상 속 작은 영감.</p></div></div><div className="journal-grid journal-page">{magazine.map(articleCard)}</div></section>}
      {view==='events'&&eventPanel}
      {view==='my'&&(authenticated?<section className="shell section page-section"><div className="demo-account-bar"><div><span>{isDemoAccount?'로그인한 계정':'로그인한 회원 계정'}</span><strong translate="no">{accountLabel}</strong></div><button className="button button-light" onClick={onLogout}>로그아웃<ArrowUpRight size={16}/></button></div><div className="page-heading"><div><h1>내 활동.</h1><p>함께 고른 취향과 저장한 이야기를 확인하세요.</p></div></div><div className="stats-grid"><button onClick={()=>go('polls')}><Check size={20}/><strong>{data.pollBallots.filter(vote=>vote.userKey===actor.id).length}</strong><span>참여한 투표</span></button><button onClick={()=>go('community')}><MessageSquare size={20}/><strong>{data.savedPosts.length}</strong><span>저장한 글</span></button>{canManage&&<button onClick={()=>go('admin')}><Flag size={20}/><strong>{pending}</strong><span>처리 대기 신고</span></button>}</div></section>:<section className="shell section">{memberOnly}</section>)}
      {view==='emergency'&&<EmergencyPage authenticated={authenticated} onRequireAuth={request} isDemoAccount={authenticated&&isDemoAccount} onTestRequest={demoAdmin?draft=>setDemoEmergencyRequests(old=>[makeEmergencyDemoRecord(draft),...old].slice(0,50)):undefined} onOpenTestInbox={demoAdmin?()=>go('emergency-admin'):undefined}/>}
      {view==='emergency-admin'&&(authenticated?emergencyPanel:<section className="shell section">{memberOnly}</section>)}
      {view==='support'&&(authenticated&&ready?supportPanel:<section className="shell section">{memberOnly}</section>)}
      {view==='admin'&&(!authenticated?<section className="shell section">{memberOnly}</section>:<AdminConsole authorized={canManage} demo={demoAdmin} settings={settings} gateway={adminGateway} stats={{posts:allPosts.filter(p=>!data.deletedPosts.includes(p.id)).length,hot:allPosts.filter(p=>postIsHot(p,data)).length,reports:pending,members:2}} posts={managedPosts} members={demoMembers} panels={{polls:pollPanel,events:eventPanel,journal:journalPanel,support:supportPanel,emergency:emergencyPanel,reports:liveBoard&&liveGateway?<AnonymousAdmin gateway={liveGateway}/>:<Moderation state={data} onResolve={(id,decision)=>{if(canManage)mutate(state=>resolveReport(state,id,decision));}} onRestore={id=>{if(canManage)mutate(state=>restoreReportedContent(state,id));}}/>}} onSettings={async value=>{if(!canManage)throw new Error('운영자 권한이 필요합니다.');if(liveBoard&&adminGateway){await adminGateway.settings(value);setRemoteSettings(value);}else if(!mutate(state=>({...state,settings:value})))throw new Error('저장하지 못했습니다.');notify('설정을 저장했습니다.');}} onPost={async(id,action,topic)=>{if(!canManage)throw new Error('운영자 권한이 필요합니다.');if(liveBoard&&adminGateway)await adminGateway.post(id,action,topic);else {const post=allPosts.find(p=>p.id===id);if(post&&!mutate(state=>manageLocalPost(state,post,action,topic)))throw new Error('저장하지 못했습니다.');}}} onComment={async(id,action)=>{if(!canManage)throw new Error('운영자 권한이 필요합니다.');if(liveBoard&&adminGateway)await adminGateway.comment(id,action);else if(!mutate(state=>({...state,hiddenComments:action==='hide'?Array.from(new Set([...state.hiddenComments,id])):state.hiddenComments.filter(c=>c!==id)})))throw new Error('저장하지 못했습니다.');}} onMember={async(id,action)=>{if(!canManage)throw new Error('운영자 권한이 필요합니다.');if(liveBoard&&adminGateway)await adminGateway.member(id,action);else if(!mutate(state=>setDemoMemberState(state,id,action)))throw new Error('저장하지 못했습니다.');}}/>)}
    </main>
    <footer className="site-footer"><div className="shell"><div className="footer-top"><div><button className="logo-button" onClick={()=>go('home')} aria-label="GG-O 홈"><Logo/></button><p className="footer-slogan">K-문화 · 플레이 · 커뮤니티</p><p>한국의 감성, 우리만의 취향.<br/>취향과 경험, 이야기가 만나는 곳.</p></div><div className="footer-links"><div><h3>둘러보기</h3><button onClick={()=>go('news')}>소식<ArrowUpRight size={13}/></button><button onClick={()=>go('polls')}>투표<ArrowUpRight size={13}/></button><button onClick={()=>go('community')}>커뮤니티<ArrowUpRight size={13}/></button><button onClick={()=>go('events')}>이벤트<ArrowUpRight size={13}/></button><button onClick={()=>go('journal')}>매거진<ArrowUpRight size={13}/></button></div><div><h3>이용 안내</h3><a href="/about/">브랜드 소개</a><button onClick={()=>openInfo('투표 이용 안내')}>투표 이용 안내</button><button onClick={()=>go('support')}>고객지원</button><button onClick={()=>go('emergency')}>도움 안내</button><a href="mailto:contact.US.GGO@gmail.com">문의하기<ArrowUpRight size={13}/></a></div></div><div className="footer-install"><span className="eyebrow">어디서나, 내 취향대로.</span><h3>GG-O를 홈 화면에.</h3><button className="button button-outline" onClick={async()=>{if(install){await install.prompt();await install.userChoice;setInstall(null);}else openInfo('홈 화면에 설치하기');}}><Download size={17}/>홈 화면에 추가하기</button><a href="mailto:contact.US.GGO@gmail.com"><Mail size={14}/>contact.US.GGO@gmail.com</a></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} GG-O. 같이 가자, 우리.</span><span>서울 ↔ 하노이</span>{canManage&&<><button onClick={()=>go('admin')}>사이트 관리 ↗</button><button onClick={()=>go('emergency-admin')}>{demoAdmin?'요청 예시 보관함':'비공개 긴급 요청함'} ↗</button></>}{authenticated&&onLogout&&<button onClick={onLogout}>로그아웃</button>}</div><div className="experience-disclosure"><span className="status-dot"/><p>{editorial?"회원 활동은 서버에 저장됩니다.":"예시 콘텐츠 · 활동은 기기에 저장"}</p></div><InformationLinks/></div></footer>
    <BottomDock view={view} onNavigate={go}/>{toast&&<div className="toast" role="status"><Check size={18}/><span>{toast}</span><button aria-label="안내 닫기" onClick={()=>setToast('')}><X size={16}/></button></div>}
    {panel==='compose'&&authenticated&&<Modal title="익명 글쓰기" close={()=>setPanel(null)} wide><Composer ownerKey={ownerKey} onSubmit={post=>{if(!canWriteCommunity){notify('게시글·댓글 작성이 잠시 중단되었습니다.');return;}if(mutate(state=>({...state,posts:[post,...state.posts]}))){go('community');notify('익명 글을 이 브라우저에 등록했습니다.');}}}/></Modal>}
    {activePost&&<Modal title="익명 게시판" close={()=>setPost(null)} wide><BoardDetail canWrite={canWriteCommunity} authenticated={authenticated} onRequireAuth={()=>onRequireAuth(()=>{})} key={activePost.id} ownerKey={ownerKey} reporterKey={accountId??ownerKey} post={activePost} state={data} onBack={()=>setPost(null)} onLike={()=>request(()=>mutate(state=>({...state,likes:toggleId(state.likes,activePost.id)})))} onSave={()=>request(()=>mutate(state=>({...state,savedPosts:toggleId(state.savedPosts,activePost.id)})))} onComment={text=>canWriteCommunity&&updatePost(activePost.id,post=>({...post,comments:[...post.comments,{id:crypto.randomUUID(),ownerKey,text,createdAt:new Date().toISOString()}]}))} onReport={report} onDelete={authenticated&&activePost.ownerKey===ownerKey?()=>{if(mutate(state=>({...state,posts:state.posts.filter(post=>post.id!==activePost.id)})))setPost(null);}:undefined}/></Modal>}
    {article&&<Modal title="GG-O 매거진" close={()=>setArticle(null)} wide><article className="article-detail"><img src={article.image} alt="매거진 분위기 사진"/><div><p className="eyebrow" translate={isPresetMagazineText(article,article.tag)?'yes':'no'}>{article.tag} · {article.read}</p><h1 translate={isPresetMagazineText(article,article.title)?'yes':'no'}>{article.title}</h1><p className="article-lead" translate={isPresetMagazineText(article,article.excerpt)?'yes':'no'}>{article.excerpt}</p>{article.paragraphs.map(text=><p key={text}>{text}</p>)}<button className="button button-dark" onClick={()=>{setArticle(null);go('community');}}>게시판에서 이야기 나누기<ArrowUpRight size={18}/></button></div></article></Modal>}
    {panel==='info'&&<Modal title={info} close={()=>setPanel(null)}><InfoContent title={info}/></Modal>}
    {panel==='admin-notice'&&canManage&&<Modal title="알림" close={()=>setPanel(null)}>
      <p>사이트 관리 탭에 새로운 알림이 있습니다.</p>
      <button className="button button-dark" onClick={()=>go('admin')}>사이트 관리 열기<ArrowUpRight size={18}/></button>
    </Modal>}
    {panel==='notifications'&&authenticated&&<Modal title="알림" close={()=>setPanel(null)}>{canManage?<><p>처리 대기 신고 {pending}건</p><button className="button button-dark" onClick={()=>go('admin')}>신고 관리 열기<ArrowUpRight size={18}/></button></>:<p>새로운 알림이 없습니다.</p>}</Modal>}
  </>);
}
function InfoContent({title}:{title:string}){
  const localize=useLocalized();const content:Record<string,React.ReactNode>={
    'GG-O 소개':<><p>GG-O는 한국 문화와 베트남의 젊은 일상을 취향과 즐거움으로 연결하는 브랜드입니다.</p><h3>K-문화 · 플레이 · 커뮤니티</h3><p>함께 좋아하는 것을 고르고 익명으로 이야기를 나눠요.</p></>,
    '투표 이용 안내':<><p>운영자가 만든 투표를 사진과 상세 설명으로 살펴보세요. 각 항목에서 하나씩 고르고 참여를 누르면 결과를 확인할 수 있습니다.</p><p>투표는 한 번만 참여할 수 있으며 참여한 사람만 익명 댓글을 남길 수 있습니다.</p></>,
    '홈 화면에 설치하기':<><p>안드로이드 크롬: 메뉴 ⋮ → ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택해 주세요.</p><p>아이폰 사파리: 공유 버튼 → ‘홈 화면에 추가’를 선택해 주세요.</p><p>컴퓨터: 지원하는 브라우저의 주소창 옆 설치 버튼을 이용해 주세요. 설치 여부는 기기와 브라우저에 따라 다릅니다.</p></>,
  };return localize(<div className="info-content">{content[title]??<p>안내를 준비하고 있습니다.</p>}</div>);
}
