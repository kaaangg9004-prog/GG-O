import type {Metadata} from 'next';
import {LegalPage} from '@/components/legal-document';
export const metadata:Metadata={title:'Giới thiệu về GG-O',description:'GG-O – cộng đồng và tạp chí trực tuyến dành cho người Việt yêu văn hóa Hàn Quốc.',robots:{index:true,follow:true}};
export default function AboutPage(){return <LegalPage kind="about"/>;}
