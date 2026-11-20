import fs from 'node:fs';
import path from 'node:path';
import {translateText} from '../src/lib/i18n';

const directory=path.join(process.cwd(),'public/images');
for(const filename of fs.readdirSync(directory).filter(file=>file.endsWith('.svg')&&!/\.(vi|en)\.svg$/.test(file))){
  const source=fs.readFileSync(path.join(directory,filename),'utf8');
  if(!/[가-힣]/.test(source))continue;
  for(const locale of ['vi','en'] as const){
    const localized=source.replace(/<text([^>]*)>([^<>]*)<\/text>/g,(whole,attributes:string,content:string)=>{
      if(!/[가-힣]/.test(content))return whole;
      const translated=translateText(content,locale).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
      const width=filename.startsWith('tote')?300:filename.startsWith('pouch')?340:132;
      const adjusted=attributes.replace(/\sletter-spacing="[^"]*"/g,'');
      return '<text'+adjusted+' textLength="'+width+'" lengthAdjust="spacingAndGlyphs">'+translated+'</text>';
    });
    if(/[가-힣]/.test(localized))throw new Error('Untranslated image text in '+filename+' '+locale);
    fs.writeFileSync(path.join(directory,filename.replace(/\.svg$/,'.'+locale+'.svg')),localized);
  }
}
