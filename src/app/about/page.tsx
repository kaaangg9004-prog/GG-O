import type {Metadata} from 'next';
import {LegalPage} from '@/components/legal-document';
export const metadata:Metadata={title:'GG-O 소개',description:'한국과 베트남의 취향이 만나는 커뮤니티 GG-O를 소개합니다.',alternates:{canonical:'https://www.gg-o.net/about/'},robots:{index:true,follow:true}};
export default function AboutPage(){return <LegalPage kind="about"/>;}
