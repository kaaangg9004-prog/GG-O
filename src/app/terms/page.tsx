import type {Metadata} from 'next';
import {LegalPage} from '@/components/legal-document';
export const metadata:Metadata={title:'Điều khoản sử dụng · GG-O',description:'Điều khoản sử dụng, quy định cộng đồng và quyền sở hữu trí tuệ của GG-O.',robots:{index:true,follow:true}};
export default function TermsPage(){return <LegalPage kind="terms"/>;}
