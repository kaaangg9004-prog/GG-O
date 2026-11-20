import type {Metadata} from 'next';
import OAuthCallback from '@/components/oauth-callback';
export const metadata:Metadata={title:'Xác nhận đăng nhập mạng xã hội · GG-O'};
export default function CallbackPage(){return <OAuthCallback/>;}
