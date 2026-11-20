const MAX_SOURCE=12*1024*1024;
export async function readProductPhoto(file:File):Promise<string> {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('JPG, PNG, WebP 사진만 등록할 수 있습니다.');
  if(file.size>MAX_SOURCE)throw new Error('원본 사진은 12MB 이하로 선택해 주세요.');
  const source=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('사진을 읽지 못했습니다. 다시 선택해 주세요.'));reader.readAsDataURL(file);});
  const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('사진 파일을 확인해 주세요. 손상된 사진은 등록할 수 없습니다.'));img.src=source;});
  const ratio=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
  const context=canvas.getContext('2d');if(!context)throw new Error('이 브라우저에서는 사진을 처리할 수 없습니다. 다른 브라우저에서 다시 시도해 주세요.');
  context.drawImage(image,0,0,canvas.width,canvas.height);
  for(const quality of [.84,.72,.6]){const result=canvas.toDataURL('image/webp',quality);if(result.length<=1000000)return result;}
  throw new Error('사진 용량을 줄이지 못했습니다. 더 작은 사진을 선택해 주세요.');
}
