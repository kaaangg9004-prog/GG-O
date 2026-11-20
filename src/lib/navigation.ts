export const primaryNavigation=[
  {id:'home',label:'홈'},
  {id:'news',label:'소식'},
  {id:'community',label:'커뮤니티'},
  {id:'polls',label:'투표'},
  {id:'events',label:'이벤트'},
] as const;
export type PrimaryView=typeof primaryNavigation[number]['id'];
