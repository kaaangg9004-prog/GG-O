import type {MagazineArticle} from './magazine';
import type {DemoMemberState} from './site-admin';
import type {SiteSettings} from './community';
export type Category = 'beauty' | 'accessories' | 'lifestyle';
export type View = 'news' | 'home' | 'polls' | 'shop' | 'community' | 'journal' | 'events' | 'my' | 'favorites' | 'admin' | 'catalog' | 'support' | 'emergency' | 'emergency-admin';
export interface ProductVariant { id: string; label: string; image: string; swatch: string; legacyLabel?: string }
export interface Product {
  id: string; name: string; brand: string; category: Category; price: number;
  originalPrice?: number; image: string; tag: string; description: string;
  variants: ProductVariant[]; stock: number; featured?: boolean;
  origin?: string; materials?: string; size?: string; care?: string;
  detailContent?: string; detailImages?: string[];
}
export interface CartItem { productId: string; variant: string; quantity: number }
export interface OrderLine extends CartItem { productName?: string; variantLabel?: string; image?: string; unitPrice?: number }
export const boardCategories = ['전체', '자유', '밈', '연예인', '취미', '패션', '음악', '애니메이션'] as const;
export type BoardCategory = Exclude<typeof boardCategories[number], '전체'>;
export interface Comment {
  id: string; text: string; createdAt: string;
  /** Device-only ownership marker. Never render it or expose it in a public API. */
  ownerKey: string;
}
export interface Post {
  id: string; title: string; caption: string; topic: BoardCategory;
  image: string; tags: string[]; likes: number; views: number;
  comments: Comment[]; createdAt: string;
  /** Browser-demo ownership; live identity is never returned by public APIs. */
  ownerKey: string;
}
export interface ReportTarget { postId: string; commentId?: string }
export type ReportReason = '욕설·혐오·괴롭힘' | '광고·도배' | '개인정보 노출' | '부적절한 콘텐츠' | '기타';
export interface Report {
  id: string; target: ReportTarget; reason: ReportReason; detail: string;
  excerpt: string; createdAt: string; resolvedAt?: string;
  status: 'pending' | 'hidden' | 'dismissed';
  /** Private deduplication key, never included in anonymous public data. */
  reporterKey?: string;
}
export interface DemoOrder { id: string; items: OrderLine[]; subtotal: number; createdAt: string; status: 'demo' }
export const eventStatuses=['기획 중','모집 중','마감','종료'] as const;
export interface CommunityEvent {
  id:string; title:string; label:string; image:string; description:string;
  location:string; schedule?:string; status:typeof eventStatuses[number];
}
export interface LocalProfile { name: string; handle: string; bio: string }
export type PollBlock={id:string;type:'heading';text:string}|{id:string;type:'text';text:string}|{id:string;type:'image';image:string;caption:string};
export interface PollQuestion {id:string;prompt:string;options:{id:string;label:string}[]}
export interface PollDefinition {id:string;title:string;image:string;summary:string;blocks:PollBlock[];questions:PollQuestion[];revision:number;active:boolean}
export type PollSummary=Pick<PollDefinition,'id'|'title'|'image'>;
export interface PollBallot {pollId:string;userKey:string;revision:number;answers:Record<string,string>;createdAt:string}
export interface PollComment {id:string;pollId:string;userKey:string;text:string;createdAt:string}
export interface PollActor {id:string|null;isAdmin:boolean;canWrite?:boolean}
export interface PollResult {questionId:string;options:{optionId:string;count:number}[]}
export interface PollOpened {poll:PollDefinition;myVote:Pick<PollBallot,'answers'|'createdAt'>|null;results:PollResult[]|null;participants:number|null;comments:(Omit<PollComment,'userKey'|'pollId'>&{author_label?:string;is_mine?:boolean})[];questionsLocked?:boolean}
export interface LocalState {
  newsEdits:import('./news').NewsArticle[];deletedNewsIds:string[];
  articleEdits:MagazineArticle[];deletedArticleIds:string[];demoMemberStatuses:Record<string,DemoMemberState>;settings:SiteSettings;deletedPosts:string[];postViews:Record<string,string>;
  schema: 2; deviceKey: string; cart: CartItem[]; favorites: string[]; likes: string[];
  savedPosts: string[]; hiddenPosts: string[]; hiddenComments: string[];
  posts: Post[]; reports: Report[]; orders: DemoOrder[];
  profile: LocalProfile | null; eventInterests: string[];
  productEdits: Product[]; deletedProductIds: string[];
  eventReactions: Record<string,'like'|'dislike'>;
  eventEdits: CommunityEvent[]; deletedEventIds: string[];
  autoHiddenPosts: string[];
  pollEdits:PollDefinition[];deletedPollIds:string[];pollBallots:PollBallot[];pollComments:PollComment[];
}
