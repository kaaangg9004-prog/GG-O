"""Generate selectable web SVG artwork from our original editable vector source."""
from pathlib import Path
import xml.etree.ElementTree as ET
ET.register_namespace('', 'http://www.w3.org/2000/svg')
root=Path(__file__).resolve().parents[1]/'public/images'

def artwork(source,dest,palette=None,texts=None,text_color=None):
    tree=ET.parse(root/source)
    for el in tree.iter():
        for key,value in list(el.attrib.items()):
            if palette and value in palette:el.set(key,palette[value])
        if el.tag.endswith('text'):
            if texts and el.text in texts:el.text=texts[el.text]
            if text_color:el.set('fill',text_color)
    tree.write(root/dest,encoding='unicode')

tote={'K-CULTURE · PLAY · COMMUNITY':'한국 문화 · 즐거움 · 커뮤니티'}
artwork('tote.svg','tote.svg',texts=tote)
artwork('tote.svg','tote-black.svg',palette={'#e6dfce':'#30322b','#f3efdf':'#24261f','#d5cbb9':'#181b15','#d9cfba':'#292c24','#f7f0dd':'#363a2e','#c8bca6':'#11140e','#c1b89f':'#525845','#e8decb':'#2b2f23','#181a16':'#f6f6ee'},text_color='#f6f6ee')
# Keep the neon brand tab's wordmark dark.
tree=ET.parse(root/'tote-black.svg')
for el in tree.iter():
    if el.tag.endswith('text') and el.attrib.get('font-size')=='17':el.set('fill','#101010')
tree.write(root/'tote-black.svg',encoding='unicode')
artwork('tint.svg','tint.svg',texts={'DAILY GLOW':'데일리 글로우','01 / SEOUL ROSE':'01 서울 로즈'})
artwork('tint.svg','tint-peach.svg',palette={'#ce696e':'#d67d54','#e19b97':'#f1ad83','#ae4753':'#bb6541','#bc5661':'#df8b60','#f2e8e6':'#f4ece3'},texts={'01 서울 로즈':'02 피치 무드'})
artwork('tint.svg','tint-cherry.svg',palette={'#ce696e':'#a63749','#e19b97':'#cf6675','#ae4753':'#852637','#bc5661':'#ac3349','#f2e8e6':'#f0e6e8'},texts={'01 서울 로즈':'03 체리 온'})
artwork('keyring.svg','keyring-white.svg',palette={'#adff00':'#f5f3eb','#7ba815':'#bdbcae','#7c9d21':'#a4a699','#e9eddf':'#e5e6df'})
artwork('keyring.svg','keyring-black.svg',palette={'#adff00':'#252822','#7ba815':'#535b48','#7c9d21':'#68705a','#e9eddf':'#e3e6dd'},text_color='#f8f8ef')
artwork('cap.svg','cap-beige.svg',palette={'#353632':'#cdbd9e','#171915':'#b6a588','#373832':'#dbceb4','#484941':'#a49170','#272923':'#b2a080','#41433a':'#96835f','#252720':'#af9b77','#adff00':'#292b24'})
artwork('pouch.svg','pouch.svg',texts={'SMALL THINGS, BIG VIBE.':'작지만 확실한 나만의 취향'})
artwork('pouch.svg','pouch-black.svg',palette={'#e6dfce':'#36392f','#f3efdf':'#252920','#d5cbb9':'#1b1f17','#252821':'#aab293','#777b6c':'#c7ceb9','#c4b99f':'#59654b'},text_color='#f4f6eb')
print('Variant artwork generated.')
