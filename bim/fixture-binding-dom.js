/* Minimal explicit DOM evidence for orchestration-only VM tests. Not a browser. */
module.exports = function installBindingDOM(context) {
  const doc = context.document;context.innerWidth=1000;context.innerHeight=800;
  const element = () => ({ nodeType:1, ownerDocument:doc, isConnected:true, style:{}, children:[],
    getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}), contains(e){return e===this||this.children.includes(e)},
    appendChild(e){this.children.push(e);e.parentElement=this;return e} });
  const container=element();container.className='adsk-viewing-viewer';
  const query=doc.querySelector,queryAll=doc.querySelectorAll;
  doc.querySelector=s=>s==='#viewer'?container:query?.(s);
  doc.querySelectorAll=s=>s==='.adsk-viewing-viewer'?[container]:queryAll?.(s)||[];
  doc.createElement=element;
  context.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
};
