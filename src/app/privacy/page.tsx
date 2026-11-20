import type {Metadata} from 'next';
import {LegalPage} from '@/components/legal-document';
export const metadata:Metadata={title:'Chính sách bảo mật · GG-O',description:'Thông tin về dữ liệu cá nhân, cookie và cách liên hệ GG-O.',robots:{index:true,follow:true}};
export default function PrivacyPage(){return <LegalPage kind="privacy"/>;}
