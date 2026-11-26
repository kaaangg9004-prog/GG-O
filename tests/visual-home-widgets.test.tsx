import "./dom-setup";
import assert from "node:assert/strict";
import test from "node:test";
import {fireEvent,render} from "@testing-library/react";
import {VisualHomeCanvas,widgetCopy,widgetOrder} from "../src/components/visual-home-widgets";
import type {HomeLayout} from "../src/components/visual-home-widgets";

test("home widget order, language-specific text and visibility apply independently",()=>{
 const layout:HomeLayout={order:["community","news"],widgets:{news:{hidden:true},community:{columns:8,copy:{vi:{title:"Cộng đồng",action:""}}}}};
 assert.deepEqual(widgetOrder(layout),["community","news","hero","polls","journal","events"]);
 assert.equal(widgetCopy(layout,"community","vi",value=>value).action,"");
 assert.equal(widgetCopy(layout,"community","ko",value=>value).title,"짧게 나누는 이야기");
 const widgets={hero:"Hero",news:"News",polls:"Polls",community:"Community",journal:"Journal",events:"Events"};
 const ui=render(<VisualHomeCanvas layout={layout} widgets={widgets}/>);
 try{
   assert.equal(ui.queryByText("News"),null);
   assert.equal(ui.getByText("Community").parentElement?.style.gridColumn,"span 8");
   assert.equal(ui.queryByRole("button",{name:"위젯 크기 조절"}),null);
   let adjusted:HomeLayout|undefined;
   ui.rerender(<VisualHomeCanvas layout={layout} widgets={widgets} selected="community" onSelect={()=>{}} onChange={value=>{adjusted=value;}}/>);
   assert.ok(ui.getByText("News"));
   fireEvent.keyDown(ui.getByRole("button",{name:"위젯 크기 조절"}),{key:"ArrowRight"});
   assert.equal(adjusted?.widgets?.community?.columns,9);
 }finally{ui.unmount();}
});
