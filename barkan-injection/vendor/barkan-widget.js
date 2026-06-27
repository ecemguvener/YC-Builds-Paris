var BarkanWidget=(function(e){Object.defineProperty(e,Symbol.toStringTag,{value:`Module`});var t=28,n=6,r=32,i=20;function a(e,t,n){return n.startsWith(`#/`)?n.slice(1):`${e}${t}`}function o(e,n,a,o=12){let s=a.width>0&&a.height>0,u=s?Math.max(t,Math.ceil(a.width)+r):t,d=s?Math.max(t,Math.ceil(a.height)+i):t,f=e.x+r+a.width<=n.width-o?`right`:`left`,m=c(e.y+i+a.height<=n.height-o?`below`:`above`,f).map((t,r)=>l(t,e,n,u,d,a,o,r));m.sort((e,t)=>e.score===t.score?e.order-t.order:e.score-t.score);let h=m[0]??l(`below-right`,e,n,u,d,a,o,0),g=s?p(h.bubbleRect,n,o):{x:0,y:0};return{placement:h.placement,width:u,height:d,x:h.x+g.x,y:h.y+g.y}}var s=class{handler;queue=[];isProcessing=!1;constructor(e){this.handler=e}enqueue(e){this.queue.push(e),this.drain()}clear(){this.queue.length=0}get pendingCount(){return this.queue.length}get processing(){return this.isProcessing}async drain(){if(!this.isProcessing){this.isProcessing=!0;try{for(;this.queue.length>0;){let e=this.queue.shift();e!==void 0&&await this.handler(e)}}finally{this.isProcessing=!1}}}};function c(e,t){return[`${e}-${t}`,`${e}-${t===`right`?`left`:`right`}`,`${e===`below`?`above`:`below`}-${t}`,`${e===`below`?`above`:`below`}-${t===`right`?`left`:`right`}`]}function l(e,t,r,i,a,o,s,c){let l=e.endsWith(`right`)?n:i-n,p=e.startsWith(`below`)?n:a-n,m=t.x-l,h=t.y-p,g=u(e,m,h,i,a,o),_=d(e,m,h,i,a),v=o.width>0&&o.height>0?f(g,r,s):0,y=f(_,r,0);return{placement:e,order:c,x:m,y:h,bubbleRect:g,score:v*10+y}}function u(e,t,n,a,o,s){let c=e.endsWith(`right`),l=e.startsWith(`below`),u=c?t+r:t+a-r-s.width,d=l?n+i:n+o-i-s.height;return{left:u,top:d,right:u+s.width,bottom:d+s.height}}function d(e,n,r,i,a){let o=e.endsWith(`right`),s=e.startsWith(`below`),c=o?n:n+i-t,l=s?r:r+a-t;return{left:c,top:l,right:c+t,bottom:l+t}}function f(e,t,n){return Math.max(0,n-e.left)+Math.max(0,n-e.top)+Math.max(0,e.right-(t.width-n))+Math.max(0,e.bottom-(t.height-n))}function p(e,t,n){let r=0,i=0,a=t.width-n,o=t.height-n;return e.left<n?r=n-e.left:e.right>a&&(r=a-e.right),e.top<n?i=n-e.top:e.bottom>o&&(i=o-e.bottom),{x:r,y:i}}var m=/\[(POINTBOX|POINT):([^\]]+)\]/i,h=/\[(?:POINTELEMENT|POINELEMENT):([^\]:]+):([^\]]+)\]/i,g=/\[(?:POINTELEMENT|POINELEMENT):([^\]:\]\s]+):([^\]\n]{1,80})$/i,_=/\[SCROLL:([^\]:]+):(up|down):([^\]]+)\]/i,v=/\[SCROLLTO:([^\]:]+):([^\]]+)\]/i,y=/^\s*\[(POINTBOX|POINT):([^\]]+)\]\s*(.*)$/is,b=/^\s*\[(?:POINTELEMENT|POINELEMENT):([^\]:]+):([^\]]+)\]\s*(.*)$/is,x=/^\s*\[SCROLL:([^\]:]+):(up|down):([^\]]+)\]\s*(.*)$/is,ee=/^\s*\[SCROLLTO:([^\]:]+):([^\]]+)\]\s*(.*)$/is,te=/^\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*:(.+?)\s*$/i,ne={spokenText:``,box:null,elementId:null,scroll:null,scrollTo:null};function re(e){if(!e.trim())return ne;let t=e.match(ee),n=t??e.match(v);if(n)return{spokenText:C(t?t[3]:e.replace(n[0],` `)),...S(),scrollTo:{elementId:n[1].trim(),label:n[2].trim()}};let r=e.match(x),i=r??e.match(_);if(i)return{spokenText:C(r?r[4]:e.replace(i[0],` `)),...S(),scroll:{surfaceId:i[1].trim(),direction:i[2].toLowerCase()===`up`?`up`:`down`,label:i[3].trim()},scrollTo:null};let a=e.match(b),o=a??e.match(h)??e.match(g);if(o)return{spokenText:C(a?a[3]:e.replace(o[0],` `)),...S(),elementId:o[1].trim()};let s=e.match(y),c=s??e.match(m);if(!c)return{spokenText:C(e),...S()};let l=c[1].toUpperCase(),u=c[2].trim(),d=C(s?s[3]:e.replace(c[0],` `));if(l!==`POINTBOX`||u.toLowerCase()===`none`)return{spokenText:d,...S()};let f=u.match(te);return f?{spokenText:d,box:{ymin:T(parseInt(f[1],10)),xmin:T(parseInt(f[2],10)),ymax:T(parseInt(f[3],10)),xmax:T(parseInt(f[4],10)),label:f[5].trim()},elementId:null,scroll:null,scrollTo:null}:{spokenText:d,...S()}}function S(){return{box:null,elementId:null,scroll:null,scrollTo:null}}function ie(e){return w(e)?null:re(e)}function ae(e,t,n){return{x:(e.xmin+e.xmax)/2/1e3*t,y:(e.ymin+e.ymax)/2/1e3*n}}function C(e){return e.replace(/\[NAVIGATE:[^\]]+\]/gi,` `).replace(/\[SCROLLTO:[^\]]+\]/gi,` `).replace(/\[SCROLL:[^\]]+\]/gi,` `).replace(/\[(?:POINTELEMENT|POINELEMENT):[^\]]+\]/gi,` `).replace(/\[(?:POINTBOX|POINT):[^\]]+\]/gi,` `).replace(/\[NEED_FURTHER_ACTION:(?:true|false)\]/gi,` `).replace(/\[(?:NAVIGATE|SCROLLTO|SCROLL|POINTELEMENT|POINELEMENT|POINTBOX|POINT):[^\]]*$/gi,` `).replace(/\[(?:NAVIGATE|SCROLLTO|SCROLL|POINTELEMENT|POINELEMENT|POINTBOX|POINT)[^\]]*$/gi,` `).replace(/\[NEED_FURTHER_ACTION(?::(?:true|false)?)?$/gi,` `).replace(/\[(?:NEED|need)(?:_(?:FURTHER|further|ACTION|action))*:? *(?:true|false)?(?=[A-Za-z\s]|$)/g,` `).replace(/\s+/g,` `).trim()}function w(e){let t=e.trimStart();return!t.startsWith(`[`)||t.includes(`]`)?!1:/^\[(?:P|PO|POI|POIN|POINT|POINTB|POINTBO|POINTBOX|POINE|POINEL|POINELE|POINELEM|POINELEME|POINELEMEN|POINELEMENT|POINTE|POINTEL|POINTELE|POINTELEM|POINTELEME|POINTELEMEN|POINTELEMENT|S|SC|SCR|SCRO|SCROL|SCROLL|SCROLLT|SCROLLTO)?(?::|$)/i.test(t)}function T(e){return Number.isNaN(e)?0:Math.max(0,Math.min(1e3,e))}function oe(e){let t=e.trim();if(!t||t===`[DONE]`)return null;try{let e=JSON.parse(t);if(e.type===`error`)return{type:`error`,error:e.error||`stream failed`};if(e.type===`ready`)return{type:`ready`};if(e.type===`openai_response`&&typeof e.responseId==`string`)return{type:`openai_response`,responseId:e.responseId};if(e.type===`assistant_text`&&typeof e.text==`string`)return{type:`assistant_text`,text:e.text};if(e.type===`question`){let t=Array.isArray(e.questions)?e.questions.map(e=>E(e)).filter(e=>!!e):[],n=typeof e.question==`string`?E({question:e.question,choices:e.choices}):null,r=t.length>0?t:n?[n]:[],i=r[0];if(i)return{type:`question`,question:i.question,choices:i.choices,questions:r,...typeof e.toolCallId==`string`?{toolCallId:e.toolCallId}:{}}}if(e.type===`point`){let t=ce(e.box);return{type:`point`,elementId:typeof e.elementId==`string`?e.elementId:void 0,box:t,label:typeof e.label==`string`?e.label:void 0,...e.needFurtherAction===!0?{needFurtherAction:!0}:{}}}return e.type===`scroll`?{type:`scroll`,elementId:typeof e.elementId==`string`?e.elementId:void 0,surfaceId:typeof e.surfaceId==`string`?e.surfaceId:void 0,direction:e.direction===`up`||e.direction===`down`?e.direction:void 0,label:typeof e.label==`string`?e.label:void 0,...e.needFurtherAction===!0?{needFurtherAction:!0}:{}}:e.type===`navigate`&&typeof e.route==`string`?{type:`navigate`,route:e.route,label:typeof e.label==`string`?e.label:void 0}:e.type===`done`?{type:`done`}:e.text?{type:`text`,text:e.text}:null}catch(e){if(e instanceof SyntaxError)return null;throw e}}function E(e){if(!e||typeof e!=`object`||Array.isArray(e))return null;let t=e;if(typeof t.question!=`string`)return null;let n=t.question.trim();if(!n)return null;let r=(Array.isArray(t.choices)?t.choices:Array.isArray(t.options)?t.options:[]).map(e=>se(e)).filter(e=>!!e);return r.length>=2?{question:n,choices:r}:null}function se(e){if(!e||typeof e!=`object`||Array.isArray(e))return null;let t=e;if(typeof t.label!=`string`)return null;let n=t.label.trim();return n?{label:n,value:typeof t.value==`string`?t.value:n,...t.recommended===!0?{recommended:!0}:{}}:null}function ce(e){if(!e||typeof e!=`object`)return;let t=e;if(!(typeof t.ymin!=`number`||typeof t.xmin!=`number`||typeof t.ymax!=`number`||typeof t.xmax!=`number`))return{ymin:le(t.ymin),xmin:le(t.xmin),ymax:le(t.ymax),xmax:le(t.xmax)}}function le(e){return Number.isFinite(e)?Math.max(0,Math.min(1e3,e)):0}async function ue(e,t,n,r){let i=e.body?.getReader();if(!i)return;let a=new TextDecoder,o=``,s=performance.now(),c=0,l=0;for(;;){let{done:e,value:u}=await i.read();if(e)break;c+=1,l+=u.byteLength,await r?.({chunkIndex:c,byteLength:u.byteLength,totalBytes:l,elapsedMs:Math.round(performance.now()-s)}),o+=a.decode(u,{stream:!0});let d=o.indexOf(`

`);for(;d>=0;){let e=o.slice(0,d);o=o.slice(d+2),d=o.indexOf(`

`);let r=oe(e.split(/\r?\n/).filter(e=>e.startsWith(`data:`)).map(e=>e.slice(5).trimStart()).join(`
`));if(r){if(r.type===`error`)throw Error(r.error);await n?.(r),(r.type===`text`||r.type===`assistant_text`)&&r.text&&await t(r.text)}}}}var de=24,fe=48,pe=class{latestObservedSpokenText=``;emittedCharacterCount=0;updateSpokenPreview(e){let t=e.trim();if(!t)return this.latestObservedSpokenText=``,[];let n=ge(this.latestObservedSpokenText,t);return this.latestObservedSpokenText=t,n<this.emittedCharacterCount?[]:this.extractReadyChunks(t,!1)}flushRemaining(e){let t=this.extractReadyChunks(e.trim(),!0);return t.length===0?null:{text:t.map(e=>e.text).join(``),flush:t.at(-1)?.flush??!0}}extractReadyChunks(e,t){let n=[];for(;this.emittedCharacterCount<e.length;){let r=e.slice(this.emittedCharacterCount),i=t?r.length:me(r);if(i<=0)break;let a=r.slice(0,i);this.emittedCharacterCount+=i,a.trim()&&n.push({text:a,flush:t&&this.emittedCharacterCount>=e.length})}return n}};function me(e){let t=he(e,/[.!?]/);if(t>0)return t;if(e.length>=de){let t=he(e,/[,;:]/);if(t>0)return t}if(e.length>=fe){let t=e.lastIndexOf(` `);if(t>0)return t+1}return 0}function he(e,t){let n=0;for(let r=0;r<e.length;r++)if(t.test(e[r]))for(n=r+1;n<e.length&&/[\s"')\]}]/.test(e[n]);)n++;return n}function ge(e,t){let n=Math.min(e.length,t.length),r=0;for(;r<n&&e[r]===t[r];)r++;return r}function _e(e){let[t]=e,n=e.length===1?t?.result:null;return{ok:e.every(({result:e})=>e.ok),...n?.status===void 0?{}:{status:n.status},...n?.contentType===void 0?{}:{contentType:n.contentType},...n?.error?{error:n.error}:{},body:e.map(({httpCall:e,result:t})=>({httpCall:ke(e),result:t}))}}function ve(e){return{version:1,httpCallCount:0,failedHttpCallCount:0,loadedEndpointDocKeys:[]}}function ye(e){let t=e?.trim().replace(/\.+$/,``).trim();return!t||Ce(t)?`Running action...`:be(t)??`Running action...`}function be(e){let t=e?.trim().replace(/\.+$/,``).trim();return t?`${t}...`:null}function xe(e,t,n){let r=Se(e);return{title:Be(e,t,n),positiveCount:r.positiveCount,negativeCount:r.negativeCount,hasIssues:ze(e)}}function Se(e){let t=Fe(e),n=0,r=0;for(let e of t){if(!Re(e))continue;let t=Ie(e).toUpperCase();t===`POST`||t===`PUT`||t===`PATCH`?n+=1:t===`DELETE`&&(r+=1)}return{positiveCount:n,negativeCount:r}}function Ce(e){return new Set([`Thinking`,`Creating plan`,`Searching documentation`,`Finishing up`]).has(e)}async function we(e,t=fetch,n=window.location.origin,r=document){let i;try{i=Ae(e.path,e.query,n)}catch(e){return{ok:!1,error:e instanceof Error?e.message:String(e)}}try{let n=e.body!==void 0&&Object.keys(e.body).length>0,a=await t(i,{method:e.method,credentials:`include`,headers:je(n,r),...n?{body:JSON.stringify(e.body)}:{}}),o=a.headers.get(`content-type`)??``,s=await a.text();return{ok:a.ok,status:a.status,contentType:o,body:Pe(s,o)}}catch(e){return{ok:!1,error:e instanceof Error?e.message:String(e)}}}async function Te(e,t=fetch,n=window.location.origin,r=document){return Promise.all(e.map(async e=>({httpCall:e,result:await we(e,t,n,r)})))}function Ee(e,t,n=30){let r=et(t.text).slice(0,1e3).trim();return r?[...e,{role:t.role,text:r}].slice(-n):e.slice(-n)}function De(e,t){let n=t.status?` ${t.status}`:``,r=t.ok?Qe(t.body):t.error||Qe(t.body);return`${e.method.toUpperCase()} ${e.documentedPath} -> ${t.ok?`ok`:`failed`}${n}${r?`: ${r}`:``}`}function Oe(e){return Array.isArray(e.httpCalls)&&e.httpCalls.length>0?e.httpCalls:e.httpCall?[e.httpCall]:[]}function ke(e){return{...e.callId?{callId:e.callId}:{},...e.taskId?{taskId:e.taskId}:{},...e.itemKey?{itemKey:e.itemKey}:{},method:e.method,documentedPath:e.documentedPath,path:e.path,...e.query?{query:e.query}:{},...e.body?{body:e.body}:{}}}function Ae(e,t,n=window.location.origin){if(!Ne(e))throw Error(`Action request path is not allowed.`);let r=new URL(e,n);if(r.origin!==n)throw Error(`Action request must stay on the current origin.`);for(let[e,n]of Object.entries(t??{}))Me(r,e,n);return r.toString()}function je(e,t=document){let n={accept:`application/json`};e&&(n[`content-type`]=`application/json`);let r=Ze(t);return r&&(n[`x-csrf-token`]=r,n[`x-xsrf-token`]=r),n}function Me(e,t,n){if(n!=null){if(Array.isArray(n)){for(let r of n)Me(e,t,r);return}if(typeof n==`object`){e.searchParams.append(t,JSON.stringify(n));return}e.searchParams.append(t,String(n))}}function Ne(e){return e.startsWith(`/`)&&!e.startsWith(`//`)&&!e.includes(`\\`)&&!/^[a-z][a-z0-9+.-]*:/i.test(e)}function Pe(e,t){if(!e)return null;if(t.toLowerCase().includes(`json`))try{return JSON.parse(e)}catch{return e}return e}function Fe(e){return!D(e)||!Array.isArray(e.completedHttpCalls)?[]:e.completedHttpCalls}function Ie(e){return!D(e)||!D(e.httpCall)||typeof e.httpCall.method!=`string`?``:e.httpCall.method}function Le(e){return!D(e)||!D(e.httpCall)?``:typeof e.httpCall.documentedPath==`string`?e.httpCall.documentedPath:typeof e.httpCall.path==`string`?e.httpCall.path:``}function Re(e){return!D(e)||!D(e.result)?!1:e.result.ok===!0}function ze(e){return D(e)?Xe(e.failedHttpCallCount)>0||Array.isArray(e.failedHttpCalls)&&e.failedHttpCalls.length>0?!0:Je(e).some(e=>{let t=Ye(e,`status`);return t===`failed`||t===`blocked`||t===`partial`}):!1}function Be(e,t,n){return Ke(n)||Ve(e)||Ke(Ye(Je(e).find(e=>Ye(e,`status`)===`completed`),`label`))||Ke(Ye(D(e)&&D(e.goalPlan)?e.goalPlan:null,`originalUserMessage`))||Ke(t)||`Completed action`}function Ve(e){let t=Fe(e).filter(Re),n=new Map,r=new Set;for(let e of t){let t=Ie(e).toUpperCase();if(![`POST`,`PUT`,`PATCH`,`DELETE`].includes(t))continue;r.add(t);let i=Ue(Le(e));n.set(i,(n.get(i)??0)+1)}let i=[...n.entries()].slice(0,3).map(([e,t])=>`${t} ${t===1?Ge(e):e}`);return i.length>0?`${He(r)} ${i.join(`, `)}`:``}function He(e){return e.size===1&&e.has(`POST`)?`Created`:e.size===1&&e.has(`DELETE`)?`Deleted`:`Edited`}function Ue(e){return We(e.split(`?`)[0].split(`/`).filter(e=>e&&!e.startsWith(`:`)&&!e.startsWith(`{`)&&!e.startsWith(`[`)).reverse().find(e=>!/^(api|v\d+|id)$/i.test(e)&&!/^\d+$/.test(e)&&!/^[a-f0-9]{12,}$/i.test(e))||`items`)}function We(e){let t=e.replace(/[-_]+/g,` `).replace(/([a-z])([A-Z])/g,`$1 $2`).trim().toLowerCase();return t.endsWith(`s`)?t:`${t}s`}function Ge(e){return e.endsWith(`s`)?e.slice(0,-1):e}function Ke(e){if(typeof e!=`string`)return``;let t=e.replace(/\s+/g,` `).trim().replace(/^[-*•]\s*/,``).replace(/^(?:done|all set|completed)[.!,:;-]?\s*/i,``).replace(/^i\s+(?:created|added|edited|updated|renamed|deleted|removed)\b\s*/i,e=>e.replace(/^i\s+/i,``).replace(/\b\w/,e=>e.toUpperCase())).replace(/^i completed:?\s*/i,``).replace(/^i(?:'|’)ve completed:?\s*/i,``).trim();if(!t||/^(?:done|all set|completed)$/i.test(t))return``;let n=qe(t).replace(/[.!?]+$/g,``).trim();return n.length>96?`${n.slice(0,93).trimEnd()}...`:n}function qe(e){let t=[...`.!?`].map(t=>e.indexOf(t)).filter(e=>e>=0).sort((e,t)=>e-t)[0];return t===void 0?e:e.slice(0,t+1)}function Je(e){return!D(e)||!D(e.goalPlan)||!Array.isArray(e.goalPlan.tasks)?[]:e.goalPlan.tasks.filter(D)}function Ye(e,t){if(!D(e))return``;let n=e[t];return typeof n==`string`?n:``}function Xe(e){return typeof e==`number`&&Number.isFinite(e)?e:0}function D(e){return!!(e&&typeof e==`object`&&!Array.isArray(e))}function Ze(e){let t=[`csrf-token`,`csrf`,`_csrf`,`xsrf-token`].map(t=>e.querySelector(`meta[name="${t}"]`)?.content?.trim()).find(Boolean);if(t)return t;let n=e.cookie.split(`;`).map(e=>e.trim()).map(e=>{let t=e.indexOf(`=`);return t>=0?[e.slice(0,t),e.slice(t+1)]:[e,``]}).find(([e])=>/^(xsrf-token|csrf-token|csrftoken|csrf_token|csrf)$/i.test(e));return n?decodeURIComponent(n[1]):``}function Qe(e){return e==null?``:et(typeof e==`string`?e:JSON.stringify($e(e))).replace(/\s+/g,` `).slice(0,240)}function $e(e){return Array.isArray(e)?e.slice(0,8).map($e):!e||typeof e!=`object`?e:Object.fromEntries(Object.entries(e).map(([e,t])=>[e,tt(e)?`[redacted]`:$e(t)]))}function et(e){return e.replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi,`$1[redacted]`).replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g,`[redacted]`).replace(/\b([A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})\b/g,`[redacted]`).replace(/\b(password|token|api[_-]?key|authorization|cookie)\b\s*[:=]\s*["']?[^"',\s}]+/gi,`$1: [redacted]`)}function tt(e){return/password|token|api_?key|apikey|authorization|cookie/i.test(e)}function O(e){let t=Array.from(e.children).filter(M);M(e)&&e.shadowRoot&&t.push(...Array.from(e.shadowRoot.children).filter(M));let n=it(e);return n&&t.push(...Array.from(n.children).filter(M)),t}function k(e){if(e.parentElement)return e.parentElement;let t=e.getRootNode();if(st(t)&&M(t.host))return t.host;let n=e.ownerDocument.defaultView?.frameElement;return M(n)?n:null}function A(e,t){if(e===t||e.contains(t))return!0;let n=k(t);for(;n;){if(n===e)return!0;n=k(n)}return!1}function nt(e,t,n){let r=[],i=[...O(e)].reverse();for(;i.length>0&&r.length<t;){let e=i.pop();n(e)||(r.push(e),i.push(...O(e).reverse()))}return r}function*rt(e,t,n){let r=[...O(e)].reverse(),i=0;for(;r.length>0&&i<t;){let e=r.pop();i++,!n(e)&&(yield e,r.push(...O(e).reverse()))}}function j(e){let t=e.getBoundingClientRect(),n=t.left,r=t.top,i=e.ownerDocument.defaultView?.frameElement;for(;M(i);){let e=i.getBoundingClientRect();n+=e.left,r+=e.top,i=i.ownerDocument.defaultView?.frameElement}return ct(n,r,t.width,t.height)}function it(e){if(!N(e,`HTMLIFrameElement`))return null;try{let t=e.contentDocument?.body;return t&&M(t)?t:null}catch{return null}}function M(e){if(!e||typeof e!=`object`||!(`ownerDocument`in e))return!1;let t=e,n=t.ownerDocument?.defaultView;return!!(n?.HTMLElement&&t instanceof n.HTMLElement)}function N(e,t){let n=e.ownerDocument?.defaultView,r=n?n[t]:void 0;return typeof r==`function`&&e instanceof r}function at(e,t){let n=e.getRootNode();if(st(n)){let e=n.getElementById(t);if(M(e))return e}let r=e.ownerDocument.getElementById(t);return M(r)?r:null}function ot(e,t){if(t.isPointable(e))return e;let n=j(e);if(n.width<1||n.height<1)return e;let r=Math.max(1,n.width*n.height),i=k(e),a=0,o=t.maxDepth??6;for(;i&&a<o&&!t.shouldIgnore?.(i);){if(t.isPointable(i)){let e=j(i),t=Math.max(1,e.width*e.height),a=n.left>=e.left-2&&n.top>=e.top-2&&n.right<=e.right+2&&n.bottom<=e.bottom+2,o=t<=r*90||e.width<=420||e.height<=160,s=e.width*e.height<=window.innerWidth*window.innerHeight*.65;if(a&&o&&s)return i}i=k(i),a++}return e}function st(e){if(!e||typeof e!=`object`)return!1;let t=e;return typeof t.getElementById==`function`&&M(t.host)}function ct(e,t,n,r){return typeof DOMRect<`u`?DOMRect.fromRect({x:e,y:t,width:n,height:r}):{x:e,y:t,left:e,top:t,width:n,height:r,right:e+n,bottom:t+r,toJSON(){return{x:e,y:t,width:n,height:r,left:e,top:t,right:e+n,bottom:t+r}}}}function lt(e,t={}){let n=ut(e);return n.requiredTokens.length>0&&(!n.elementAligned&&n.elementMatchedRequiredTokenCount===0||!n.aligned&&n.matchedRequiredTokenCount===0)||(e.uiFacts?.length??0)===0&&(t.livePrimaryControlCount??0)>0}function ut(e){let t=pt(e.route),n=mt(t);if(n.length===0)return{routeTokens:t,requiredTokens:n,matchedRequiredTokenCount:0,elementMatchedRequiredTokenCount:0,aligned:!0,elementAligned:!0};let r=new Set(vt(dt(e))),i=new Set(vt(ft(e))),a=n.filter(e=>r.has(e)).length,o=n.filter(e=>i.has(e)).length;return{routeTokens:t,requiredTokens:n,matchedRequiredTokenCount:a,elementMatchedRequiredTokenCount:o,aligned:a===n.length,elementAligned:o===n.length}}function dt(e){let t=[e.title??``,e.pageMeta?.title??``,...e.pageMeta?.headings??[],...e.pageMeta?.landmarks??[],...e.pageMeta?.selectedNav??[]];for(let n of[...e.uiFacts??[],...e.offscreenUiFacts??[]])t.push(n.label??``,n.text??``,n.context??``);return t.push(ft(e)),bt(t.filter(Boolean).join(` `)).slice(0,6e3)}function ft(e){let t=[],n=(e=[])=>{for(let r of e)(r.visibility===`visible`||r.visibility===`partially_visible`||!r.visibility)&&t.push(r.label??``,r.text??``,...Object.values(r.attributes??{})),r.children?.length&&n(r.children)};return n(e.elements),bt(t.filter(Boolean).join(` `)).slice(0,6e3)}function pt(e){let t=ht(e).split(`/`).map(e=>gt(e)).filter(Boolean),n=[];for(let e of t)if(!_t(e))for(let t of vt(e.replace(/[-_]+/g,` `)))n.includes(t)||n.push(t);return n.slice(0,8)}function mt(e){let t=new Set([`setting`,`settings`,`home`,`dashboard`,`page`,`view`,`index`]),n=e.filter(e=>!t.has(e));return n.length>0?n.slice(-3):e.slice(-1)}function ht(e){try{return new URL(e,`https://example.invalid`).pathname}catch{return e.split(/[?#]/,1)[0]??``}}function gt(e){try{return decodeURIComponent(e)}catch{return e}}function _t(e){let t=e.trim().toLowerCase();return/^(new|edit|details?|overview|index)$/.test(t)||/^\d+$/.test(t)||/^[a-f0-9]{8,}$/i.test(t)||/^[a-z]+_[a-z0-9]{8,}$/i.test(t)||t.length>18&&/\d/.test(t)}function vt(e){return Array.from(new Set(e.toLowerCase().replace(/&/g,` and `).replace(/[^a-z0-9]+/g,` `).split(/\s+/).map(e=>yt(e.trim())).filter(e=>e.length>=2)))}function yt(e){return e.length>4&&e.endsWith(`ies`)?`${e.slice(0,-3)}y`:e.length>3&&e.endsWith(`s`)&&!e.endsWith(`ss`)?e.slice(0,-1):e}function bt(e){return e.replace(/\s+/g,` `).trim()}var xt={audio:{channelCount:1,echoCancellation:!0,noiseSuppression:!0,autoGainControl:!0}},P=.42,St=[.52,.72,.58,.9,1,.86,.76,.6,.5],F=16e3,Ct=.08,wt=.02,Tt=700,Et=1300,Dt=350,Ot=80,kt=120,At=430,jt=360,Mt=680,Nt=320,Pt=420,Ft=`margin-right ${Pt}ms cubic-bezier(.22, 1, .36, 1)`,It=`dom-settle-latency-2026-05-28`,Lt=7e3,Rt=3e3,zt=200,Bt=24,Vt=120,Ht=[`a[href]`,`button`,`input`,`select`,`textarea`,`summary`,`option`,`[role='button']`,`[role='link']`,`[role='menuitem']`,`[role='tab']`,`[role='checkbox']`,`[role='radio']`,`[role='switch']`,`[role='option']`,`[role='textbox']`,`[role='combobox']`,`[role='searchbox']`,`[role='slider']`,`[role='spinbutton']`].join(`,`),I=700,Ut=140,Wt=10,Gt=72,Kt=48,qt=96,Jt=2500,Yt=900,Xt=420,Zt=700,Qt=520,$t=32,en=700,tn=1400,nn=850,rn=25,an=220,on=180,sn=120,cn=150,ln=140,un=2,dn=2,fn=140,pn=3,mn=950,hn=140,gn=120,_n=420,vn=12,yn=`data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQQAAAAAAA==`,bn=[{mode:`show`,emptyLabel:`Ask`,composerLabel:`Show`},{mode:`act`,emptyLabel:`Do`,composerLabel:`Act`},{mode:`automation`,emptyLabel:`Automate`,composerLabel:`Automation`}];function xn(e){return e===`show`||e===`act`||e===`automation`}function Sn(e,t){let n=bn.find(t=>t.mode===e);return t===`empty`?n?.emptyLabel??`Ask`:n?.composerLabel??`Show`}function Cn(e){return e===`act`?`anything with Barkan.`:e===`automation`?`with Barkan.`:`Barkan anything.`}function wn(e){return!!(e&&typeof e==`object`&&!Array.isArray(e)&&`pendingQuestion`in e&&e.pendingQuestion)}function Tn(){return window.matchMedia?.(`(prefers-reduced-motion: reduce)`).matches===!0}var En=class{siteKey;scriptOrigin;apiBaseUrl;config=null;root;launcherButton;callControl;micButton;textQuestionForm;textQuestionInput;textQuestionSendButton;actionChoiceContainer;chatPanel;chatResizeHandle;chatCloseButton;chatMessageList;chatEmptyState;chatEmptyModePicker;chatEmptyModeButton;chatEmptyModeLabel;chatEmptyModeOptions;chatEmptyModeSuffix;textQuestionModePicker;textQuestionModeButton;textQuestionModeLabel;textQuestionModeOptions;hangupButton;callStatus;agent;agentPointer;agentBubble;waveformBars;lastWaveformLevel=0;waveformAnimationId=null;waveformCurrentScales=[];waveformTargetScales=[];agentTarget=null;lastMousePosition=null;state=`idle`;hasShownMicConsent=!1;isCallActive=!1;isMuted=!1;isTextModeActive=!1;isLauncherBusy=!1;isChatCallBusy=!1;textEntryMode=`show`;preferredTextEntryMode=`show`;openModePicker=null;isActionModeActive=!1;goalRunState=null;choicePrompts=[];choiceAnswerStates=[];activeChoicePromptIndex=0;choicePromptMode=null;goalConversationContext=[];chatMessages=[];isChatThinking=!1;chatThinkingText=`Thinking`;chatThinkingTargetText=`Thinking`;chatThinkingPreviousText=null;isChatThinkingTransitioning=!1;chatThinkingTransitionTimer=null;chatThinkingTransitionSequence=0;expandedChatActivityMessageIds=new Set;chatSidebarWidth=At;isChatSidebarResizing=!1;pageResizeRestore=null;pageResizeTargetRestores=[];pageResizeCleanupTimer=null;callSessionId=0;activeTranscriber=null;activeTts=null;activeHttpTts=null;activeHttpTtsStopper=null;primedTtsAudio=null;primedInputAudioContext=null;activeMicrophoneStream=null;activeOpenAIAbortController=null;activeActionAbortController=null;isSpeechInterruptedByUser=!1;currentAssistantSpeech=``;recentAssistantSpeech=[];recentUserTranscripts=[];microphoneRecoveryPromise=null;microphoneHealthTimer=null;turnQueue=new s(e=>this.processCommittedTurn(e));actionQueue=new s(e=>this.processActionTurn(e));automationSequenceId=0;actionGenerationSequenceId=0;automationTimers=[];automationAuthorizationMessageId=null;lastOpenAIResponseId=null;pendingOpenAIResponseId=null;navigationContext=null;pendingGuidanceClick=null;pendingClarificationContext=null;microphoneStream=null;sttTokenPromise=null;ttsTokenPromise=null;constructor(e){this.siteKey=e.dataset.barkanSite??``,this.scriptOrigin=new URL(e.src,window.location.href).origin,this.apiBaseUrl=this.scriptOrigin,this.preferredTextEntryMode=this.readPersistedTextEntryMode(),this.setTextEntryMode(this.preferredTextEntryMode,{persistPreference:!1}),this.root=document.createElement(`div`),this.root.id=`barkan-widget-root`,this.root.dataset.barkanChatTheme=`system`;let t=this.root.attachShadow({mode:`open`});t.innerHTML=`
      <style>
        :host {
          all: initial;
          color-scheme: light;
          --barkan-font-ui: "Leurn", "Barkan Sans", "Segoe UI", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
          --barkan-panel-bg: #ffffff;
          --barkan-panel-alt-bg: #fcfcfc;
          --barkan-panel-soft-bg: #f3f3f3;
          --barkan-panel-pill-bg: #f3f3f1;
          --barkan-panel-pill-hover-bg: #ececea;
          --barkan-panel-pill-active-bg: #e9e9e6;
          --barkan-panel-border: #dadada;
          --barkan-panel-border-soft: #e1e1df;
          --barkan-panel-border-muted: #dededb;
          --barkan-panel-border-pill: #e4e4df;
          --barkan-panel-border-pill-hover: #d8d8d2;
          --barkan-panel-text: #111111;
          --barkan-panel-text-muted: #666666;
          --barkan-panel-text-tertiary: #9a9a9a;
          --barkan-panel-text-placeholder: rgba(79, 80, 89, .8);
          --barkan-panel-thinking: #8a8a8a;
          --barkan-panel-thinking-active: #4a4a4a;
          --barkan-panel-control: #2f2f2f;
          --barkan-panel-control-hover: #424242;
          --barkan-panel-control-text: #ffffff;
          --barkan-panel-focus: rgba(17, 17, 17, .12);
          --barkan-panel-focus-strong: rgba(17, 17, 17, .14);
          --barkan-panel-resize: rgba(17, 17, 17, .16);
          --barkan-spinner-track: rgba(17, 17, 17, .18);
          --barkan-spinner-active: rgba(17, 17, 17, .64);
          --barkan-panel-shadow: rgba(0, 0, 0, .05);
          --barkan-panel-attachment: #babab7;
          --barkan-panel-chevron: #8e8e88;
          --barkan-mode-menu-bg: rgba(255, 255, 255, .88);
          --barkan-mode-menu-border: rgba(0, 0, 0, .14);
          --barkan-mode-menu-shadow: 0 18px 44px rgba(0, 0, 0, .18), 0 4px 12px rgba(0, 0, 0, .08);
          --barkan-mode-option-hover: rgba(0, 0, 0, .055);
          --barkan-mode-option-active: #0a84ff;
          --barkan-mode-option-active-text: #ffffff;
        }
        @media (prefers-color-scheme: dark) {
          :host([data-barkan-chat-theme="system"]) {
            color-scheme: dark;
            --barkan-panel-bg: #131313;
            --barkan-panel-alt-bg: #171717;
            --barkan-panel-soft-bg: #212121;
            --barkan-panel-pill-bg: #212121;
            --barkan-panel-pill-hover-bg: #2a2a2a;
            --barkan-panel-pill-active-bg: #303030;
            --barkan-panel-border: #262626;
            --barkan-panel-border-soft: #303030;
            --barkan-panel-border-muted: #343434;
            --barkan-panel-border-pill: #343434;
            --barkan-panel-border-pill-hover: #444444;
            --barkan-panel-text: #f4f4f4;
            --barkan-panel-text-muted: #b6b6b6;
            --barkan-panel-text-tertiary: #858585;
            --barkan-panel-text-placeholder: rgba(185, 185, 185, .72);
            --barkan-panel-thinking: #858585;
            --barkan-panel-thinking-active: #f1f1f1;
            --barkan-panel-control: #f2f2f2;
            --barkan-panel-control-hover: #ffffff;
            --barkan-panel-control-text: #131313;
            --barkan-panel-focus: rgba(255, 255, 255, .16);
            --barkan-panel-focus-strong: rgba(255, 255, 255, .2);
            --barkan-panel-resize: rgba(255, 255, 255, .18);
            --barkan-spinner-track: rgba(255, 255, 255, .18);
            --barkan-spinner-active: rgba(255, 255, 255, .58);
            --barkan-panel-shadow: rgba(0, 0, 0, .28);
            --barkan-panel-attachment: #777777;
            --barkan-panel-chevron: #a0a0a0;
            --barkan-mode-menu-bg: rgba(38, 38, 38, .86);
            --barkan-mode-menu-border: rgba(255, 255, 255, .16);
            --barkan-mode-menu-shadow: 0 18px 44px rgba(0, 0, 0, .42), 0 4px 12px rgba(0, 0, 0, .2);
            --barkan-mode-option-hover: rgba(255, 255, 255, .08);
            --barkan-mode-option-active: #0a84ff;
            --barkan-mode-option-active-text: #ffffff;
          }
        }
        :host([data-barkan-chat-theme="dark"]) {
          color-scheme: dark;
          --barkan-panel-bg: #131313;
          --barkan-panel-alt-bg: #171717;
          --barkan-panel-soft-bg: #212121;
          --barkan-panel-pill-bg: #212121;
          --barkan-panel-pill-hover-bg: #2a2a2a;
          --barkan-panel-pill-active-bg: #303030;
          --barkan-panel-border: #262626;
          --barkan-panel-border-soft: #303030;
          --barkan-panel-border-muted: #343434;
          --barkan-panel-border-pill: #343434;
          --barkan-panel-border-pill-hover: #444444;
          --barkan-panel-text: #f4f4f4;
          --barkan-panel-text-muted: #b6b6b6;
          --barkan-panel-text-tertiary: #858585;
          --barkan-panel-text-placeholder: rgba(185, 185, 185, .72);
          --barkan-panel-thinking: #858585;
          --barkan-panel-thinking-active: #f1f1f1;
          --barkan-panel-control: #f2f2f2;
          --barkan-panel-control-hover: #ffffff;
          --barkan-panel-control-text: #131313;
          --barkan-panel-focus: rgba(255, 255, 255, .16);
          --barkan-panel-focus-strong: rgba(255, 255, 255, .2);
          --barkan-panel-resize: rgba(255, 255, 255, .18);
          --barkan-spinner-track: rgba(255, 255, 255, .18);
          --barkan-spinner-active: rgba(255, 255, 255, .58);
          --barkan-panel-shadow: rgba(0, 0, 0, .28);
          --barkan-panel-attachment: #777777;
          --barkan-panel-chevron: #a0a0a0;
          --barkan-mode-menu-bg: rgba(38, 38, 38, .86);
          --barkan-mode-menu-border: rgba(255, 255, 255, .16);
          --barkan-mode-menu-shadow: 0 18px 44px rgba(0, 0, 0, .42), 0 4px 12px rgba(0, 0, 0, .2);
          --barkan-mode-option-hover: rgba(255, 255, 255, .08);
          --barkan-mode-option-active: #0a84ff;
          --barkan-mode-option-active-text: #ffffff;
        }
        .launcher-button,
        .call-control,
        .agent {
          position: fixed;
          z-index: 2147483647;
          font-family: var(--barkan-font-ui);
        }
        .launcher-button {
          right: 28px;
          bottom: 28px;
          width: 58px;
          height: 58px;
          display: grid;
          place-items: center;
          padding: 0;
          border: 0;
          border-radius: 999px;
          background: rgba(0, 0, 0, .7);
          box-shadow: 0 8px 20px rgba(0, 0, 0, .22);
          backdrop-filter: blur(5.05px);
          -webkit-backdrop-filter: blur(5.05px);
          color: #fff;
          cursor: pointer;
          opacity: 0;
          pointer-events: none;
          transform: translate3d(0, 12px, 0) scale(.96);
          transition: opacity 180ms ease, transform 220ms cubic-bezier(.22, 1, .36, 1), filter 140ms ease;
        }
        .launcher-button[data-visible="true"] {
          opacity: 1;
          pointer-events: auto;
          transform: translate3d(0, 0, 0) scale(1);
        }
        .launcher-button:hover {
          filter: brightness(1.08);
        }
        .launcher-button:active {
          transform: translate3d(0, 0, 0) scale(.97);
        }
        .launcher-button:focus-visible {
          outline: none;
          box-shadow: 0 8px 20px rgba(0, 0, 0, .22), 0 0 0 3px rgba(255, 255, 255, .28);
        }
        .launcher-button svg {
          width: 25px;
          height: 25px;
          display: block;
        }
        .barkan-spinner {
          display: none;
          width: 23px;
          height: 23px;
          box-sizing: border-box;
          border: 4px solid var(--barkan-spinner-track);
          border-top-color: var(--barkan-spinner-active);
          border-radius: 999px;
          animation: barkan-spin 500ms linear infinite;
        }
        .launcher-button .barkan-spinner {
          border-color: rgba(255, 255, 255, .22);
          border-top-color: rgba(255, 255, 255, .68);
        }
        .launcher-button[data-busy="true"] .launcher-icon {
          display: none;
        }
        .launcher-button[data-busy="true"] .barkan-spinner {
          display: block;
        }
        @keyframes barkan-spin {
          to {
            transform: rotate(360deg);
          }
        }
        .call-control {
          bottom: 14px;
          left: 50%;
          width: min(304px, calc(100vw - 28px));
          height: 54px;
          opacity: 0;
          pointer-events: none;
          transform: translate3d(-50%, 14px, 0);
          transition: opacity 160ms ease, transform 160ms ease, width 220ms ease, height 220ms ease;
        }
        .call-control[data-visible="true"] {
          opacity: 1;
          pointer-events: auto;
          transform: translate3d(-50%, 0, 0);
        }
        .call-panel {
          position: absolute;
          inset: 0;
          border-radius: 15px;
          background: rgba(0, 0, 0, .7);
          box-shadow: 0 8px 20px rgba(0, 0, 0, .22);
          backdrop-filter: blur(5.05px);
          -webkit-backdrop-filter: blur(5.05px);
          transition: border-radius 220ms ease, background 220ms ease;
        }
        .call-button {
          position: absolute;
          top: 7px;
          display: grid;
          width: 40px;
          height: 40px;
          place-items: center;
          border: 0;
          border-radius: 10px;
          color: #fff;
          cursor: pointer;
          outline: none;
          transition: filter 140ms ease, opacity 140ms ease, transform 140ms ease;
        }
        .call-button:hover {
          filter: brightness(1.08);
        }
        .call-button:active {
          transform: scale(.97);
        }
        .call-button:focus-visible {
          box-shadow: 0 0 0 3px rgba(255, 255, 255, .28);
        }
        .mic-button {
          left: 7px;
          background: #5b5b5b;
        }
        .mic-button svg {
          transition: opacity 180ms ease, transform 220ms cubic-bezier(.22, 1, .36, 1);
        }
        .call-control[data-muted="true"] .mic-button svg {
          opacity: .9;
          transform: scale(.96);
        }
        .hangup-button {
          right: 7px;
          background: #d63031;
        }
        .mute-slash {
          position: absolute;
          inset: 0;
          width: 22px;
          height: 22px;
          margin: auto;
          color: #fff;
          opacity: 0;
          pointer-events: none;
          transform: scale(.92);
          transform-origin: center;
          transition:
            opacity 150ms ease,
            transform 220ms cubic-bezier(.22, 1, .36, 1);
        }
        .mute-slash::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          width: 22px;
          height: 1.4px;
          border-radius: 999px;
          background: currentColor;
          transform: translate(-50%, -50%) rotate(-45deg) scaleX(0);
          transform-origin: center;
          transition: transform 260ms cubic-bezier(.22, 1, .36, 1);
        }
        .call-control[data-muted="true"] .mute-slash {
          opacity: .9;
          transform: scale(1);
        }
        .call-control[data-muted="true"] .mute-slash::before {
          transform: translate(-50%, -50%) rotate(-45deg) scaleX(1);
        }
        .waveform {
          position: absolute;
          left: 50%;
          top: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          width: 70px;
          height: 30px;
          transform: translateX(-50%);
          overflow: hidden;
          transition: opacity 160ms ease;
        }
        .chat-panel {
          position: fixed;
          z-index: 2147483647;
          top: 0;
          right: 0;
          bottom: 0;
          width: min(var(--barkan-chat-sidebar-width, ${At}px), 100vw);
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          border: 0;
          border-left: 1px solid var(--barkan-panel-border);
          border-radius: 0;
          background: var(--barkan-panel-bg);
          box-shadow: none;
          color: var(--barkan-panel-text);
          font-family: var(--barkan-font-ui);
          opacity: 0;
          pointer-events: none;
          transform: translate3d(100%, 0, 0);
          transform-origin: right center;
          transition: opacity ${Pt}ms ease, transform ${Pt}ms cubic-bezier(.22, 1, .36, 1);
          overflow: hidden;
        }
        .chat-panel[data-visible="true"] {
          opacity: 1;
          pointer-events: auto;
          transform: translate3d(0, 0, 0);
        }
        .chat-panel[data-resizing="true"] {
          transition: none;
          user-select: none;
        }
        .chat-panel__resize-handle {
          position: absolute;
          left: -5px;
          top: 0;
          bottom: 0;
          z-index: 3;
          width: 10px;
          padding: 0;
          border: 0;
          background: transparent;
          cursor: col-resize;
          touch-action: none;
        }
        .chat-panel__resize-handle::before {
          content: "";
          position: absolute;
          left: 4px;
          top: 50%;
          width: 2px;
          height: 48px;
          border-radius: 999px;
          background: var(--barkan-panel-resize);
          opacity: 0;
          transform: translateY(-50%) scaleY(.7);
          transition: opacity 160ms ease, transform 180ms cubic-bezier(.22, 1, .36, 1);
        }
        .chat-panel__resize-handle:hover::before,
        .chat-panel__resize-handle:focus-visible::before,
        .chat-panel[data-resizing="true"] .chat-panel__resize-handle::before {
          opacity: 1;
          transform: translateY(-50%) scaleY(1);
        }
        .chat-panel__header {
          flex: 0 0 auto;
          min-height: 62px;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 16px;
          padding: 0 20px 0 28px;
          background: var(--barkan-panel-bg);
          box-sizing: border-box;
        }
        .chat-panel__header-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex: 0 0 auto;
        }
        .chat-panel__close {
          width: 32px;
          height: 32px;
          padding: 0;
          border: 0;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          color: var(--barkan-panel-text);
          cursor: pointer;
          transition: background-color 180ms ease, opacity 180ms ease;
        }
        .chat-panel__close:hover {
          background: var(--barkan-panel-pill-bg);
        }
        .chat-panel__close:disabled {
          cursor: default;
          opacity: .7;
        }
        .chat-panel__close:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px var(--barkan-panel-focus-strong);
        }
        .chat-panel__thread {
          flex: 1 1 auto;
          min-height: 0;
          overflow: auto;
          padding: 24px 28px 24px;
          background: var(--barkan-panel-bg);
          overscroll-behavior: contain;
          scrollbar-width: none;
        }
        .chat-panel__thread::-webkit-scrollbar {
          width: 0;
          height: 0;
        }
        .chat-panel__messages {
          width: 100%;
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 24px;
        }
        .chat-panel__message-item {
          display: flex;
        }
        .chat-panel__message-item--assistant {
          justify-content: flex-start;
        }
        .chat-panel__message-item--assistant + .chat-panel__message-item--assistant {
          margin-top: -10px;
        }
        .chat-panel__message-item--user {
          justify-content: flex-end;
        }
        .chat-panel__message {
          max-width: 100%;
        }
        .chat-panel__message--assistant {
          width: 100%;
          padding: 0;
          background: transparent;
          color: var(--barkan-panel-text);
        }
        .chat-panel__message--user {
          max-width: min(622px, 78%);
          padding: 12px 16px;
          border-radius: 18px;
          background: var(--barkan-panel-soft-bg);
          color: var(--barkan-panel-text);
        }
        .chat-panel__message-content {
          margin: 0;
          color: inherit;
          text-align: left;
          font-size: 14px;
          font-weight: 400;
          line-height: 1.6;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .chat-panel__thinking-line {
          display: block;
          max-width: 100%;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.6;
          white-space: normal;
          overflow: hidden;
        }
        .chat-panel__thinking-text {
          position: relative;
          display: inline-grid;
          grid-template-areas: "label";
          align-items: start;
          overflow: visible;
          color: var(--barkan-panel-thinking);
          max-width: 100%;
          white-space: normal;
          overflow-wrap: anywhere;
          vertical-align: top;
        }
        .chat-panel__thinking-label {
          grid-area: label;
          min-width: 0;
          overflow: visible;
          white-space: normal;
          overflow-wrap: anywhere;
          will-change: transform, opacity, filter;
        }
        .chat-panel__thinking-label--leaving {
          animation: barkan-thinking-label-out 340ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .chat-panel__thinking-label--entering {
          animation: barkan-thinking-label-in 340ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .chat-panel__message-content--thinking-static {
          color: var(--barkan-panel-thinking);
          font-weight: 600;
        }
        .chat-panel__activity-toggle {
          width: 100%;
          padding: 0;
          border: 0;
          display: block;
          background: transparent;
          color: var(--barkan-panel-thinking);
          font: inherit;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.6;
          text-align: left;
          cursor: pointer;
        }
        .chat-panel__activity-toggle:hover {
          opacity: .82;
        }
        .chat-panel__activity-toggle:focus-visible {
          outline: none;
          box-shadow: 0 0 0 1px var(--barkan-panel-focus-strong);
          border-radius: 8px;
        }
        .chat-panel__activity-details {
          margin-top: 10px;
          display: grid;
          gap: 12px;
        }
        .chat-panel__activity-entry {
          display: grid;
          gap: 6px;
        }
        .chat-panel__activity-line {
          margin: 0;
          color: var(--barkan-panel-text-muted);
          font-size: 13px;
          font-weight: 400;
          line-height: 1.55;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .chat-panel__activity-line-label {
          color: var(--barkan-panel-text-tertiary);
        }
        .action-summary-card {
          width: min(100%, 560px);
          box-sizing: border-box;
          border: 1px solid var(--barkan-panel-border);
          border-radius: 8px;
          background: var(--barkan-panel-bg);
          color: var(--barkan-panel-text);
          box-shadow: 0 1px 3px rgba(0, 0, 0, .06);
          overflow: hidden;
        }
        .action-summary-card__main {
          min-height: 78px;
          padding: 12px 12px;
          display: grid;
          grid-template-columns: 46px minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          box-sizing: border-box;
        }
        .action-summary-card__icon {
          width: 38px;
          height: 38px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: var(--barkan-panel-soft-bg);
          color: #5f5f5f;
        }
        .action-summary-card__icon svg {
          width: 24px;
          height: 24px;
          display: block;
        }
        .action-summary-card__body {
          min-width: 0;
          display: grid;
          gap: 4px;
        }
        .action-summary-card__title {
          margin: 0;
          min-width: 0;
          color: var(--barkan-panel-text);
          font-family: var(--barkan-font-ui);
          font-size: 14px;
          font-weight: 400;
          line-height: 1.32;
          letter-spacing: 0;
          overflow-wrap: anywhere;
        }
        .action-summary-card__counts {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          min-height: 18px;
          font-size: 15px;
          font-weight: 400;
          line-height: 1;
        }
        .action-summary-card__count--positive {
          color: #30a251;
        }
        .action-summary-card__count--negative {
          color: #de3d35;
        }
        .action-summary-card__undo {
          padding: 0 4px;
          border: 0;
          border-radius: 7px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          color: var(--barkan-panel-text);
          font: inherit;
          font-size: 15px;
          font-weight: 400;
          line-height: 1;
          cursor: default;
        }
        .action-summary-card__undo svg {
          width: 18px;
          height: 18px;
          display: block;
        }
        .action-summary-card__details {
          width: 100%;
          min-height: 46px;
          padding: 0 12px;
          border: 0;
          border-top: 1px solid var(--barkan-panel-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          background: transparent;
          color: var(--barkan-panel-text);
          font: inherit;
          font-size: 14px;
          font-weight: 400;
          line-height: 1;
          text-align: left;
          cursor: default;
        }
        .action-summary-card__details svg {
          width: 16px;
          height: 16px;
          flex: 0 0 auto;
          color: #4d4d4d;
        }
        .action-summary-card__undo:focus-visible,
        .action-summary-card__details:focus-visible {
          outline: none;
          box-shadow: inset 0 0 0 2px var(--barkan-panel-focus-strong);
        }
        .chat-panel__thinking-text::after {
          content: attr(data-text);
          position: absolute;
          top: 0;
          bottom: 0;
          left: -96px;
          right: -96px;
          box-sizing: border-box;
          padding: 0 96px;
          color: var(--barkan-panel-thinking-active);
          pointer-events: none;
          white-space: normal;
          overflow-wrap: anywhere;
          -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 36%, #000 64%, transparent 100%);
          mask-image: linear-gradient(90deg, transparent 0%, #000 36%, #000 64%, transparent 100%);
          -webkit-mask-size: 30% 100%;
          mask-size: 30% 100%;
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          -webkit-mask-position: -34% 0;
          mask-position: -34% 0;
          animation: barkan-thinking-sweep 2s linear infinite;
          will-change: -webkit-mask-position, mask-position;
        }
        @keyframes barkan-thinking-label-out {
          0% {
            opacity: 1;
            transform: translateY(0);
            filter: blur(0);
          }
          100% {
            opacity: 0;
            transform: translateY(-8px);
            filter: blur(0.4px);
          }
        }
        @keyframes barkan-thinking-label-in {
          0% {
            opacity: 0;
            transform: translateY(10px);
            filter: blur(0.4px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
            filter: blur(0);
          }
        }
        @keyframes barkan-thinking-sweep {
          0% {
            -webkit-mask-position: -34% 0;
            mask-position: -34% 0;
          }
          100% {
            -webkit-mask-position: 134% 0;
            mask-position: 134% 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .chat-panel__thinking-text::after {
            animation: none;
            content: none;
          }
          .chat-panel__thinking-label {
            animation: none;
            transform: none;
            filter: none;
          }
        }
        .chat-panel__message--authorization {
          width: min(552px, 100%);
          padding: 14px;
          border: 1px solid var(--barkan-panel-border-muted);
          border-radius: 8px;
          background: var(--barkan-panel-bg);
          color: var(--barkan-panel-text);
        }
        .authorization-card {
          display: grid;
          gap: 10px;
        }
        .authorization-card__header {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .authorization-card__logo {
          width: 24px;
          height: 24px;
          flex: 0 0 auto;
          display: block;
        }
        .authorization-card__title {
          margin: 0;
          color: var(--barkan-panel-text);
          font-size: 14px;
          font-weight: 700;
          line-height: 1.35;
        }
        .authorization-card__copy {
          margin: 0;
          color: var(--barkan-panel-text-muted);
          font-size: 13px;
          line-height: 1.45;
        }
        .authorization-card__button {
          justify-self: start;
          min-height: 32px;
          border: 1px solid var(--barkan-panel-control);
          border-radius: 7px;
          padding: 0 12px;
          background: var(--barkan-panel-control);
          color: var(--barkan-panel-control-text);
          font: inherit;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }
        .authorization-card__button:disabled {
          opacity: .55;
          cursor: default;
        }
        .chat-panel__empty {
          min-height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          color: var(--barkan-panel-text-tertiary);
        }
        .chat-panel__empty strong {
          display: block;
          color: var(--barkan-panel-text);
          font-size: 22px;
          font-weight: 700;
          line-height: 1.15;
        }
        .chat-panel__empty-mode {
          margin-top: 5px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-wrap: nowrap;
          gap: 4px;
          color: var(--barkan-panel-text-tertiary);
          font-size: 20px;
          font-weight: 700;
          line-height: 1.15;
        }
        .barkan-mode-picker {
          position: relative;
          display: inline-flex;
          align-items: center;
          flex: 0 0 auto;
          z-index: 2;
        }
        .chat-panel__empty-mode-control {
          width: auto;
        }
        .barkan-mode-picker__button {
          width: 100%;
          border: 0;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: flex-start;
          appearance: none;
          -webkit-appearance: none;
          background: transparent;
          color: var(--barkan-panel-text-tertiary);
          cursor: pointer;
          font: inherit;
          outline: none;
          box-shadow: none;
          transition:
            background-color 180ms ease,
            color 180ms ease,
            transform 160ms cubic-bezier(.2, .8, .2, 1);
        }
        .barkan-mode-picker__button:hover,
        .barkan-mode-picker[data-open="true"] .barkan-mode-picker__button {
          background: var(--barkan-panel-pill-bg);
          color: var(--barkan-panel-text);
        }
        .barkan-mode-picker__button:active {
          transform: scale(.985);
        }
        .barkan-mode-picker__button:focus-visible {
          background: var(--barkan-panel-pill-bg);
          color: var(--barkan-panel-text);
          box-shadow: 0 0 0 3px var(--barkan-panel-focus);
        }
        .barkan-mode-picker__label {
          display: block;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .barkan-mode-picker__chevron {
          flex: 0 0 auto;
          color: var(--barkan-panel-chevron);
          pointer-events: none;
          transition:
            color 180ms ease,
            transform 220ms cubic-bezier(.2, .8, .2, 1);
        }
        .barkan-mode-picker[data-open="true"] .barkan-mode-picker__chevron {
          color: currentColor;
          transform: rotate(180deg);
        }
        .barkan-mode-picker__menu {
          position: absolute;
          left: 50%;
          z-index: 2147483647;
          width: max-content;
          min-width: 132px;
          padding: 4px;
          display: grid;
          gap: 5px;
          border: 1px solid var(--barkan-mode-menu-border);
          border-radius: 14px;
          background: var(--barkan-mode-menu-bg);
          color: var(--barkan-panel-text);
          box-shadow: var(--barkan-mode-menu-shadow);
          backdrop-filter: blur(22px) saturate(1.55);
          -webkit-backdrop-filter: blur(22px) saturate(1.55);
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transform: translate3d(-50%, -6px, 0) scale(.975);
          transform-origin: top center;
          transition:
            opacity 150ms ease,
            visibility 0ms linear 150ms,
            transform 220ms cubic-bezier(.2, .85, .2, 1);
        }
        .barkan-mode-picker[data-open="true"] .barkan-mode-picker__menu {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
          transform: translate3d(-50%, 0, 0) scale(1);
          transition:
            opacity 130ms ease,
            visibility 0ms linear,
            transform 220ms cubic-bezier(.2, .85, .2, 1);
        }
        .barkan-mode-picker__option {
          width: 100%;
          height: 28px;
          border: 0;
          border-radius: 9px;
          padding: 0 10px 0 8px;
          display: grid;
          grid-template-columns: 15px minmax(0, 1fr);
          align-items: center;
          gap: 5px;
          appearance: none;
          -webkit-appearance: none;
          background: transparent;
          color: var(--barkan-panel-text);
          cursor: pointer;
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
          line-height: 1;
          text-align: left;
          outline: none;
          transition: background-color 120ms ease, color 120ms ease;
        }
        .barkan-mode-picker__option:hover,
        .barkan-mode-picker__option:focus-visible {
          background: var(--barkan-mode-option-hover);
        }
        .barkan-mode-picker__option[aria-selected="true"] {
          background: var(--barkan-mode-option-active);
          color: var(--barkan-mode-option-active-text);
        }
        .barkan-mode-picker__check {
          width: 14px;
          height: 14px;
          opacity: 0;
        }
        .barkan-mode-picker__option[aria-selected="true"] .barkan-mode-picker__check {
          opacity: 1;
        }
        .barkan-mode-picker__option-label {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .chat-panel__empty-mode-control .barkan-mode-picker__button {
          width: auto;
          height: 1.45em;
          padding: 0 22px 0 10px;
          line-height: inherit;
        }
        .chat-panel__empty-mode-control .barkan-mode-picker__label {
          display: block;
          margin-top: 0;
          overflow: visible;
          text-overflow: clip;
          line-height: 1;
        }
        .chat-panel__empty-mode-control .barkan-mode-picker__chevron {
          position: absolute;
          right: 6px;
          top: 50%;
          width: 12px;
          height: 12px;
          transform: translateY(-50%);
        }
        .chat-panel__empty-mode-control[data-open="true"] .barkan-mode-picker__chevron {
          transform: translateY(-50%) rotate(180deg);
        }
        .chat-panel__empty-mode-control .barkan-mode-picker__menu {
          top: calc(100% + 10px);
          left: 0;
          transform: translate3d(0, -6px, 0) scale(.975);
          transform-origin: top left;
        }
        .chat-panel__empty-mode-control[data-open="true"] .barkan-mode-picker__menu {
          transform: translate3d(0, 0, 0) scale(1);
        }
        .chat-panel__empty .chat-panel__empty-mode-suffix {
          margin-top: 0;
          display: inline;
          white-space: nowrap;
          font: inherit;
          line-height: inherit;
        }
        .chat-panel__empty[data-visible="false"] {
          display: none;
        }
        .text-entry {
          flex: 0 0 auto;
          width: auto;
          min-height: 110px;
          margin: 0 28px 28px;
          padding: 18px 14px 12px 18px;
          display: flex;
          flex-direction: column;
          gap: 0;
          box-sizing: border-box;
          border: 1px solid var(--barkan-panel-border-soft);
          border-radius: 22px;
          background: var(--barkan-panel-alt-bg);
          box-shadow: 0 2px 4px var(--barkan-panel-shadow);
        }
        .text-entry[data-has-question="true"] {
          min-height: 0;
          padding: 0;
          border: 0;
          background: transparent;
          box-shadow: none;
        }
        .text-entry__choices {
          display: none;
          margin: 0 0 14px;
        }
        .text-entry__choices[data-visible="true"] {
          display: block;
        }
        .text-entry[data-has-question="true"] .text-entry__choices {
          margin: 0;
        }
        .text-entry[data-has-question="true"] .text-entry__body,
        .text-entry[data-has-question="true"] .text-entry__footer {
          display: none;
        }
        .barkan-question-panel {
          width: 100%;
          box-sizing: border-box;
          padding: 16px;
          display: flex;
          flex-direction: column;
          border: 1px solid var(--barkan-panel-border-soft);
          border-radius: 22px;
          background: var(--barkan-panel-alt-bg);
          color: var(--barkan-panel-text);
          font-family: inherit;
          box-shadow: 0 2px 4px rgba(0, 0, 0, .05);
          outline: none;
          transform-origin: center bottom;
        }
        .barkan-question-panel[data-animate="true"] {
          animation: barkan-question-panel-enter 340ms cubic-bezier(.22, 1, .36, 1);
        }
        .barkan-question-panel__header,
        .barkan-question-panel__footer {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }
        .barkan-question-panel__heading {
          min-width: 0;
          padding: 4px 0 0 4px;
        }
        .barkan-question-panel__prompt {
          margin: 0;
          color: var(--barkan-panel-text);
          font-family: inherit;
          font-size: 14px;
          font-weight: 400;
          line-height: 1.265;
          letter-spacing: 0;
        }
        .barkan-question-panel__nav {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          flex: 0 0 auto;
        }
        .barkan-question-panel__nav-button {
          width: 15px;
          height: 15px;
          padding: 0;
          border: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          color: #878787;
          cursor: pointer;
          transition: opacity 180ms ease;
        }
        .barkan-question-panel__nav-button:disabled {
          opacity: .3;
          cursor: default;
        }
        .barkan-question-panel__progress {
          margin: 0;
          color: #878787;
          font-family: inherit;
          font-size: 12px;
          line-height: 1.265;
          letter-spacing: 0;
        }
        .barkan-question-panel__options {
          margin-top: 14px;
          display: grid;
          align-content: start;
          gap: 4px;
        }
        .barkan-question-panel__option {
          min-height: 37px;
          padding: 0 10px 0 9px;
          display: grid;
          grid-template-columns: 18px minmax(0, 1fr) auto;
          align-items: center;
          gap: 0;
          border: 0;
          border-radius: 11px;
          background: transparent;
          cursor: pointer;
          text-align: left;
          transition: background-color 180ms ease, opacity 180ms ease;
        }
        .barkan-question-panel__option:hover {
          background: var(--barkan-panel-pill-bg);
        }
        .barkan-question-panel__option[data-selected="true"] {
          background: var(--barkan-panel-soft-bg);
        }
        .barkan-question-panel__option[data-editable="true"][data-selected="true"] {
          align-items: center;
          padding-top: 9px;
          padding-bottom: 9px;
        }
        .barkan-question-panel__option-index {
          color: var(--barkan-panel-text-tertiary);
          font-family: inherit;
          font-size: 14px;
          line-height: 1.265;
          letter-spacing: 0;
        }
        .barkan-question-panel__option-main {
          min-width: 0;
        }
        .barkan-question-panel__option-label {
          display: block;
          min-width: 0;
          color: var(--barkan-panel-text);
          font-family: inherit;
          font-size: 14px;
          line-height: 1.265;
          letter-spacing: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .barkan-question-panel__option[data-editable="true"]:not([data-selected="true"]) .barkan-question-panel__option-label {
          color: var(--barkan-panel-text-tertiary);
        }
        .barkan-question-panel__option-input {
          width: 100%;
          min-height: 18px;
          display: block;
          margin: 0;
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--barkan-panel-text);
          font-family: inherit;
          font-size: 14px;
          line-height: 1.265;
          letter-spacing: 0;
          resize: none;
          overflow: hidden;
          outline: none;
        }
        .barkan-question-panel__option-input::placeholder {
          color: var(--barkan-panel-text-tertiary);
        }
        .barkan-question-panel__option-controls {
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }
        .barkan-question-panel__option-control {
          width: 13px;
          height: 13px;
          padding: 0;
          border: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          color: var(--barkan-panel-text-tertiary);
          cursor: pointer;
          transition: opacity 180ms ease;
        }
        .barkan-question-panel__option-control:disabled {
          opacity: .35;
          cursor: default;
        }
        .barkan-question-panel__footer {
          margin-top: 12px;
          padding-top: 0;
          align-items: center;
          justify-content: flex-end;
        }
        .barkan-question-panel__dismiss {
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--barkan-panel-text-tertiary);
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.265;
          letter-spacing: 0;
          cursor: pointer;
        }
        .barkan-question-panel__keycap {
          min-width: 37px;
          height: 20px;
          padding: 0 9px;
          border-radius: 33px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          background: var(--barkan-panel-soft-bg);
          color: var(--barkan-panel-text);
          font-size: 10px;
          font-weight: 500;
          line-height: 1.265;
          letter-spacing: 0;
        }
        .barkan-question-panel__continue {
          width: 103px;
          height: 31px;
          padding: 0 10px 0 9px;
          border: 0;
          border-radius: 79px;
          display: inline-flex;
          align-items: center;
          justify-content: flex-start;
          gap: 8px;
          background: var(--barkan-panel-control);
          color: var(--barkan-panel-control-text);
          cursor: pointer;
          transition: background-color 180ms ease, opacity 180ms ease;
        }
        .barkan-question-panel__continue:hover {
          background: var(--barkan-panel-control-hover);
        }
        .barkan-question-panel__continue:disabled,
        .barkan-question-panel__dismiss:disabled {
          opacity: .45;
          cursor: not-allowed;
        }
        .barkan-question-panel__continue-label {
          color: var(--barkan-panel-control-text);
          font-size: 14px;
          font-weight: 500;
          line-height: 1.265;
          letter-spacing: 0;
        }
        .barkan-question-panel__continue-icon {
          width: 24px;
          height: 16px;
          border-radius: 13px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: color-mix(in srgb, var(--barkan-panel-control-text) 20%, transparent);
        }
        @keyframes barkan-question-panel-enter {
          0% {
            opacity: 0;
            transform: translateY(12px) scaleY(.88);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scaleY(1);
          }
        }
        .text-entry__body {
          flex: 0 0 auto;
          min-height: 52px;
          padding: 0;
          display: grid;
          align-content: start;
        }
        .text-entry__input {
          width: 100%;
          min-height: 20px;
          max-height: 132px;
          border: 0;
          padding: 0;
          resize: none;
          overflow: auto;
          color: var(--barkan-panel-text);
          background: transparent;
          caret-color: var(--barkan-panel-text);
          font: inherit;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.35;
          outline: none;
          box-shadow: none;
        }
        .text-entry__input::placeholder {
          color: var(--barkan-panel-text-placeholder);
        }
        .text-entry__input:focus,
        .text-entry__input:focus-visible {
          outline: none;
          box-shadow: none;
        }
        .text-entry__footer {
          display: flex;
          align-items: center;
          min-height: 31px;
          gap: 11px;
        }
        .text-entry__attach {
          width: 21px;
          height: 21px;
          padding: 0;
          border: 0;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          color: var(--barkan-panel-attachment);
        }
        .text-entry__mode {
          position: relative;
          flex: 0 0 auto;
          width: 68px;
          height: 31px;
          display: inline-flex;
          align-items: center;
        }
        .text-entry[data-mode="act"] .text-entry__mode {
          width: 52px;
        }
        .text-entry[data-mode="automation"] .text-entry__mode {
          width: 112px;
        }
        .text-entry__mode .barkan-mode-picker__button {
          height: 31px;
          padding: 0 24px 0 0;
          color: var(--barkan-panel-text-tertiary);
          font-size: 14px;
          font-weight: 700;
          line-height: 31px;
        }
        .text-entry__mode .barkan-mode-picker__button:hover,
        .text-entry__mode[data-open="true"] .barkan-mode-picker__button {
          background: transparent;
          color: var(--barkan-panel-text);
        }
        .text-entry__mode .barkan-mode-picker__button:focus-visible {
          background: transparent;
          color: var(--barkan-panel-text);
          box-shadow: 0 0 0 3px var(--barkan-panel-focus);
        }
        .text-entry__mode .barkan-mode-picker__menu {
          bottom: calc(100% + 8px);
          transform: translate3d(-50%, 6px, 0) scale(.975);
          transform-origin: bottom center;
        }
        .text-entry__mode[data-open="true"] .barkan-mode-picker__menu {
          transform: translate3d(-50%, 0, 0) scale(1);
        }
        .text-entry__mode .barkan-mode-picker__chevron {
          position: absolute;
          right: 12px;
          top: 50%;
          width: 11px;
          height: 11px;
          transform: translateY(-50%);
        }
        .text-entry__mode[data-open="true"] .barkan-mode-picker__chevron {
          transform: translateY(-50%) rotate(180deg);
        }
        .text-entry[data-mode="act"] .text-entry__mode .barkan-mode-picker__button,
        .text-entry[data-mode="automation"] .text-entry__mode .barkan-mode-picker__button {
          color: var(--barkan-panel-text);
        }
        .text-entry__actions {
          margin-left: auto;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .text-entry__send {
          width: 31px;
          height: 31px;
          padding: 0;
          border: 0;
          border-radius: 999px;
          display: inline-flex;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          background: var(--barkan-panel-control);
          color: var(--barkan-panel-control-text);
          cursor: pointer;
          outline: none;
          transition: background-color 180ms ease, opacity 180ms ease, transform 140ms ease;
        }
        .text-entry__send:hover:not(:disabled) {
          background: var(--barkan-panel-control-hover);
        }
        .text-entry__send:active:not(:disabled) {
          transform: scale(.97);
        }
        .text-entry__send:disabled {
          background: var(--barkan-panel-soft-bg);
          color: var(--barkan-panel-text-tertiary);
          opacity: 1;
          cursor: default;
        }
        .text-entry__send:focus-visible {
          box-shadow: 0 0 0 3px var(--barkan-panel-focus-strong);
        }
        .text-entry__send svg {
          width: 19px;
          height: 19px;
          display: block;
          flex: 0 0 auto;
        }
        .text-entry__voice-icon {
          display: none !important;
        }
        .text-entry__send[data-input-empty="true"] .text-entry__send-icon {
          display: none !important;
        }
        .text-entry__send[data-input-empty="true"] .text-entry__voice-icon {
          display: block !important;
        }
        .text-entry__send[data-generating="true"] {
          background: #efefef;
          color: #111111;
        }
        .text-entry__send[data-generating="true"]:hover {
          background: #e7e7e7;
        }
        .text-entry__send[data-generating="true"] svg {
          display: none !important;
        }
        .text-entry__stop-icon {
          display: none;
          width: 10px;
          height: 10px;
          border-radius: 2px;
          background: #111111;
        }
        .text-entry__send[data-generating="true"] .text-entry__stop-icon {
          display: block;
        }
        @media (max-width: 560px) {
          .chat-panel {
            width: 100vw;
          }
          .chat-panel__resize-handle {
            display: none;
          }
          .chat-panel__header {
            padding: 0 18px 0 22px;
          }
          .chat-panel__thread {
            padding: 22px 22px 20px;
          }
          .chat-panel__message--user {
            max-width: 88%;
          }
          .text-entry {
            margin: 0 18px 18px;
          }
        }
        .waveform-bar {
          width: 3px;
          border-radius: 8px;
          background: #fff;
          transform: scaleY(.42);
          transform-origin: center;
          transition: opacity 120ms ease;
        }
        .waveform-bar:nth-child(1) { height: 16px; opacity: .42; }
        .waveform-bar:nth-child(2) { height: 21px; opacity: .56; }
        .waveform-bar:nth-child(3) { height: 11px; opacity: .72; }
        .waveform-bar:nth-child(4) { height: 18px; opacity: .9; }
        .waveform-bar:nth-child(5) { height: 8px; opacity: 1; }
        .waveform-bar:nth-child(6) { height: 15px; opacity: .9; }
        .waveform-bar:nth-child(7) { height: 23px; opacity: .72; }
        .waveform-bar:nth-child(8) { height: 12px; opacity: .56; }
        .waveform-bar:nth-child(9) { height: 16px; opacity: .42; }
        .call-control[data-muted="true"] .waveform-bar,
        .call-control[data-state="error"] .waveform-bar {
          opacity: .3;
        }
        .agent {
          left: 0;
          top: 0;
          width: 240px;
          min-height: 54px;
          opacity: 0;
          pointer-events: none;
          transform: translate3d(12px, 12px, 0);
          transition: opacity 140ms ease, transform 240ms cubic-bezier(.22, 1, .36, 1);
          overflow: visible;
        }
        .agent[data-visible="true"] {
          opacity: 1;
        }
        .agent-pointer {
          position: absolute;
          width: 28px;
          height: 28px;
          filter: drop-shadow(1px 2px 2px rgba(0, 0, 0, .18));
          opacity: 1;
          transform-origin: center;
          transition: opacity 120ms ease;
        }
        .agent[data-placement="below-right"] .agent-pointer {
          left: 0;
          top: 0;
          right: auto;
          bottom: auto;
          transform: none;
        }
        .agent[data-placement="below-left"] .agent-pointer {
          left: auto;
          top: 0;
          right: 0;
          bottom: auto;
          transform: scaleX(-1);
        }
        .agent[data-placement="above-right"] .agent-pointer {
          left: 0;
          top: auto;
          right: auto;
          bottom: 0;
          transform: scaleY(-1);
        }
        .agent[data-placement="above-left"] .agent-pointer {
          left: auto;
          top: auto;
          right: 0;
          bottom: 0;
          transform: scale(-1, -1);
        }
        .agent-bubble {
          position: absolute;
          box-sizing: border-box;
          width: max-content;
          min-width: min(180px, calc(100vw - 48px));
          max-width: min(360px, calc(100vw - 48px));
          max-height: min(240px, calc(100vh - 48px));
          min-height: 30px;
          padding: 7px 10px;
          border-radius: 8px;
          background: #ff6b00;
          color: #fff;
          font-family: var(--barkan-font-ui);
          font-size: 12px;
          font-weight: 700;
          line-height: 1.2;
          box-shadow: 1px 2px 2.5px rgba(0, 0, 0, .15);
          overflow-x: hidden;
          overflow-y: auto;
          white-space: normal;
          overflow-wrap: break-word;
          word-break: normal;
        }
        .agent[data-placement="below-right"] .agent-bubble {
          left: 32px;
          top: 20px;
          right: auto;
          bottom: auto;
        }
        .agent[data-placement="below-left"] .agent-bubble {
          left: auto;
          top: 20px;
          right: 32px;
          bottom: auto;
        }
        .agent[data-placement="above-right"] .agent-bubble {
          left: 32px;
          top: auto;
          right: auto;
          bottom: 20px;
        }
        .agent[data-placement="above-left"] .agent-bubble {
          left: auto;
          top: auto;
          right: 32px;
          bottom: 20px;
        }
        .agent-bubble[data-empty="true"] {
          display: none;
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
        @media (max-width: 390px) {
          .call-control {
            width: min(280px, calc(100vw - 24px));
            height: 50px;
          }
          .call-button {
            top: 6px;
            width: 38px;
            height: 38px;
          }
          .waveform {
            top: 11px;
            width: 64px;
          }
        }
      </style>
      <button class="launcher-button" type="button" data-visible="true" data-busy="false" aria-label="Open Barkan chat" title="Open Barkan chat">
        <span class="launcher-icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fill-rule="evenodd" d="M5.337 21.718a6.707 6.707 0 0 1-.533-.074.75.75 0 0 1-.44-1.223 3.73 3.73 0 0 0 .814-1.686c.023-.115-.022-.317-.254-.543C3.274 16.587 2.25 14.41 2.25 12c0-5.03 4.428-9 9.75-9s9.75 3.97 9.75 9c0 5.03-4.428 9-9.75 9-.833 0-1.643-.097-2.417-.279a6.721 6.721 0 0 1-4.246.997Z" clip-rule="evenodd"/>
          </svg>
        </span>
        <span class="barkan-spinner" aria-hidden="true"></span>
      </button>
      <div class="call-control" data-visible="false" data-state="idle" data-muted="false" data-text-mode="false">
        <div class="call-panel"></div>
        <button class="call-button mic-button" type="button" aria-label="Mute microphone" title="Mute microphone">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M12 15.5a4 4 0 0 0 4-4V6a4 4 0 1 0-8 0v5.5a4 4 0 0 0 4 4Zm6.75-4a.75.75 0 0 0-1.5 0 5.25 5.25 0 0 1-10.5 0 .75.75 0 0 0-1.5 0 6.75 6.75 0 0 0 6 6.7v2.05H8.5a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-2.75V18.2a6.75 6.75 0 0 0 6-6.7Z"/>
          </svg>
          <span class="mute-slash"></span>
        </button>
        <div class="waveform" aria-hidden="true">
          <span class="waveform-bar"></span>
          <span class="waveform-bar"></span>
          <span class="waveform-bar"></span>
          <span class="waveform-bar"></span>
          <span class="waveform-bar"></span>
          <span class="waveform-bar"></span>
          <span class="waveform-bar"></span>
          <span class="waveform-bar"></span>
          <span class="waveform-bar"></span>
        </div>
        <button class="call-button hangup-button" type="button" aria-label="End Barkan call" title="End call">
          <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9l-2.2 1.1a1 1 0 0 1-1.32-.45l-1.1-2.2a1 1 0 0 1 .33-1.25C4.75 9.1 8.25 8 12 8s7.25 1.1 10.45 2.92a1 1 0 0 1 .33 1.25l-1.1 2.2a1 1 0 0 1-1.32.45l-2.2-1.1a1 1 0 0 1-.56-.9v-3.1A15.2 15.2 0 0 0 12 9Z"/>
          </svg>
        </button>
        <span class="sr-only" aria-live="polite"></span>
      </div>
      <aside class="chat-panel" data-visible="false" aria-hidden="true" aria-label="Barkan chat">
        <button class="chat-panel__resize-handle" type="button" aria-label="Resize chat panel" title="Resize chat panel"></button>
        <div class="chat-panel__header">
          <div class="chat-panel__header-actions">
            <button class="chat-panel__close" type="button" aria-label="Close chat" title="Close chat">
              <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="m6.7 5.64 5.3 5.3 5.3-5.3 1.06 1.06-5.3 5.3 5.3 5.3-1.06 1.06-5.3-5.3-5.3 5.3-1.06-1.06 5.3-5.3-5.3-5.3 1.06-1.06Z"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="chat-panel__thread">
          <div class="chat-panel__empty" data-visible="true">
            <strong>Hi there</strong>
            <div class="chat-panel__empty-mode">
              <div class="barkan-mode-picker chat-panel__empty-mode-control" data-picker="empty" data-open="false">
                <button class="barkan-mode-picker__button" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="barkan-empty-mode-menu" aria-label="Choose Barkan mode" title="Choose Barkan mode">
                  <span class="barkan-mode-picker__label">Ask</span>
                </button>
                <svg class="barkan-mode-picker__chevron" viewBox="0 0 12 12" aria-hidden="true">
                  <path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="M3 4.5 6 7.5l3-3"/>
                </svg>
                <div class="barkan-mode-picker__menu" id="barkan-empty-mode-menu" role="listbox" aria-label="Choose Barkan mode">
                  <button class="barkan-mode-picker__option" type="button" role="option" aria-selected="true" data-mode="show" tabindex="-1">
                    <svg class="barkan-mode-picker__check" viewBox="0 0 16 16" aria-hidden="true">
                      <path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" d="M3.2 8.3 6.4 11.5 12.8 4.8"/>
                    </svg>
                    <span class="barkan-mode-picker__option-label">Ask</span>
                  </button>
                  <button class="barkan-mode-picker__option" type="button" role="option" aria-selected="false" data-mode="act" tabindex="-1">
                    <svg class="barkan-mode-picker__check" viewBox="0 0 16 16" aria-hidden="true">
                      <path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" d="M3.2 8.3 6.4 11.5 12.8 4.8"/>
                    </svg>
                    <span class="barkan-mode-picker__option-label">Do</span>
                  </button>
                  <button class="barkan-mode-picker__option" type="button" role="option" aria-selected="false" data-mode="automation" tabindex="-1">
                    <svg class="barkan-mode-picker__check" viewBox="0 0 16 16" aria-hidden="true">
                      <path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" d="M3.2 8.3 6.4 11.5 12.8 4.8"/>
                    </svg>
                    <span class="barkan-mode-picker__option-label">Automate</span>
                  </button>
                </div>
              </div>
              <span class="chat-panel__empty-mode-suffix">Barkan anything.</span>
            </div>
          </div>
          <ul class="chat-panel__messages" aria-live="polite"></ul>
        </div>
        <form class="text-entry" data-action-mode="false" data-mode="show" data-has-question="false">
          <label class="sr-only" for="barkan-chat-input">Chat message</label>
          <div class="text-entry__choices" data-visible="false"></div>
          <div class="text-entry__body">
            <textarea id="barkan-chat-input" class="text-entry__input" autocomplete="off" enterkeyhint="send" rows="1" placeholder="Ask Barkan" aria-label="Type your question for Barkan"></textarea>
          </div>
          <div class="text-entry__footer">
            <span class="text-entry__attach" aria-hidden="true">
              <svg width="21" height="21" viewBox="0 0 21 21">
                <path fill="currentColor" d="M16.63 9.63h-5.25V4.38a.88.88 0 1 0-1.75 0v5.25H4.38a.88.88 0 1 0 0 1.75h5.25v5.25a.88.88 0 1 0 1.75 0v-5.25h5.25a.88.88 0 1 0 0-1.75Z"/>
              </svg>
            </span>
            <div class="text-entry__actions">
              <div class="barkan-mode-picker text-entry__mode" data-picker="composer" data-open="false">
                <button class="barkan-mode-picker__button" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="barkan-composer-mode-menu" aria-label="Choose Barkan mode" title="Choose Barkan mode">
                  <span class="barkan-mode-picker__label">Show</span>
                </button>
                <svg class="barkan-mode-picker__chevron" viewBox="0 0 12 12" aria-hidden="true">
                  <path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="M3 4.5 6 7.5l3-3"/>
                </svg>
                <div class="barkan-mode-picker__menu" id="barkan-composer-mode-menu" role="listbox" aria-label="Choose Barkan mode">
                  <button class="barkan-mode-picker__option" type="button" role="option" aria-selected="true" data-mode="show" tabindex="-1">
                    <svg class="barkan-mode-picker__check" viewBox="0 0 16 16" aria-hidden="true">
                      <path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" d="M3.2 8.3 6.4 11.5 12.8 4.8"/>
                    </svg>
                    <span class="barkan-mode-picker__option-label">Show</span>
                  </button>
                  <button class="barkan-mode-picker__option" type="button" role="option" aria-selected="false" data-mode="act" tabindex="-1">
                    <svg class="barkan-mode-picker__check" viewBox="0 0 16 16" aria-hidden="true">
                      <path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" d="M3.2 8.3 6.4 11.5 12.8 4.8"/>
                    </svg>
                    <span class="barkan-mode-picker__option-label">Act</span>
                  </button>
                  <button class="barkan-mode-picker__option" type="button" role="option" aria-selected="false" data-mode="automation" tabindex="-1">
                    <svg class="barkan-mode-picker__check" viewBox="0 0 16 16" aria-hidden="true">
                      <path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" d="M3.2 8.3 6.4 11.5 12.8 4.8"/>
                    </svg>
                    <span class="barkan-mode-picker__option-label">Automation</span>
                  </button>
                </div>
              </div>
              <button class="text-entry__send" type="submit" data-input-empty="true" aria-label="Start voice chat" title="Voice">
                <svg class="text-entry__send-icon" preserveAspectRatio="none" width="100%" height="100%" overflow="visible" viewBox="0 0 19 19" fill="none" aria-hidden="true">
                  <path d="M9.5 16.5V3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M3.96094 8.54167L9.5026 3L15.0443 8.54167" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <svg class="text-entry__voice-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 10v4M9.7 6.5v11M14.3 8.8v6.4M19 10v4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
                </svg>
                <span class="text-entry__stop-icon" aria-hidden="true"></span>
              </button>
            </div>
          </div>
        </form>
      </aside>
      <div class="agent" data-visible="false" data-placement="below-right" aria-hidden="true">
        <div class="agent-pointer">
          <svg width="28" height="28" viewBox="0 0 40 40" aria-hidden="true">
            <path d="M7.5 4.8C6.3 3.8 4.5 4.9 5 6.4l8.6 28c.5 1.6 2.7 1.8 3.5.3l4.6-8.6c.3-.5.7-.9 1.2-1.1l8.8-3.9c1.5-.7 1.5-2.9-.1-3.6L7.5 4.8Z" fill="#ff6b00" stroke="#ffffff" stroke-width="3.2" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="agent-bubble" data-empty="true"></div>
      </div>
    `,this.launcherButton=t.querySelector(`.launcher-button`),this.callControl=t.querySelector(`.call-control`),this.micButton=t.querySelector(`.mic-button`),this.textQuestionForm=t.querySelector(`.text-entry`),this.textQuestionInput=t.querySelector(`.text-entry__input`),this.textQuestionSendButton=t.querySelector(`.text-entry__send`),this.actionChoiceContainer=t.querySelector(`.text-entry__choices`),this.chatPanel=t.querySelector(`.chat-panel`),this.chatResizeHandle=t.querySelector(`.chat-panel__resize-handle`),this.chatCloseButton=t.querySelector(`.chat-panel__close`),this.chatMessageList=t.querySelector(`.chat-panel__messages`),this.chatEmptyState=t.querySelector(`.chat-panel__empty`),this.chatEmptyModePicker=t.querySelector(`[data-picker="empty"]`),this.chatEmptyModeButton=this.chatEmptyModePicker.querySelector(`.barkan-mode-picker__button`),this.chatEmptyModeLabel=this.chatEmptyModePicker.querySelector(`.barkan-mode-picker__label`),this.chatEmptyModeOptions=Array.from(this.chatEmptyModePicker.querySelectorAll(`.barkan-mode-picker__option`)),this.chatEmptyModeSuffix=t.querySelector(`.chat-panel__empty-mode-suffix`),this.textQuestionModePicker=t.querySelector(`[data-picker="composer"]`),this.textQuestionModeButton=this.textQuestionModePicker.querySelector(`.barkan-mode-picker__button`),this.textQuestionModeLabel=this.textQuestionModePicker.querySelector(`.barkan-mode-picker__label`),this.textQuestionModeOptions=Array.from(this.textQuestionModePicker.querySelectorAll(`.barkan-mode-picker__option`)),this.hangupButton=t.querySelector(`.hangup-button`),this.callStatus=t.querySelector(`.sr-only`),this.agent=t.querySelector(`.agent`),this.agentPointer=t.querySelector(`.agent-pointer`),this.agentBubble=t.querySelector(`.agent-bubble`),this.waveformBars=Array.from(t.querySelectorAll(`.waveform-bar`)),this.waveformCurrentScales=this.waveformBars.map(()=>P),this.waveformTargetScales=this.waveformBars.map(()=>P),this.setChatSidebarWidth(this.chatSidebarWidth,{updateLayout:!1}),this.launcherButton.addEventListener(`click`,()=>void this.openChatFromLauncher()),this.micButton.addEventListener(`click`,()=>this.toggleMute()),this.chatResizeHandle.addEventListener(`pointerdown`,this.onChatResizePointerDown),this.chatCloseButton.addEventListener(`click`,()=>void this.closeChatToLauncher()),this.textQuestionModeButton.addEventListener(`click`,()=>this.toggleModePicker(`composer`)),this.chatEmptyModeButton.addEventListener(`click`,()=>this.toggleModePicker(`empty`)),this.textQuestionModeButton.addEventListener(`keydown`,e=>this.handleModePickerButtonKeyDown(e,`composer`)),this.chatEmptyModeButton.addEventListener(`keydown`,e=>this.handleModePickerButtonKeyDown(e,`empty`));for(let e of[...this.textQuestionModeOptions,...this.chatEmptyModeOptions])e.addEventListener(`click`,()=>this.chooseModePickerOption(e)),e.addEventListener(`keydown`,t=>this.handleModePickerOptionKeyDown(t,e));t.addEventListener(`pointerdown`,e=>this.closeModePickerFromShadowEvent(e)),document.addEventListener(`pointerdown`,this.closeModePickerFromDocumentEvent),this.textQuestionForm.addEventListener(`submit`,e=>this.submitTypedQuestion(e)),this.textQuestionInput.addEventListener(`input`,()=>this.updateChatComposer()),this.textQuestionInput.addEventListener(`keydown`,e=>this.handleTextQuestionKeyDown(e)),this.hangupButton.addEventListener(`click`,()=>void this.endCall()),this.updateTextModeUi()}async start(){document.documentElement.appendChild(this.root),window.__BARKAN_DEBUG__={...window.__BARKAN_DEBUG__??{},widgetBuildId:It};try{let e=await fetch(`${this.apiBaseUrl}/api/widget/config?siteKey=${encodeURIComponent(this.siteKey)}`,{credentials:`omit`});if(!e.ok)throw Error(`widget config failed`);this.config=await e.json(),this.apiBaseUrl=Po(this.config.apiBaseUrl||this.scriptOrigin),this.applyChatTheme(this.config.site.chatTheme),this.config.domainWarning&&console.warn(`Barkan domain warning: this origin does not match the configured site domain.`)}catch{this.showError(`barkan setup failed`);return}window.addEventListener(`mousemove`,this.onWindowMouseMove,{passive:!0}),window.addEventListener(`resize`,this.onWindowResize,{passive:!0}),window.addEventListener(`pagehide`,this.onPageHide),this.clearPersistedCallState(),this.updateLauncherVisibility(),this.prefetchRealtimeTokens()}applyChatTheme(e){this.root.dataset.barkanChatTheme=e===`light`||e===`dark`?e:`system`}onPageHide=()=>{this.persistCallState(),this.clearChatSidebarPageResize({immediate:!0})};onWindowMouseMove=e=>{this.lastMousePosition={x:e.clientX,y:e.clientY},this.updateAgentPointerHover(e.clientX,e.clientY)};onWindowResize=()=>{this.setChatSidebarWidth(this.chatSidebarWidth,{updateLayout:!1}),this.isTextModeActive&&this.applyChatSidebarPageResize()};onChatResizePointerDown=e=>{!this.isTextModeActive||window.innerWidth<760||(e.preventDefault(),this.isChatSidebarResizing=!0,this.chatPanel.dataset.resizing=`true`,this.chatResizeHandle.setPointerCapture?.(e.pointerId),document.body.style.cursor=`col-resize`,document.body.style.userSelect=`none`,window.addEventListener(`pointermove`,this.onChatResizePointerMove),window.addEventListener(`pointerup`,this.onChatResizePointerUp),window.addEventListener(`pointercancel`,this.onChatResizePointerUp))};onChatResizePointerMove=e=>{this.isChatSidebarResizing&&(e.preventDefault(),this.setChatSidebarWidth(window.innerWidth-e.clientX))};onChatResizePointerUp=()=>{this.isChatSidebarResizing&&(this.isChatSidebarResizing=!1,this.chatPanel.dataset.resizing=`false`,document.body.style.cursor=``,document.body.style.userSelect=``,window.removeEventListener(`pointermove`,this.onChatResizePointerMove),window.removeEventListener(`pointerup`,this.onChatResizePointerUp),window.removeEventListener(`pointercancel`,this.onChatResizePointerUp),this.applyChatSidebarPageResize())};persistCallState(){if(this.isCallActive)try{let e={version:1,siteKey:this.siteKey,savedAt:Date.now(),navigationContext:this.navigationContext,lastOpenAIResponseId:this.lastOpenAIResponseId,isMuted:this.isMuted,textEntryMode:this.textEntryMode};window.sessionStorage.setItem(this.callPersistenceKey,JSON.stringify(e))}catch{}}clearPersistedCallState(){try{window.sessionStorage.removeItem(this.callPersistenceKey)}catch{}}get callPersistenceKey(){return`barkan:call:${this.siteKey}`}readPersistedTextEntryMode(){try{let e=window.localStorage.getItem(this.modePreferenceKey)??``;return xn(e)?e:`show`}catch{return`show`}}persistTextEntryMode(e){try{window.localStorage.setItem(this.modePreferenceKey,e)}catch{}}get modePreferenceKey(){return`barkan:mode:${this.siteKey}`}async startCall(e={}){if(!this.config||this.isCallActive)return;this.primeBrowserAudio();let t=++this.callSessionId;if(this.isCallActive=!0,e.resume||(this.isMuted=!1,this.setTextEntryMode(this.preferredTextEntryMode,{persistPreference:!1}),this.clearActionModeState(),this.lastOpenAIResponseId=null,this.pendingOpenAIResponseId=null,this.pendingClarificationContext=null),this.setTextModeActive(e.openChat===!0,{clearInput:!e.resume}),this.turnQueue.clear(),this.actionQueue.clear(),this.activeOpenAIAbortController?.abort(),this.activeOpenAIAbortController=null,this.activeActionAbortController?.abort(),this.activeActionAbortController=null,this.stopSpeakingAudio(),this.currentAssistantSpeech=``,e.resume||(this.chatMessages=[],this.expandedChatActivityMessageIds.clear(),this.isChatThinking=!1,this.chatThinkingText=`Thinking`,this.chatThinkingTargetText=`Thinking`,this.clearChatThinkingTransition(),this.renderChatMessages(),this.navigationContext=null),this.hideAgent(),this.setState(`connecting`,`connecting`),this.persistCallState(),this.isMuted){this.recordDebugEvent(`microphone-start-skipped-muted`),this.setState(`muted`,`muted`),this.startMicrophoneHealthMonitor(),this.completeCallStart(t,e);return}let n;try{if(!this.hasShownMicConsent&&!await Vo()&&(this.hasShownMicConsent=!0),n=await this.getMicrophoneStream(),this.activeMicrophoneStream=n,this.recordDebugEvent(`microphone-stream-ready`),this.watchMicrophoneTrackEnd(n,t),!this.isCurrentSession(t)){this.stopMicrophoneStream();return}}catch(e){if(!this.isCurrentSession(t))return;this.isCallActive=!1,this.setTextModeActive(!1,{clearInput:!0}),this.clearPersistedCallState(),this.clearPrimedAudioResources(),this.recordDebugEvent(`microphone-start-failed`,Q(e)),this.showError(`microphone blocked`);return}try{let r=await this.consumeSttToken();if(this.recordDebugEvent(`stt-token-ready`),this.activeTranscriber=new Dn(r,n,this.buildTranscriberCallbacks(t),this.consumePrimedInputAudioContext()),await this.activeTranscriber.start(),!this.isCurrentSession(t)){this.activeTranscriber.stop();return}this.recordDebugEvent(`transcriber-started`),this.applyMicrophoneCaptureState(),this.setState(this.isMuted?`muted`:`listening`,this.isMuted?`muted`:`listening`),this.startMicrophoneHealthMonitor(),this.completeCallStart(t,e)}catch(e){if(!this.isCurrentSession(t))return;this.isCallActive=!1,this.setTextModeActive(!1,{clearInput:!0}),this.clearPersistedCallState(),this.activeTranscriber=null,this.clearPrimedAudioResources(),this.stopMicrophoneStream(),console.warn(`[Barkan] voice setup failed`,e),this.recordDebugEvent(`voice-setup-failed`,Q(e)),this.showError(`voice service not ready`)}}completeCallStart(e,t){if(this.isCurrentSession(e))if(t.resume){if(this.recordDebugEvent(`call-resumed`),this.navigationContext){let t=this.navigationContext;this.navigationContext=null,this.persistCallState(),window.setTimeout(()=>{this.turnQueue.enqueue({sessionId:e,transcript:t.originalPrompt,historyTranscript:t.originalPrompt,scrollRetryCount:0,navigationContext:t})},250)}}else t.silentGreeting||this.speakLocalGreeting(e)}async endCall(){this.recordDebugEvent(`end-call`),this.callSessionId++,this.isCallActive=!1,this.clearPersistedCallState(),this.isMuted=!1,this.clearActionModeState(),this.lastOpenAIResponseId=null,this.pendingOpenAIResponseId=null,this.pendingClarificationContext=null,this.setTextModeActive(!1,{clearInput:!0}),this.turnQueue.clear(),this.actionQueue.clear(),this.clearAutomationTimers(),this.automationAuthorizationMessageId=null,this.cancelPendingGuidanceClick(),this.activeOpenAIAbortController?.abort(),this.activeOpenAIAbortController=null,this.activeActionAbortController?.abort(),this.activeActionAbortController=null,this.stopSpeakingAudio(),this.currentAssistantSpeech=``,this.recentAssistantSpeech=[],this.chatMessages=[],this.expandedChatActivityMessageIds.clear(),this.isChatThinking=!1,this.chatThinkingText=`Thinking`,this.chatThinkingTargetText=`Thinking`,this.clearChatThinkingTransition(),this.navigationContext=null,this.microphoneRecoveryPromise=null,this.stopMicrophoneHealthMonitor(),this.clearPrimedAudioResources(),this.activeTranscriber?.stop(),this.activeTranscriber=null,this.stopMicrophoneStream(),this.hideAgent(),this.renderChatMessages(),this.setState(`idle`,``)}handleCommittedTranscript(e,t,n={}){let r=t.trim();if(!(!r||!this.isCurrentSession(e))){if(!n.trustedUserInput&&this.isLikelySelfEchoTranscript(r)){window.__BARKAN_DEBUG__={...window.__BARKAN_DEBUG__??{},lastIgnoredTranscript:r};return}if(!n.trustedUserInput&&this.isRecentlyHandledUserTranscript(r)){window.__BARKAN_DEBUG__={...window.__BARKAN_DEBUG__??{},lastIgnoredTranscript:r};return}this.resetPerMessageContextForFreshUserInput(),n.answeredQuestions!==!0&&(this.pendingClarificationContext=null),this.rememberUserTranscript(r),n.suppressUserMessage!==!0&&this.appendChatMessage(`user`,r,{allowDuplicate:n.trustedUserInput===!0}),this.persistCallState(),this.turnQueue.enqueue({sessionId:e,transcript:r,historyTranscript:n.originalTranscript?.trim()||r,previousResponseId:n.previousResponseId??this.lastOpenAIResponseId,questionToolCallId:n.questionToolCallId,suppressFurtherQuestions:n.suppressFurtherQuestions===!0,scrollRetryCount:0,silentResponse:n.silentResponse===!0,answeredQuestions:n.answeredQuestions===!0})}}async toggleCallMode(){if(this.isCallActive&&!this.isTextModeActive){this.recordDebugEvent(`shortcut-end-call`),await this.endCall();return}if(this.recordDebugEvent(`shortcut-start-call`),!this.isCallActive){await this.startCall();return}this.setTextModeActive(!1),this.isMuted=!1,this.applyMicrophoneCaptureState(),(this.state===`muted`||this.state===`listening`)&&this.setState(`listening`,`listening`),this.persistCallState()}async openChatFromLauncher(){if(!(this.isLauncherBusy||this.isTextModeActive||this.isCallActive)){this.setLauncherBusy(!0);try{await this.startCall({openChat:!0,silentGreeting:!0})}finally{this.setLauncherBusy(!1)}}}async closeChatToLauncher(){!this.isCallActive&&!this.isTextModeActive||(await this.endCall(),this.launcherButton.focus())}async openCallFromChat(){if(!this.isChatCallBusy){this.setChatCallBusy(!0);try{if(!this.isCallActive){await this.startCall({silentGreeting:!0});return}this.recordDebugEvent(`chat-open-call`),this.setTextModeActive(!1),this.isMuted=!1,this.setState(`connecting`,`connecting`),await this.recoverMicrophonePipeline(`unmute`),this.isCallActive&&!this.isMuted&&this.state!==`error`&&(this.applyMicrophoneCaptureState(),this.setState(`listening`,`listening`)),this.persistCallState()}finally{this.setChatCallBusy(!1)}}}async toggleChatMode(){if(this.isTextModeActive){await this.endCall();return}if(!this.isCallActive){await this.startCall({openChat:!0,silentGreeting:!0});return}this.recordDebugEvent(`shortcut-open-chat`),this.activeOpenAIAbortController&&(this.isSpeechInterruptedByUser=!0,this.activeOpenAIAbortController.abort(),this.activeOpenAIAbortController=null,this.setChatThinking(!1)),this.stopSpeakingAudio(),this.currentAssistantSpeech=``,this.setTextModeActive(!0)}setTextModeActive(e,t={}){e&&!this.isCallActive||(e||(this.actionQueue.clear(),this.activeActionAbortController?.abort(),this.activeActionAbortController=null,this.clearAutomationTimers(),this.automationAuthorizationMessageId=null,this.clearActionModeState()),this.isTextModeActive=e,this.isActionModeActive=e&&this.textEntryMode===`act`,e&&(this.isMuted=!0,this.applyMicrophoneCaptureState(),(this.state===`listening`||this.state===`muted`)&&this.setState(`muted`,`muted`),window.setTimeout(()=>{this.isTextModeActive&&this.isCallActive&&(this.textQuestionInput.focus(),this.updateChatComposer())},0)),t.clearInput&&(this.textQuestionInput.value=``,this.updateChatComposer()),!e&&this.textQuestionInput===this.root.shadowRoot?.activeElement&&this.textQuestionInput.blur(),e?this.applyChatSidebarPageResize():this.clearChatSidebarPageResize(),this.updateTextModeUi())}submitTypedQuestion(e){if(e.preventDefault(),!this.isCallActive)return;if(this.isChatThinking){this.stopCurrentGeneration();return}let t=this.textQuestionInput.value.trim();if(!t){this.openCallFromChat();return}this.textQuestionInput.value=``,this.updateChatComposer(),this.shouldRouteTypedInputToQuestionFlow(t)?(this.clearActionChoices(),this.isMuted=!0,this.applyMicrophoneCaptureState(),(this.state===`listening`||this.state===`muted`)&&this.setState(`muted`,`muted`),this.recordDebugEvent(`typed-question-submit`),this.handleCommittedTranscript(this.callSessionId,t,{silentResponse:!0,trustedUserInput:!0})):this.textEntryMode===`act`?(this.clearActionChoices(),this.recordDebugEvent(`typed-action-submit`),this.appendChatMessage(`user`,t,{allowDuplicate:!0}),this.appendGoalConversationEntry(`user`,t),this.actionQueue.enqueue({sessionId:this.callSessionId,userMessage:t})):this.textEntryMode===`automation`?(this.clearActionChoices(),this.recordDebugEvent(`typed-automation-submit`),this.appendChatMessage(`user`,t,{allowDuplicate:!0}),this.startAutomationBlueprintSequence()):(this.clearActionChoices(),this.isMuted=!0,this.applyMicrophoneCaptureState(),(this.state===`listening`||this.state===`muted`)&&this.setState(`muted`,`muted`),this.recordDebugEvent(`typed-question-submit`),this.handleCommittedTranscript(this.callSessionId,t,{silentResponse:!0,trustedUserInput:!0})),this.updateTextModeUi(),this.textQuestionInput.focus()}shouldRouteTypedInputToQuestionFlow(e){let t=e.trim().toLowerCase();return/\bask\s+(?:me|us)\b/.test(t)&&/\bquestions?\b/.test(t)}startAutomationBlueprintSequence(){let e=++this.automationSequenceId;this.clearAutomationTimers(),this.automationAuthorizationMessageId=null,this.setChatThinking(!0,`Thinking`),this.setState(`thinking`,`thinking`),this.queueAutomationStep(e,1900,()=>{this.setChatThinking(!1),this.appendStreamingAssistantMessage(`Calling Gmail authorization tool.`,{allowDuplicate:!0,presentation:`thinking`}),this.setState(`thinking`,`calling tool`)}),this.queueAutomationStep(e,4600,()=>{this.settleActiveThinkingMessages(),this.appendStreamingAssistantMessage(`Building your blueprint.`,{allowDuplicate:!0,presentation:`thinking`}),this.setState(`thinking`,`building blueprint`)}),this.queueAutomationStep(e,Lt,()=>{this.openAutomationAuthorizationDialog()})}queueAutomationStep(e,t,n){let r=window.setTimeout(()=>{this.automationTimers=this.automationTimers.filter(e=>e!==r),!(e!==this.automationSequenceId||!this.isCallActive)&&n()},t);this.automationTimers.push(r)}clearAutomationTimers(){for(let e of this.automationTimers)window.clearTimeout(e);this.automationTimers=[]}openAutomationAuthorizationDialog(){this.settleActiveThinkingMessages(),this.setChatThinking(!1),this.automationAuthorizationMessageId=this.appendChatMessage(`assistant`,`Need your authorization to continue.`,{allowDuplicate:!0,presentation:`authorization`})}async authorizeAutomationGmail(e){e?.disabled||(e&&(e.disabled=!0,e.textContent=`Authorizing...`),this.setChatThinking(!0,`Authorizing Gmail`),await new Promise(e=>window.setTimeout(e,500)),this.isCallActive&&(this.setChatThinking(!1),e&&(e.textContent=`Authorized`),this.appendStreamingAssistantMessage(`Gmail authorized.`,{allowDuplicate:!0}),this.finishAutomationBlueprintDeployment()))}finishAutomationBlueprintDeployment(){let e=++this.automationSequenceId;this.clearAutomationTimers(),this.setState(`thinking`,`deploying your blueprint`),this.setChatThinking(!0,`Deploying your blueprint`),this.queueAutomationStep(e,Rt,()=>{this.setChatThinking(!1),this.appendStreamingAssistantMessage(`Your blueprint is deployed.`,{allowDuplicate:!0}),this.setState(`muted`,`blueprint deployed`)})}handleTextQuestionKeyDown(e){if(e.key===`Enter`&&!e.shiftKey&&!e.isComposing){e.preventDefault(),this.textQuestionForm.requestSubmit();return}e.key===`Escape`&&(e.preventDefault(),this.closeChatToLauncher())}toggleModePicker(e){if(!(!this.isCallActive||!this.isTextModeActive)){if(this.openModePicker===e){this.closeModePicker();return}this.openModePickerMenu(e)}}openModePickerMenu(e,t=!1){!this.isCallActive||!this.isTextModeActive||(this.openModePicker=e,this.syncModePickerOpenState(),t&&this.focusSelectedModeOption(e))}closeModePicker({restoreFocus:e=!1}={}){let t=this.openModePicker;this.openModePicker=null,this.syncModePickerOpenState(),e&&t&&this.getModePickerButton(t).focus()}chooseModePickerOption(e){let t=this.getModePickerPlacementForOption(e),n=e.dataset.mode??``,r=xn(n)?n:`show`;if(this.closeModePicker(),r===this.textEntryMode){t&&this.getModePickerButton(t).focus();return}this.changeTextEntryMode(r)}handleModePickerButtonKeyDown(e,t){e.key!==`ArrowDown`&&e.key!==`ArrowUp`||(e.preventDefault(),this.openModePickerMenu(t,!0))}handleModePickerOptionKeyDown(e,t){let n=this.getModePickerPlacementForOption(t);if(n){if(e.key===`Escape`){e.preventDefault(),this.closeModePicker({restoreFocus:!0});return}if(e.key===`Enter`||e.key===` `){e.preventDefault(),this.chooseModePickerOption(t);return}(e.key===`ArrowDown`||e.key===`ArrowUp`||e.key===`Home`||e.key===`End`)&&(e.preventDefault(),this.focusModePickerOption(n,t,e.key))}}closeModePickerFromShadowEvent(e){if(!this.openModePicker)return;let t=this.getModePicker(this.openModePicker);e.composedPath().includes(t)||this.closeModePicker()}closeModePickerFromDocumentEvent=e=>{!this.openModePicker||e.composedPath().includes(this.root)||this.closeModePicker()};syncModePickerOpenState(){for(let e of[`empty`,`composer`]){let t=this.openModePicker===e;this.getModePicker(e).dataset.open=t?`true`:`false`,this.getModePickerButton(e).setAttribute(`aria-expanded`,t?`true`:`false`)}}syncModePickerSelection(){this.chatEmptyModeLabel.textContent=Sn(this.textEntryMode,`empty`),this.textQuestionModeLabel.textContent=Sn(this.textEntryMode,`composer`);for(let e of[...this.chatEmptyModeOptions,...this.textQuestionModeOptions])e.setAttribute(`aria-selected`,e.dataset.mode===this.textEntryMode?`true`:`false`)}focusSelectedModeOption(e){(this.getModePickerOptions(e).find(e=>e.dataset.mode===this.textEntryMode)??this.getModePickerOptions(e)[0])?.focus()}focusModePickerOption(e,t,n){let r=this.getModePickerOptions(e),i=Math.max(0,r.indexOf(t)),a=r.length-1;r[n===`Home`?0:n===`End`?a:n===`ArrowUp`?(i-1+r.length)%r.length:(i+1)%r.length]?.focus()}getModePickerPlacementForOption(e){let t=e.closest(`[data-picker]`);return t?.dataset.picker===`empty`||t?.dataset.picker===`composer`?t.dataset.picker:null}getModePicker(e){return e===`empty`?this.chatEmptyModePicker:this.textQuestionModePicker}getModePickerButton(e){return e===`empty`?this.chatEmptyModeButton:this.textQuestionModeButton}getModePickerOptions(e){return e===`empty`?this.chatEmptyModeOptions:this.textQuestionModeOptions}updateTextModeUi(){let e=this.isCallActive&&this.isTextModeActive;e||this.closeModePicker(),this.callControl.dataset.textMode=this.isTextModeActive?`true`:`false`,this.updateCallControlVisibility(),this.textQuestionForm.dataset.actionMode=this.isActionModeActive?`true`:`false`,this.textQuestionForm.dataset.mode=this.textEntryMode,this.chatEmptyState.dataset.mode=this.textEntryMode,this.syncModePickerSelection(),this.syncModePickerOpenState(),this.chatEmptyModeSuffix.textContent=Cn(this.textEntryMode),this.chatPanel.dataset.visible=e?`true`:`false`,this.chatPanel.setAttribute(`aria-hidden`,e?`false`:`true`),this.textQuestionInput.tabIndex=e?0:-1,this.textQuestionSendButton.tabIndex=e?0:-1,this.textQuestionModeButton.tabIndex=e?0:-1,this.chatEmptyModeButton.tabIndex=e?0:-1,this.chatCloseButton.tabIndex=e?0:-1,this.updateChatComposer(),this.renderChatMessages(),this.updateLauncherVisibility()}setLauncherBusy(e){this.isLauncherBusy=e,this.launcherButton.dataset.busy=e?`true`:`false`,this.launcherButton.disabled=e,this.updateLauncherVisibility()}setChatCallBusy(e){this.isChatCallBusy=e,this.textQuestionSendButton.dataset.voiceBusy=e?`true`:`false`,this.updateChatComposer()}updateLauncherVisibility(){let e=!this.isCallActive&&this.state!==`error`;this.launcherButton.dataset.visible=e?`true`:`false`,this.launcherButton.setAttribute(`aria-hidden`,e?`false`:`true`),this.launcherButton.tabIndex=e?0:-1}changeTextEntryMode(e){if(!this.isCallActive||!this.isTextModeActive)return;let t=xn(e)?e:`show`;t!==this.textEntryMode&&(this.resetChatForModeChange(),this.setTextEntryMode(t),this.recordDebugEvent(`text-entry-mode`,this.textEntryMode),this.updateTextModeUi(),this.textQuestionInput.focus())}setTextEntryMode(e,t={}){this.textEntryMode=e,t.persistPreference!==!1&&(this.preferredTextEntryMode=e,this.persistTextEntryMode(e)),this.isActionModeActive=this.isTextModeActive&&e===`act`}resetChatForModeChange(){this.turnQueue.clear(),this.actionQueue.clear(),this.activeOpenAIAbortController?.abort(),this.activeOpenAIAbortController=null,this.activeActionAbortController?.abort(),this.activeActionAbortController=null,this.clearAutomationTimers(),this.automationAuthorizationMessageId=null,this.clearActionModeState(),this.chatMessages=[],this.expandedChatActivityMessageIds.clear(),this.isChatThinking=!1,this.chatThinkingText=`Thinking`,this.chatThinkingTargetText=`Thinking`,this.clearChatThinkingTransition(),this.currentAssistantSpeech=``,this.recentAssistantSpeech=[],this.navigationContext=null,this.textQuestionInput.value=``,this.updateChatComposer(),this.renderChatMessages()}clearActionModeState(){this.goalRunState=null,this.goalConversationContext=[],this.clearActionChoices()}clearActionChoices(){this.choicePrompts=[],this.choiceAnswerStates=[],this.activeChoicePromptIndex=0,this.choicePromptMode=null,this.actionChoiceContainer.replaceChildren(),this.actionChoiceContainer.dataset.visible=`false`,this.textQuestionForm.dataset.hasQuestion=`false`}renderChoicePrompts(e=[],t=`action`){let n=e.map(e=>({prompt:e.prompt.trim()||`What should Barkan do next?`,choices:e.choices.slice(0,4)})).filter(e=>e.prompt.length>0);if(this.choicePrompts=n,this.choicePromptMode=n.length>0?t:null,this.activeChoicePromptIndex=0,this.choiceAnswerStates=n.map(e=>({selectedIndex:e.choices.length>0?this.getDefaultChoiceIndex(e.choices):0,freeformValue:``})),this.actionChoiceContainer.replaceChildren(),n.length===0){this.actionChoiceContainer.dataset.visible=`false`,this.textQuestionForm.dataset.hasQuestion=`false`;return}this.actionChoiceContainer.dataset.visible=`true`,this.textQuestionForm.dataset.hasQuestion=`true`,this.renderActionChoicePanel({animate:!0,focus:!0}),this.updateTextModeUi()}getDefaultChoiceIndex(e){let t=e.findIndex(e=>e.recommended===!0);return t>=0?t:e.length>0?0:-1}getActiveChoicePrompt(){return this.choicePrompts[this.activeChoicePromptIndex]??null}getActiveChoiceAnswerState(){return this.choiceAnswerStates[this.activeChoicePromptIndex]??{selectedIndex:-1,freeformValue:``}}updateActiveChoiceAnswerState(e){this.choiceAnswerStates[this.activeChoicePromptIndex]=e}renderActionChoicePanel(e={}){let t=this.choicePromptMode,n=this.getActiveChoicePrompt();if(!t||!n){this.clearActionChoices();return}this.actionChoiceContainer.replaceChildren();let r=document.createElement(`div`);r.className=`barkan-question-panel`,r.dataset.animate=e.animate===!0?`true`:`false`,r.tabIndex=0,r.role=`group`,r.setAttribute(`aria-label`,`Clarification question`),r.addEventListener(`keydown`,e=>this.handleActionChoicePanelKeyDown(e));let i=document.createElement(`div`);i.className=`barkan-question-panel__header`;let a=document.createElement(`div`);a.className=`barkan-question-panel__heading`;let o=document.createElement(`p`);if(o.className=`barkan-question-panel__prompt`,o.textContent=n.prompt,a.appendChild(o),i.appendChild(a),this.choicePrompts.length>1){let e=document.createElement(`div`);e.className=`barkan-question-panel__nav`;let t=document.createElement(`button`);t.className=`barkan-question-panel__nav-button`,t.type=`button`,t.disabled=this.isChatThinking||this.activeChoicePromptIndex===0,t.setAttribute(`aria-label`,`Previous question`),t.innerHTML=`<svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden="true"><path d="M5.5 1L1 5.5L5.5 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,t.addEventListener(`click`,()=>this.moveToChoiceQuestion(-1));let n=document.createElement(`p`);n.className=`barkan-question-panel__progress`,n.textContent=`${this.activeChoicePromptIndex+1} of ${this.choicePrompts.length}`;let r=document.createElement(`button`);r.className=`barkan-question-panel__nav-button`,r.type=`button`,r.disabled=this.isChatThinking||!this.canSubmitActionChoice(),r.setAttribute(`aria-label`,`Next question`),r.innerHTML=`<svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden="true"><path d="M1 1L5.5 5.5L1 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,r.addEventListener(`click`,()=>this.advanceOrSubmitActionChoice()),e.append(t,n,r),i.appendChild(e)}r.appendChild(i);let s=document.createElement(`div`);s.className=`barkan-question-panel__options`,this.getRenderableActionChoices().forEach((e,t)=>{s.appendChild(this.createActionChoiceOption(e,t))}),r.appendChild(s);let c=document.createElement(`div`);c.className=`barkan-question-panel__footer`;let l=document.createElement(`button`);l.className=`barkan-question-panel__dismiss`,l.type=`button`,l.disabled=this.isChatThinking,l.addEventListener(`click`,()=>{r.blur()});let u=document.createElement(`span`);u.textContent=`Dismiss`;let d=document.createElement(`span`);d.className=`barkan-question-panel__keycap`,d.textContent=`ESC`,l.append(u,d);let f=document.createElement(`button`);f.className=`barkan-question-panel__continue`,f.type=`button`,f.disabled=this.isChatThinking||!this.canSubmitActionChoice(),f.addEventListener(`click`,()=>this.advanceOrSubmitActionChoice());let p=document.createElement(`span`);p.className=`barkan-question-panel__continue-label`,p.textContent=`Continue`;let m=document.createElement(`span`);m.className=`barkan-question-panel__continue-icon`,m.innerHTML=`<svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true"><path d="M6.66667 2L3 5.66667L1.33333 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,f.append(p,m),c.append(l,f),r.appendChild(c),this.actionChoiceContainer.appendChild(r),e.focus!==!1&&r.focus({preventScroll:!0})}createActionChoiceOption(e,t){let n=this.getActiveChoiceAnswerState(),r=n.freeformValue.trim(),i=t===n.selectedIndex,a=e.editable===!0,o=document.createElement(`button`);o.className=`barkan-question-panel__option`,o.type=`button`,o.dataset.selected=i?`true`:`false`,o.dataset.editable=a?`true`:`false`,o.disabled=this.isChatThinking,o.addEventListener(`click`,()=>{this.updateActiveChoiceAnswerState({...this.getActiveChoiceAnswerState(),selectedIndex:t}),this.renderActionChoicePanel({animate:!1,focus:!1})});let s=document.createElement(`span`);s.className=`barkan-question-panel__option-index`,s.textContent=`${t+1}.`;let c=document.createElement(`span`);if(c.className=`barkan-question-panel__option-main`,a&&i){let e=document.createElement(`textarea`);e.className=`barkan-question-panel__option-input`,e.placeholder=`Write what you want to tell Barkan`,e.rows=1,e.value=n.freeformValue,e.disabled=this.isChatThinking,e.addEventListener(`click`,e=>e.stopPropagation()),e.addEventListener(`input`,()=>{this.updateActiveChoiceAnswerState({...this.getActiveChoiceAnswerState(),freeformValue:e.value}),e.style.height=`0px`,e.style.height=`${e.scrollHeight}px`;let t=this.actionChoiceContainer.querySelector(`.barkan-question-panel__continue`);t&&(t.disabled=!this.canSubmitActionChoice())}),c.appendChild(e),queueMicrotask(()=>{e.focus(),e.style.height=`0px`,e.style.height=`${e.scrollHeight}px`})}else{let t=document.createElement(`span`);if(t.className=`barkan-question-panel__option-label`,t.textContent=a&&r?r:e.label,e.recommended){let e=document.createElement(`span`);e.textContent=` (Recommended)`,t.appendChild(e)}c.appendChild(t)}if(o.append(s,c),i){let e=document.createElement(`span`);e.className=`barkan-question-panel__option-controls`,e.addEventListener(`click`,e=>e.stopPropagation()),e.append(this.createActionChoiceMoveButton(`up`,t===0),this.createActionChoiceMoveButton(`down`,t===this.getRenderableActionChoices().length-1)),o.appendChild(e)}return o}createActionChoiceMoveButton(e,t){let n=document.createElement(`button`);return n.className=`barkan-question-panel__option-control`,n.type=`button`,n.disabled=t||this.isChatThinking,n.setAttribute(`aria-label`,e===`up`?`Move selection up`:`Move selection down`),n.innerHTML=e===`up`?`<svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M6.5 10.2917V2.70833" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.70833 6.5L6.5 2.70833L10.2917 6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`:`<svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M6.5 2.70833V10.2917" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.2917 6.5L6.5 10.2917L2.70833 6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,n.addEventListener(`click`,()=>this.moveActionChoiceSelection(e===`up`?-1:1)),n}handleActionChoicePanelKeyDown(e){if(this.isChatThinking)return;let t=e.target,n=t?.tagName===`TEXTAREA`||t?.tagName===`INPUT`;if(!n&&/^[1-9]$/.test(e.key)){let t=Number.parseInt(e.key,10)-1;t>=0&&t<this.getRenderableActionChoices().length&&(e.preventDefault(),this.updateActiveChoiceAnswerState({...this.getActiveChoiceAnswerState(),selectedIndex:t}),this.renderActionChoicePanel({animate:!1,focus:!0}));return}if(e.key===`ArrowUp`){e.preventDefault(),this.moveActionChoiceSelection(-1);return}if(e.key===`ArrowDown`){e.preventDefault(),this.moveActionChoiceSelection(1);return}if(!n&&e.key===`ArrowLeft`&&this.activeChoicePromptIndex>0){e.preventDefault(),this.moveToChoiceQuestion(-1);return}if(!n&&e.key===`ArrowRight`&&this.activeChoicePromptIndex<this.choicePrompts.length-1){e.preventDefault(),this.moveToChoiceQuestion(1);return}if(e.key===`Escape`){e.preventDefault(),n&&t.blur(),this.actionChoiceContainer.querySelector(`.barkan-question-panel`)?.blur();return}e.key===`Enter`&&!e.shiftKey&&this.canSubmitActionChoice()&&(e.preventDefault(),this.advanceOrSubmitActionChoice())}moveActionChoiceSelection(e){let t=this.getRenderableActionChoices();if(t.length===0)return;let n=this.getActiveChoiceAnswerState(),r=Math.max(0,Math.min(t.length-1,n.selectedIndex+e));r!==n.selectedIndex&&(this.updateActiveChoiceAnswerState({...n,selectedIndex:r}),this.renderActionChoicePanel({animate:!1,focus:!0}))}moveToChoiceQuestion(e){if(e>0&&!this.canSubmitActionChoice())return;let t=Math.max(0,Math.min(this.choicePrompts.length-1,this.activeChoicePromptIndex+e));t!==this.activeChoicePromptIndex&&(this.activeChoicePromptIndex=t,this.renderActionChoicePanel({animate:!1,focus:!0}))}advanceOrSubmitActionChoice(){if(this.activeChoicePromptIndex<this.choicePrompts.length-1){this.moveToChoiceQuestion(1);return}this.submitSelectedActionChoice()}getRenderableActionChoices(){return this.getRenderableActionChoicesForPrompt(this.activeChoicePromptIndex)}getRenderableActionChoicesForPrompt(e){let t=[...this.choicePrompts[e]?.choices??[]],n=this.choiceAnswerStates[e]??{freeformValue:``};return this.hasBinaryYesNoChoicesForPrompt(e)||t.push({label:`Other (write your own)`,editable:!0,value:n.freeformValue}),t}hasBinaryYesNoChoicesForPrompt(e){let t=(this.choicePrompts[e]?.choices??[]).map(e=>e.label.trim().toLowerCase());return t.length===2&&t.some(e=>e.startsWith(`yes`))&&t.some(e=>e.startsWith(`no`))}canSubmitActionChoice(){let e=this.getActiveChoiceAnswerState();if(e.selectedIndex<0)return!1;let t=this.getRenderableActionChoices()[e.selectedIndex];return t?t.editable?e.freeformValue.trim().length>0:!0:!1}submitSelectedActionChoice(){let e=this.getActiveChoiceAnswerState();if(!(this.getRenderableActionChoices()[e.selectedIndex]??null)||!this.isCallActive||!this.choicePromptMode)return;let t=this.choicePromptMode,n=t===`question`||t===`action`||this.choicePrompts.length>1?this.buildQuestionChoiceSubmissionMessage():this.getDisplayAnswerForPrompt(this.activeChoicePromptIndex),r=this.buildSubmittedQuestionDetails(),i=t===`question`?this.pendingClarificationContext:null;if(t===`question`&&(this.pendingClarificationContext=null),this.clearActionChoices(),t===`action`){if(!this.isActionModeActive)return;this.appendAnsweredQuestionsActivity(r);let e={label:n.slice(0,240),value:this.buildSubmittedQuestionAnswerPayload()};this.appendGoalConversationEntry(`user`,n),this.actionQueue.enqueue({sessionId:this.callSessionId,selectedChoice:e});return}this.appendAnsweredQuestionsActivity(r),this.handleCommittedTranscript(this.callSessionId,n,{answeredQuestions:!0,originalTranscript:i?.originalPrompt,previousResponseId:i?.previousResponseId??this.lastOpenAIResponseId,questionToolCallId:i?.toolCallId,suppressFurtherQuestions:!0,silentResponse:!0,trustedUserInput:!0,suppressUserMessage:!0})}appendAnsweredQuestionsActivity(e){let t=e.length;t!==0&&this.appendChatMessage(`assistant`,`Answered ${t} ${t===1?`question`:`questions`}`,{allowDuplicate:!0,presentation:`thinking-static`,clarificationDetails:{entries:e}})}buildQuestionChoiceSubmissionMessage(){return this.choicePrompts.map((e,t)=>{let n=this.getSelectedAnswerForPrompt(t);return`${t+1}. ${e.prompt}\nAnswer: ${n||`No answer provided`}`}).join(`

`)}buildSubmittedQuestionDetails(){return this.choicePrompts.map((e,t)=>({question:e.prompt,answer:this.getDisplayAnswerForPrompt(t)||`No answer provided`}))}buildSubmittedQuestionAnswerPayload(){let e=this.choicePrompts.map((e,t)=>({question:e.prompt,answer:this.getDisplayAnswerForPrompt(t)||`No answer provided`,value:this.getSelectedAnswerValueForPrompt(t)}));return e.length===1?e[0]:e}getSelectedChoiceForPrompt(e){let t=this.choicePrompts[e],n=this.choiceAnswerStates[e];return!t||!n||n.selectedIndex<0?null:this.getRenderableActionChoicesForPrompt(e)[n.selectedIndex]??null}getSelectedAnswerForPrompt(e){return this.getDisplayAnswerForPrompt(e)}getDisplayAnswerForPrompt(e){let t=this.choiceAnswerStates[e],n=this.getSelectedChoiceForPrompt(e);if(!t||!n)return``;if(n.editable===!0)return t.freeformValue.trim();let r=n.value;return typeof r==`string`||typeof r==`number`||typeof r==`boolean`?String(r).trim():n.label.trim()}getSelectedAnswerValueForPrompt(e){let t=this.choiceAnswerStates[e],n=this.getSelectedChoiceForPrompt(e);return!t||!n?null:n.editable===!0?t.freeformValue.trim():n.value??n.label}async processActionTurn(e){if(!this.isCurrentSession(e.sessionId)||!this.isActionModeActive)return;let t=this.actionGenerationSequenceId,n=()=>t===this.actionGenerationSequenceId,r=0,i=e=>{r=Math.max(r,performance.now()+e)},a=async()=>{let e=r-performance.now();e>0&&!Tn()&&await new Promise(t=>window.setTimeout(t,e)),r=0},o=!!(e.userMessage&&!wn(this.goalRunState));this.setChatThinking(!0,o?`Creating plan...`:`Thinking`);try{let t=!!(e.userMessage&&wn(this.goalRunState)),r=e.userMessage&&!t?ve(e.userMessage):this.goalRunState;e.userMessage&&!t&&(this.goalRunState=r);let o={siteKey:this.siteKey,currentPage:this.buildActionPageContext(),goalRunState:r,goalConversationContext:this.goalConversationContext,...e.userMessage?{userMessage:e.userMessage}:{},...e.selectedChoice?{selectedChoice:e.selectedChoice}:{}};for(let t=0;t<24;t++){let t=await this.requestActionAgent(o);if(await a(),!this.isCurrentSession(e.sessionId)||!this.isActionModeActive||!n())return;if(t.type===`progress`){this.goalRunState=t.goalRunState,this.updateActionProgressLabel(t.progress.label),o={siteKey:this.siteKey,currentPage:this.buildActionPageContext(),goalRunState:this.goalRunState,goalConversationContext:this.goalConversationContext};continue}if(t.type===`unavailable`){this.updateActionProgressLabel(t.progress?.label),this.clearActionModeState(),this.setChatThinking(!1),this.appendStreamingAssistantMessage(t.message,{allowDuplicate:!0});return}if(t.type===`final`){this.updateActionProgressLabel(t.progress?.label);let e=xe(this.goalRunState,t.message,t.summaryTitle);this.goalRunState=null,this.clearActionChoices(),this.setChatThinking(!1),this.appendStreamingAssistantMessage(t.message,{allowDuplicate:!0}),this.appendChatMessage(`assistant`,e.title,{allowDuplicate:!0,presentation:`action-summary`,actionSummary:e}),this.appendGoalConversationEntry(`assistant`,t.message);return}if(t.type===`ask_user`){this.updateActionProgressLabel(t.progress?.label),this.goalRunState=t.goalRunState;let e=this.buildActionQuestionPrompts(t);e.length===0&&(this.setChatThinking(!1),this.appendStreamingAssistantMessage(t.message,{allowDuplicate:!0})),this.appendGoalConversationEntry(`assistant`,t.message),this.renderChoicePrompts(e,`action`);return}if(t.type===`execute`){this.updateActionProgressLabel(t.progress?.label);let e=t.progress?.label??this.chatThinkingTargetText;this.goalRunState=t.goalRunState;let r=Oe(t);if(r.length===0)throw Error(`action response had no executable HTTP calls`);let a=r.length===1?[{httpCall:r[0],result:await we(r[0])}]:await Te(r);if(!n())return;this.setChatThinking(!0,ye(e)),i(700);let s=_e(a);this.appendGoalConversationEntry(`tool`,a.map(({httpCall:e,result:t})=>De(e,t)).join(`
`)),o={siteKey:this.siteKey,currentPage:this.buildActionPageContext(),goalRunState:this.goalRunState,goalConversationContext:this.goalConversationContext,httpBatchResult:s}}}this.setChatThinking(!1),this.appendStreamingAssistantMessage(`I could not complete that action in a safe number of steps.`,{allowDuplicate:!0})}catch(e){if(e.name!==`AbortError`){console.warn(`[Barkan] action mode failed`,e);let t=Q(e).includes(`Restart the Barkan API server`)?`Action mode is not available on this Barkan API yet. Restart the Barkan API server, then try again.`:`I could not complete that action. Please try again.`;this.setChatThinking(!1),this.appendStreamingAssistantMessage(t,{allowDuplicate:!0})}}finally{this.isCurrentSession(e.sessionId)&&(this.setChatThinking(!1),this.updateTextModeUi())}}buildActionQuestionPrompts(e){return(e.questions?.length?e.questions:[{message:e.message,choices:e.choices}]).map(e=>({prompt:e.message,choices:e.choices??[]})).filter(e=>e.prompt.trim().length>0)}async requestActionAgent(e){let t=new AbortController;this.activeActionAbortController=t;try{let n=await fetch(`${this.apiBaseUrl}/api/widget/action`,{method:`POST`,signal:t.signal,headers:{"content-type":`application/json`},body:JSON.stringify(e)});if(!n.ok){let e=await n.text();throw n.status===404&&e.includes(`/api/widget/action`)?Error(`action mode is not available on this Barkan API yet. Restart the Barkan API server.`):Error(`action failed ${n.status}: ${e}`)}return await n.json()}finally{this.activeActionAbortController===t&&(this.activeActionAbortController=null)}}appendGoalConversationEntry(e,t){this.goalConversationContext=Ee(this.goalConversationContext,{role:e,text:t})}buildActionPageContext(){return{pathname:window.location.pathname||`/`,...window.location.search?{search:window.location.search}:{},...window.location.hash?{hash:window.location.hash}:{}}}applyChatSidebarPageResize(){this.pageResizeCleanupTimer!==null&&(window.clearTimeout(this.pageResizeCleanupTimer),this.pageResizeCleanupTimer=null);let e=this.getChatSidebarReservedWidth();if(e<=0){this.clearChatSidebarPageResize();return}let t=document.body;if(t){if(!this.pageResizeRestore){let e=t.style.marginRight,n=t.style.transition,r=t.style.boxSizing,i=document.documentElement.style.getPropertyValue(`--barkan-chat-sidebar-reserved-width`);this.pageResizeRestore=()=>{this.restoreChatSidebarPageResizeTargets(),t.style.marginRight=e,t.style.transition=n,t.style.boxSizing=r,i?document.documentElement.style.setProperty(`--barkan-chat-sidebar-reserved-width`,i):document.documentElement.style.removeProperty(`--barkan-chat-sidebar-reserved-width`),this.pageResizeRestore=null}}this.restoreChatSidebarPageResizeTargets(),document.documentElement.style.setProperty(`--barkan-chat-sidebar-reserved-width`,`${e}px`),t.style.boxSizing=`border-box`,t.style.transition=this.isChatSidebarResizing?`none`:Lo(t.style.transition,Ft),t.style.marginRight=`${e}px`}}clearChatSidebarPageResize(e={}){if(!this.pageResizeRestore)return;this.pageResizeCleanupTimer!==null&&(window.clearTimeout(this.pageResizeCleanupTimer),this.pageResizeCleanupTimer=null);let t=document.body;if(!t||e.immediate){this.pageResizeRestore();return}let n=this.pageResizeRestore;t.style.transition=Lo(t.style.transition,Ft),t.style.marginRight=`0px`,this.restoreChatSidebarPageResizeTargets(),this.pageResizeCleanupTimer=window.setTimeout(()=>{this.pageResizeRestore===n&&(n(),this.pageResizeCleanupTimer=null)},Pt+40)}getChatSidebarReservedWidth(){return window.innerWidth<760?0:Math.min(this.chatSidebarWidth,window.innerWidth-Nt)}restoreChatSidebarPageResizeTargets(){for(let e of this.pageResizeTargetRestores)e.element.isConnected&&(e.element.style.width=e.width,e.element.style.maxWidth=e.maxWidth,e.element.style.minWidth=e.minWidth,e.element.style.right=e.right,e.element.style.transition=e.transition,e.element.style.boxSizing=e.boxSizing);this.pageResizeTargetRestores=[]}setChatSidebarWidth(e,t={}){this.chatSidebarWidth=this.getClampedChatSidebarWidth(e),this.chatPanel.style.setProperty(`--barkan-chat-sidebar-width`,`${this.chatSidebarWidth}px`),!(t.updateLayout===!1||!this.isTextModeActive)&&(this.applyChatSidebarPageResize(),this.positionAgentAtTarget())}getClampedChatSidebarWidth(e){let t=Math.max(jt,Math.min(Mt,window.innerWidth-Nt));return Math.round(Math.min(Math.max(e,jt),t))}updateChatComposer(){this.textQuestionInput.style.height=`0px`;let e=Math.min(132,Math.max(20,this.textQuestionInput.scrollHeight));this.textQuestionInput.style.height=`${e}px`;let t=this.textQuestionInput.value.trim().length>0,n=!this.isChatThinking&&!t;this.textQuestionSendButton.disabled=this.isChatCallBusy,this.textQuestionSendButton.dataset.generating=this.isChatThinking?`true`:`false`,this.textQuestionSendButton.dataset.inputEmpty=n?`true`:`false`,this.textQuestionSendButton.setAttribute(`aria-label`,this.isChatThinking?`Stop generation`:n?`Start voice chat`:`Send chat message`),this.textQuestionSendButton.title=this.isChatThinking?`Stop`:n?`Voice`:`Send`,this.actionChoiceContainer.querySelectorAll(`button, textarea`).forEach(e=>{e.disabled=this.isChatThinking})}stopCurrentGeneration(){this.recordDebugEvent(`stop-generation`),this.turnQueue.clear(),this.actionQueue.clear(),this.clearAutomationTimers(),this.automationSequenceId++,this.actionGenerationSequenceId++,this.activeOpenAIAbortController&&(this.isSpeechInterruptedByUser=!0),this.activeOpenAIAbortController?.abort(),this.activeOpenAIAbortController=null,this.activeActionAbortController?.abort(),this.activeActionAbortController=null,this.stopSpeakingAudio(),this.currentAssistantSpeech=``,this.setChatThinking(!1),(this.state===`thinking`||this.state===`speaking`)&&this.setState(this.isMuted?`muted`:`listening`,this.isMuted?`muted`:`listening`),this.updateTextModeUi()}appendChatMessage(e,t,n={}){let r=t.trim();if(!r)return null;let i=this.chatMessages[this.chatMessages.length-1];if(!n.allowDuplicate&&i?.role===e&&Co(i.text)===Co(r))return i.id;let a=`${Date.now()}-${Math.random().toString(16).slice(2)}`;return this.chatMessages=[...this.chatMessages,{id:a,role:e,text:r,presentation:n.presentation??`normal`,...n.actionSummary?{actionSummary:n.actionSummary}:{},...n.clarificationDetails?{clarificationDetails:n.clarificationDetails}:{}}].slice(-30),this.renderChatMessages(),a}updateChatMessageText(e,t){if(!e)return;let n=t.trim();if(!n)return;let r=!1;this.chatMessages=this.chatMessages.map(t=>t.id!==e||t.text===n?t:(r=!0,{...t,text:n})),r&&this.renderChatMessages()}appendStreamingAssistantMessage(e,t={}){let n=e.trim();if(!n)return null;if(Tn()||n.length<=18)return this.appendChatMessage(`assistant`,n,t);let r=this.getStreamingTextPrefix(n,18),i=this.appendChatMessage(`assistant`,r,t);if(!i||r.length>=n.length)return i;let a=r.length,o=()=>{this.chatMessages.some(e=>e.id===i)&&(a=this.getStreamingTextPrefix(n,a+18).length,this.updateChatMessageText(i,n.slice(0,a)),a<n.length&&window.setTimeout(o,28))};return window.setTimeout(o,28),i}getStreamingTextPrefix(e,t){if(t>=e.length)return e;let n=e.slice(t).search(/\s/);return e.slice(0,n>=0?t+n+1:t)}setChatThinking(e,t=`Thinking`){let n=t.trim()||`Thinking`,r=this.isActionModeActive&&n!==`Thinking`?be(n)??n:n;if(this.isChatThinking===e&&this.chatThinkingTargetText===r)return;if(!e){this.clearChatThinkingTransition(),this.isChatThinking=!1,this.chatThinkingText=r,this.chatThinkingTargetText=r,this.chatThinkingPreviousText=null,this.isChatThinkingTransitioning=!1,this.updateChatComposer(),this.renderChatMessages();return}let i=this.isChatThinking?this.chatThinkingTargetText:r;if(this.isChatThinking=e,this.chatThinkingTargetText=r,!this.isChatThinking||i===r||Tn()){this.clearChatThinkingTransition(),this.chatThinkingText=r,this.chatThinkingPreviousText=null,this.isChatThinkingTransitioning=!1,this.updateChatComposer(),this.renderChatMessages();return}this.updateChatComposer(),this.startChatThinkingTransition(i,r)}startChatThinkingTransition(e,t){this.clearChatThinkingTransition();let n=++this.chatThinkingTransitionSequence;this.chatThinkingPreviousText=e,this.chatThinkingText=t,this.isChatThinkingTransitioning=!0,this.renderChatMessages(),this.chatThinkingTransitionTimer=window.setTimeout(()=>{n!==this.chatThinkingTransitionSequence||!this.isChatThinking||(this.chatThinkingPreviousText=null,this.chatThinkingText=this.chatThinkingTargetText,this.isChatThinkingTransitioning=!1,this.chatThinkingTransitionTimer=null,this.renderChatMessages())},360)}clearChatThinkingTransition(){this.chatThinkingTransitionSequence+=1,this.chatThinkingPreviousText=null,this.isChatThinkingTransitioning=!1,this.chatThinkingTransitionTimer!==null&&(window.clearTimeout(this.chatThinkingTransitionTimer),this.chatThinkingTransitionTimer=null)}updateActionProgressLabel(e){let t=be(e);t&&(this.setChatThinking(!0,t),this.renderChatMessages())}settleActiveThinkingMessages(){let e=!1;this.chatMessages=this.chatMessages.map(t=>t.presentation===`thinking`?(e=!0,{...t,presentation:`thinking-static`}):t),e&&this.renderChatMessages()}renderChatMessages(){let e=document.createDocumentFragment();for(let t of this.chatMessages)e.appendChild(this.createChatMessageElement(t));if(this.isChatThinking){let t=this.createChatMessageElement({id:`thinking`,role:`assistant`,text:this.chatThinkingText,presentation:`thinking`});e.appendChild(t)}this.chatMessageList.replaceChildren(e);let t=this.chatMessages.length>0||this.isChatThinking;this.chatEmptyState.dataset.visible=t?`false`:`true`,this.isTextModeActive&&window.setTimeout(()=>{let e=this.chatMessageList.closest(`.chat-panel__thread`);e?.scrollTo({top:e.scrollHeight,behavior:`smooth`})},0)}createChatMessageElement(e){let t=document.createElement(`li`),n=e.role;t.className=`chat-panel__message-item chat-panel__message-item--${n}`;let r=document.createElement(`div`);if(r.className=`chat-panel__message chat-panel__message--${n}`,e.presentation===`authorization`)return r.classList.add(`chat-panel__message--authorization`),r.appendChild(this.createAutomationAuthorizationCard(e.text)),t.appendChild(r),t;if(e.presentation===`thinking`){let n=this.formatThinkingMessageText(e.text),i=this.chatThinkingPreviousText?this.formatThinkingMessageText(this.chatThinkingPreviousText):null,a=document.createElement(`div`);a.className=`chat-panel__thinking-line`,a.setAttribute(`aria-label`,n);let o=document.createElement(`span`);if(o.className=`chat-panel__thinking-text`,o.dataset.text=n,this.isChatThinkingTransitioning&&i!==null&&i!==n&&!Tn()){let e=document.createElement(`span`);e.className=`chat-panel__thinking-label chat-panel__thinking-label--leaving`,e.textContent=i??``;let t=document.createElement(`span`);t.className=`chat-panel__thinking-label chat-panel__thinking-label--entering`,t.textContent=n,o.append(e,t)}else{let e=document.createElement(`span`);e.className=`chat-panel__thinking-label`,e.textContent=n,o.appendChild(e)}return a.appendChild(o),r.appendChild(a),t.appendChild(r),t}if(e.presentation===`action-summary`&&e.actionSummary)return r.appendChild(this.createActionSummaryCard(e.actionSummary)),t.appendChild(r),t;if(e.clarificationDetails){let n=`barkan-chat-activity-${e.id}`,i=this.expandedChatActivityMessageIds.has(e.id),a=document.createElement(`button`);if(a.className=`chat-panel__activity-toggle`,a.type=`button`,a.textContent=e.text,a.setAttribute(`aria-expanded`,i?`true`:`false`),a.setAttribute(`aria-controls`,n),a.addEventListener(`click`,()=>{this.expandedChatActivityMessageIds.has(e.id)?this.expandedChatActivityMessageIds.delete(e.id):this.expandedChatActivityMessageIds.add(e.id),this.renderChatMessages()}),r.appendChild(a),i){let t=document.createElement(`div`);t.id=n,t.className=`chat-panel__activity-details`;for(let n of e.clarificationDetails.entries){let e=document.createElement(`div`);e.className=`chat-panel__activity-entry`,e.append(this.createChatActivityLine(`Question:`,n.question),this.createChatActivityLine(`Answer:`,n.answer)),t.appendChild(e)}r.appendChild(t)}return t.appendChild(r),t}let i=document.createElement(`p`);return i.className=`chat-panel__message-content`,e.presentation===`thinking-static`&&i.classList.add(`chat-panel__message-content--thinking-static`),i.textContent=e.text,r.appendChild(i),t.appendChild(r),t}createActionSummaryCard(e){let t=document.createElement(`article`);t.className=`action-summary-card`,t.setAttribute(`aria-label`,`Action summary: ${e.title}`);let n=document.createElement(`div`);n.className=`action-summary-card__main`;let r=document.createElement(`span`);r.className=`action-summary-card__icon`,r.setAttribute(`aria-hidden`,`true`),r.innerHTML=`
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M8 5.5h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M9 9h6M9 12h6M9 15h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M9.5 3.5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    `;let i=document.createElement(`div`);i.className=`action-summary-card__body`;let a=document.createElement(`p`);if(a.className=`action-summary-card__title`,a.textContent=e.title,i.appendChild(a),e.positiveCount>0||e.negativeCount>0){let t=document.createElement(`div`);t.className=`action-summary-card__counts`,t.setAttribute(`aria-label`,`${e.positiveCount} changed, ${e.negativeCount} removed`);let n=document.createElement(`span`);n.className=`action-summary-card__count action-summary-card__count--positive`,n.textContent=`+${e.positiveCount}`;let r=document.createElement(`span`);r.className=`action-summary-card__count action-summary-card__count--negative`,r.textContent=`-${e.negativeCount}`,t.append(n,r),i.appendChild(t)}let o=document.createElement(`button`);o.className=`action-summary-card__undo`,o.type=`button`,o.setAttribute(`aria-disabled`,`true`),o.title=`Undo`,o.innerHTML=`
      <span>Undo</span>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 7H5v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M5 7h8.5a5.5 5.5 0 1 1-4.6 8.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `,n.append(r,i,o);let s=document.createElement(`button`);return s.className=`action-summary-card__details`,s.type=`button`,s.setAttribute(`aria-disabled`,`true`),s.innerHTML=`
      <span>Details</span>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `,t.append(n,s),t}createChatActivityLine(e,t){let n=document.createElement(`p`);n.className=`chat-panel__activity-line`;let r=document.createElement(`span`);return r.className=`chat-panel__activity-line-label`,r.textContent=e,n.append(r,` `,t),n}formatThinkingMessageText(e){return!this.isActionModeActive||e===`Thinking`?e:be(e)??e}createAutomationAuthorizationCard(e){let t=document.createElement(`div`);t.className=`authorization-card`;let n=document.createElement(`div`);n.className=`authorization-card__header`;let r=document.createElementNS(`http://www.w3.org/2000/svg`,`svg`);r.setAttribute(`class`,`authorization-card__logo`),r.setAttribute(`viewBox`,`0 0 256 193`),r.setAttribute(`aria-hidden`,`true`),r.innerHTML=`
      <path fill="#4285F4" d="M58.18 192.05V93.14L25.5 63.19 0 48.86v126.8c0 9.08 7.36 16.39 16.39 16.39h41.79Z"/>
      <path fill="#34A853" d="M197.82 192.05h41.79c9.08 0 16.39-7.36 16.39-16.39V48.86l-29.27 16.75-28.91 27.53v98.91Z"/>
      <path fill="#EA4335" d="m58.18 93.14-4.45-41.08 4.45-39.31L128 64.98l69.82-52.23 4.67 37.19-4.67 43.2L128 145.37 58.18 93.14Z"/>
      <path fill="#FBBC04" d="M197.82 12.75v80.39L256 48.86V20.94c0-20.3-23.16-31.86-39.31-19.66l-18.87 11.47Z"/>
      <path fill="#C5221F" d="M0 48.86 26.77 69.2l31.41 23.94V12.75L39.31 1.28C23.11-10.92 0 .69 0 20.94v27.92Z"/>
    `;let i=document.createElement(`p`);i.className=`authorization-card__title`,i.textContent=e,n.append(r,i);let a=document.createElement(`p`);a.className=`authorization-card__copy`,a.textContent=`Authorize Gmail so Barkan can finish deploying this automation blueprint.`;let o=document.createElement(`button`);return o.className=`authorization-card__button`,o.type=`button`,o.textContent=`Authorize Gmail`,o.addEventListener(`click`,()=>void this.authorizeAutomationGmail(o)),t.append(n,a,o),t}async processCommittedTurn(e){if(!this.isCurrentSession(e.sessionId))return;this.isSpeechInterruptedByUser=!1,this.currentAssistantSpeech=``;let t=null,n=!1;try{let n=performance.now();$(`turn-start`,n,{mode:this.textEntryMode,route:X(),transcriptLength:e.transcript.length,silentResponse:e.silentResponse===!0,answeredQuestions:e.answeredQuestions===!0,hasPreviousResponseId:!!(e.previousResponseId??this.lastOpenAIResponseId)}),window.__BARKAN_DEBUG__={...window.__BARKAN_DEBUG__??{},lastRawResponse:``,lastSpokenResponse:``,lastPointBox:null,lastTimings:{}},this.hideAgent(),this.setChatThinking(!0),this.setState(`thinking`,`looking`);let r=performance.now(),i=kn(e.transcript,r),a=e.silentResponse?Promise.resolve(null):this.prepareTtsPlayer();t=a;let o=await i;if($(`dom-capture-ready`,n,{route:o.snapshot.route,domElements:Bo(o.snapshot.elements),uiFacts:o.snapshot.uiFacts.length,offscreenUiFacts:o.snapshot.offscreenUiFacts.length,contentBlocks:o.snapshot.contentBlocks?.length??0,forms:o.snapshot.forms?.length??0,relationships:o.snapshot.relationships?.length??0,timings:o.debugTimings??{}}),!this.isCurrentSession(e.sessionId)){a.then(e=>e?.close()).catch(()=>void 0);return}window.__BARKAN_DEBUG__={...window.__BARKAN_DEBUG__??{},lastTranscript:e.historyTranscript??e.transcript,lastDomSnapshot:o.snapshot,lastTimings:{...window.__BARKAN_DEBUG__?.lastTimings??{},releaseToContextReadyMs:Math.round(performance.now()-n),...o.debugTimings??{}}},await this.askOpenAI(e,o,a,n)}catch(r){n=r.name===`AbortError`&&this.isSpeechInterruptedByUser,r.name!==`AbortError`&&console.warn(`[Barkan] turn failed`,r),t?.then(e=>e?.close()).catch(()=>void 0),this.isCurrentSession(e.sessionId)&&!n&&this.showError(`try again`)}finally{n&&(this.isSpeechInterruptedByUser=!1),this.isCurrentSession(e.sessionId)&&(this.setChatThinking(!1),this.state!==`error`&&(this.setState(this.isMuted?`muted`:`listening`,this.isMuted?`muted`:`listening`),this.resumeMicrophoneCapture()))}}async askOpenAI(e,t,n,r){let i=new AbortController;this.activeOpenAIAbortController=i;let a=null,o=e.previousResponseId??this.lastOpenAIResponseId;try{this.pendingOpenAIResponseId=null,window.__BARKAN_DEBUG__={...window.__BARKAN_DEBUG__??{},sentPreviousOpenAIResponseId:o};let n={siteKey:this.siteKey,userPrompt:jo(e),...o?{previousResponseId:o}:{},...e.questionToolCallId?{questionToolCallId:e.questionToolCallId}:{},...e.suppressFurtherQuestions?{suppressFurtherQuestions:!0}:{},...e.navigationContext?{navigationContext:e.navigationContext}:{},...e.guidanceContext?{guidanceContext:e.guidanceContext}:{},debugTimings:t.debugTimings,domSnapshot:t.snapshot},s=JSON.stringify(n),c=performance.now();$(`openai-fetch-start`,r,{apiBaseUrl:this.apiBaseUrl,route:t.snapshot.route,payloadBytes:s.length,hasPreviousResponseId:!!o,hasQuestionToolCallId:!!e.questionToolCallId,suppressFurtherQuestions:e.suppressFurtherQuestions===!0}),a=await fetch(`${this.apiBaseUrl}/api/widget/openai-stream`,{method:`POST`,signal:i.signal,headers:{"content-type":`application/json`},body:s}),$(`openai-response-headers`,r,{fetchMs:Math.round(performance.now()-c),status:a.status,ok:a.ok,contentType:a.headers.get(`content-type`)??``})}catch(e){throw this.clearOpenAIAbortController(i),$(`openai-fetch-error`,r,{error:Q(e)}),e}if(!a)throw this.clearOpenAIAbortController(i),Error(`openai failed`);if(!a.ok)throw $(`openai-response-error`,r,{status:a.status,contentType:a.headers.get(`content-type`)??``}),this.clearOpenAIAbortController(i),Error(`openai failed`);let s=new pe,c=e.silentResponse!==!0,l=[],u,d=c?n.then(e=>{u=e,$(`tts-player-ready`,r,{ready:!!e,queuedChunks:l.length});for(let e of l.splice(0))u?.sendText(e.text,e.flush);return e}).catch(e=>(console.warn(`[Barkan] tts setup failed`,e),$(`tts-player-error`,r,{error:Q(e)}),u=null,null)):Promise.resolve(null),f=(t,n)=>{if(c&&this.isCurrentSession(e.sessionId)){if(u===void 0){l.push({text:t,flush:n});return}u?.sendText(t,n)}},p=``,m=``,h=!1,g=!1,_=null,v=null,y=null,b=!1,x=null,ee=!1,te=!1,ne=!1,re=!1,S=0,C=0,w=0,T={current:null};this.setState(`speaking`,`thinking`);try{await ue(a,async n=>{if(!this.isCurrentSession(e.sessionId)||g)return;p+=n;let i=ie(p);if(!i){window.__BARKAN_DEBUG__={...window.__BARKAN_DEBUG__??{},lastRawResponse:p,lastSpokenResponse:``,lastPointBox:null};return}let a=i.scrollTo;if(a&&_!==a.elementId){_=a.elementId;let e=await this.performScrollToElement(a.elementId,t);e&&!h&&(h=!0,y={elementId:a.elementId,label:a.label},this.showAgentAtPoint(e.x,e.y,i.spokenText||a.label))}let o=i.scroll;if(o&&await this.retryTurnAfterScroll(e,d,()=>this.performScrollAction(o,t))){g=!0;return}if(i.box&&!h){h=!0;let e=ae(i.box,window.innerWidth,window.innerHeight);this.showAgentAtPoint(e.x,e.y,i.spokenText)}let c=i.elementId?G(t,i.elementId):null;c&&!h&&(h=!0,y={elementId:c.elementId??i.elementId,label:c.label},this.showAgentAtPoint(c.x,c.y,i.spokenText)),m=i.spokenText,h&&m&&this.setAgentText(m),window.__BARKAN_DEBUG__={...window.__BARKAN_DEBUG__??{},lastRawResponse:p,lastSpokenResponse:m,lastPointBox:i.box??c??i.elementId,lastTimings:{...window.__BARKAN_DEBUG__?.lastTimings??{},firstOpenAITextMs:window.__BARKAN_DEBUG__?.lastTimings?.firstOpenAITextMs??Math.round(performance.now()-r)}},m&&(ne||(ne=!0,$(`first-speakable-text`,r,{chars:m.length,sseChunkCount:C,sseEventCount:S,sseTotalBytes:w})),this.currentAssistantSpeech=m,this.setState(`speaking`,m),x?this.updateChatMessageText(x,m):(this.setChatThinking(!1),x=this.appendChatMessage(`assistant`,m,{allowDuplicate:!0})));for(let e of s.updateSpokenPreview(m))f(e.text,e.flush)},async n=>{if(!(!this.isCurrentSession(e.sessionId)||g)){if(S+=1,te||(te=!0,$(`first-sse-event`,r,{type:n.type,sseChunkCount:C,sseTotalBytes:w})),n.type===`navigate`){T.current=n;return}if(n.type===`openai_response`){$(`openai-response-id`,r,{responseId:n.responseId}),v=n.responseId,this.pendingOpenAIResponseId=n.responseId,window.__BARKAN_DEBUG__={...window.__BARKAN_DEBUG__??{},pendingOpenAIResponseId:n.responseId,lastOpenAIResponseId:this.lastOpenAIResponseId??void 0};return}if(n.type===`question`){re||(re=!0,$(`first-question-event`,r,{questions:n.questions?.length??+!!n.question,sseChunkCount:C,sseEventCount:S,sseTotalBytes:w})),this.isTextModeActive||this.setTextModeActive(!0),this.pendingClarificationContext={originalPrompt:e.historyTranscript??e.transcript,previousResponseId:v??this.pendingOpenAIResponseId??o,...n.toolCallId?{toolCallId:n.toolCallId}:{}},b=!0,this.renderChoicePrompts(n.questions.map(e=>({prompt:e.question,choices:e.choices})),`question`),window.__BARKAN_DEBUG__={...window.__BARKAN_DEBUG__??{},lastQuestion:{questions:n.questions.map(e=>({question:e.question,choices:e.choices.map(e=>e.label)}))}};return}if(n.type===`done`){$(`sse-done`,r,{sseChunkCount:C,sseEventCount:S,sseTotalBytes:w,responseChars:p.length,renderedQuestionEvent:b});return}if(n.type===`scroll`){if(n.elementId){let r=await this.performScrollToElement(n.elementId,t);r&&(y={elementId:n.elementId,label:r.label??n.label},h||(h=!0,this.showAgentAtPoint(r.x,r.y,m||n.label||``)),n.needFurtherAction===!0?this.armGuidanceClick(e,t,{elementId:n.elementId,label:r.label??n.label,instruction:m||n.label||``}):this.cancelPendingGuidanceClick());return}let r=n.surfaceId&&n.direction?()=>this.performScrollAction({surfaceId:n.surfaceId,direction:n.direction},t):null;r&&await this.retryTurnAfterScroll(e,d,r)&&(g=!0);return}if(n.type===`point`&&!h){let r=n.label??m;if(n.box){let e=ae({...n.box,label:r},window.innerWidth,window.innerHeight);h=!0,this.showAgentAtPoint(e.x,e.y,m||r);return}let i=n.elementId?G(t,n.elementId):null;if(i){h=!0,y={elementId:i.elementId??n.elementId,label:i.label??r},this.showAgentAtPoint(i.x,i.y,m||r),n.needFurtherAction===!0?this.armGuidanceClick(e,t,{elementId:i.elementId??n.elementId,label:i.label??r,instruction:m||r}):this.cancelPendingGuidanceClick();return}}}},e=>{C=e.chunkIndex,w=e.totalBytes,ee||(ee=!0,$(`first-sse-chunk`,r,{chunkBytes:e.byteLength,totalBytes:e.totalBytes,streamElapsedMs:e.elapsedMs}))})}catch(e){throw this.clearOpenAIAbortController(i),$(`openai-stream-error`,r,{error:Q(e),sseChunkCount:C,sseEventCount:S,sseTotalBytes:w}),console.warn(`[Barkan] openai stream failed`,e),e}if(g){$(`turn-paused-for-scroll-retry`,r,{sseChunkCount:C,sseEventCount:S,sseTotalBytes:w}),this.clearOpenAIAbortController(i);return}let oe=s.flushRemaining(m);if(oe&&f(oe.text,!0),!m.trim()){if(this.clearOpenAIAbortController(i),b){this.commitOpenAIResponseId(v??this.pendingOpenAIResponseId),$(`turn-complete-question-only`,r,{sseChunkCount:C,sseEventCount:S,sseTotalBytes:w,receivedOpenAIResponseId:v??this.pendingOpenAIResponseId??null}),(await d)?.close();return}throw Error(`OpenAI returned no spoken text.`)}if(!this.pendingGuidanceClick&&la(m)){let n=y??ua(t,e.transcript,m);if(n){let r=G(t,n.elementId);window.__BARKAN_DEBUG__={...window.__BARKAN_DEBUG__??{},lastGuidanceInference:{spokenText:m,elementId:n.elementId,label:n.label}},r?(h||(h=!0,this.showAgentAtPoint(r.x,r.y,m||n.label||``)),this.armGuidanceClick(e,t,{elementId:n.elementId,label:n.label,instruction:m})):this.recordDebugEvent(`guidance-inference-unresolved`,n.elementId)}}this.rememberAssistantSpeech(m),this.commitOpenAIResponseId(v),this.setChatThinking(!1),$(`turn-complete-text-ready`,r,{sseChunkCount:C,sseEventCount:S,sseTotalBytes:w,responseChars:m.length,renderedQuestionEvent:b,hasPointed:h}),x?this.updateChatMessageText(x,m):x=this.appendChatMessage(`assistant`,m,{allowDuplicate:!0});let E=await d;if(!this.isCurrentSession(e.sessionId)){E?.close(),this.clearOpenAIAbortController(i);return}if(c&&(!(await E?.finishAndWaitForAudio()??!1)&&m?await this.playHttpTtsFallback(m):await E?.waitForPlaybackComplete()),this.currentAssistantSpeech=``,this.persistCallState(),T.current&&this.isSafeSameOriginNavigation(T.current.route,e)){this.navigateAfterSpeech(T.current.route,e,t.snapshot.route),this.clearOpenAIAbortController(i);return}await Z(350),this.clearOpenAIAbortController(i)}commitOpenAIResponseId(e){e&&(this.lastOpenAIResponseId=e,this.pendingOpenAIResponseId=null,this.pendingClarificationContext&&this.choicePromptMode===`question`&&(this.pendingClarificationContext={...this.pendingClarificationContext,previousResponseId:e}),window.__BARKAN_DEBUG__={...window.__BARKAN_DEBUG__??{},lastOpenAIResponseId:e},this.persistCallState())}isSafeSameOriginNavigation(e,t){let n=Ro(e);if(!n||n.includes(`:`)||t.navigationContext?.navigationCount)return!1;try{return new URL(n,window.location.href).origin===window.location.origin}catch{return!1}}navigateAfterSpeech(e,t,n){let r=Ro(e);r&&(this.navigationContext={originalPrompt:t.historyTranscript??t.transcript,targetRoute:r,previousRoute:n,navigationCount:(t.navigationContext?.navigationCount??0)+1},this.persistCallState(),window.location.assign(new URL(r,window.location.href).toString()))}clearOpenAIAbortController(e){this.activeOpenAIAbortController===e&&(this.activeOpenAIAbortController=null)}armGuidanceClick(e,t,n){let r=e.guidanceContext?.step??0;if(r>=vn){this.cancelPendingGuidanceClick();return}let i=ca(t,n.elementId);if(!i||!G(t,n.elementId)){this.cancelPendingGuidanceClick();return}this.cancelPendingGuidanceClick();let a=e.sessionId,o=e.guidanceContext?.originalPrompt??e.historyTranscript??e.transcript,s=r+1,c=e.silentResponse===!0,l=()=>{let e=this.pendingGuidanceClick;if(!e||e.elementId!==n.elementId||!this.isCurrentSession(a))return;this.recordDebugEvent(`guidance-click`,n.elementId);let t=co(X()),r=performance.now(),u=io(t);i.removeEventListener(`click`,l,!0),e.cleanup=()=>void 0,u.catch(()=>void 0).then(()=>{this.pendingGuidanceClick!==e||!this.isCurrentSession(a)||(this.pendingGuidanceClick=null,this.recordDebugEvent(`guidance-dom-settled`,`${Math.round(performance.now()-r)}ms`),this.turnQueue.enqueue({sessionId:a,transcript:o,historyTranscript:o,scrollRetryCount:0,silentResponse:c,guidanceContext:{originalPrompt:o,step:s,previousElementId:n.elementId,previousElementLabel:n.label,previousInstruction:n.instruction}}))})},u=()=>i.removeEventListener(`click`,l,!0);i.addEventListener(`click`,l,{capture:!0,once:!0}),this.pendingGuidanceClick={sessionId:a,elementId:n.elementId,label:n.label,instruction:n.instruction,originalPrompt:o,step:s,silentResponse:c,cleanup:u},this.recordDebugEvent(`guidance-armed`,n.elementId)}cancelPendingGuidanceClick(){let e=this.pendingGuidanceClick;e&&(e.cleanup(),this.pendingGuidanceClick=null)}async retryTurnAfterScroll(e,t,n){return e.scrollRetryCount>=1||!await n()?!1:(t.then(e=>e?.close()).catch(()=>void 0),this.turnQueue.enqueue({sessionId:e.sessionId,transcript:e.transcript,historyTranscript:e.historyTranscript,scrollRetryCount:e.scrollRetryCount+1,navigationContext:e.navigationContext,guidanceContext:e.guidanceContext,silentResponse:e.silentResponse}),!0)}async fetchJson(e,t){let n=await fetch(`${this.apiBaseUrl}${e}`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify(t)});if(!n.ok)throw Error(`${e} failed ${n.status}: ${await n.text()}`);return await n.json()}prefetchRealtimeTokens(){this.prefetchSttToken(),this.prefetchTtsToken()}prefetchSttToken(){this.sttTokenPromise||(this.sttTokenPromise=this.fetchJson(`/api/widget/transcribe-realtime-token`,{siteKey:this.siteKey}).then(e=>e.token).catch(e=>{throw this.sttTokenPromise=null,e}),this.sttTokenPromise.catch(()=>void 0))}async consumeSttToken(){this.prefetchSttToken();let e=this.sttTokenPromise;return this.sttTokenPromise=null,e.finally(()=>this.prefetchSttToken()).catch(()=>void 0),e}prefetchTtsToken(){this.ttsTokenPromise||=this.fetchJson(`/api/widget/tts-websocket-token`,{siteKey:this.siteKey}).catch(e=>(console.warn(`[Barkan] tts token prefetch failed`,e),null))}async consumeTtsToken(){this.prefetchTtsToken();let e=this.ttsTokenPromise;return this.ttsTokenPromise=null,e.finally(()=>this.prefetchTtsToken()).catch(()=>void 0),e}async prepareTtsPlayer(){let e=await this.consumeTtsToken();this.activeTts?.close();let t=e?new On(e,this.consumePrimedAudioPlayback()):null;return this.activeTts=t,await t?.start(),this.activeTts===t?t:(t?.close(),null)}primeBrowserAudio(){this.primeAudioPlayback(),this.primeInputAudioContext()}primeAudioPlayback(){if(this.primedTtsAudio)return;let e=new Audio(yn);e.preload=`auto`,e.volume=0,e.setAttribute(`playsinline`,`true`),this.primedTtsAudio=e,e.play().then(()=>{this.primedTtsAudio===e&&(e.pause(),e.currentTime=0),e.volume=1,this.recordDebugEvent(`audio-playback-primed`)}).catch(e=>{this.recordDebugEvent(`audio-playback-prime-failed`,Q(e))})}consumePrimedAudioPlayback(){let e=this.primedTtsAudio;return this.primedTtsAudio=null,e&&(e.pause(),e.currentTime=0,e.volume=1),e??void 0}primeInputAudioContext(){if(!this.primedInputAudioContext)try{let e=new AudioContext;this.primedInputAudioContext=e,e.resume().then(()=>this.recordDebugEvent(`input-audio-context-primed`,e.state)).catch(e=>this.recordDebugEvent(`input-audio-context-prime-failed`,Q(e)))}catch(e){this.recordDebugEvent(`input-audio-context-prime-failed`,Q(e))}}consumePrimedInputAudioContext(){let e=this.primedInputAudioContext;return this.primedInputAudioContext=null,e?.state===`closed`?void 0:e??void 0}clearPrimedAudioResources(){this.primedTtsAudio?.pause(),this.primedTtsAudio=null,this.primedInputAudioContext?.close().catch(()=>void 0),this.primedInputAudioContext=null}async speakLocalGreeting(e){let t=Ao();this.currentAssistantSpeech=t,this.setState(`speaking`,t);let n=null;try{n=await this.prepareTtsPlayer()}catch(e){console.warn(`[Barkan] greeting tts setup failed`,e)}if(!this.isCurrentSession(e)||this.state!==`speaking`){n?.close(),this.activeTts===n&&(this.activeTts=null);return}n?(n.sendText(t,!0),await n.finishAndWaitForAudio()?await n.waitForPlaybackComplete():await this.playHttpTtsFallback(t)):await this.playHttpTtsFallback(t),this.isCurrentSession(e)&&this.state===`speaking`&&this.setState(this.isMuted?`muted`:`listening`,this.isMuted?`muted`:`listening`),this.rememberAssistantSpeech(t),this.currentAssistantSpeech=``,this.activeTts===n&&(this.activeTts=null)}async getMicrophoneStream(){return this.microphoneStream?.active?(this.microphoneStream.getAudioTracks().forEach(e=>{e.enabled=!0}),this.microphoneStream):(this.microphoneStream=await navigator.mediaDevices.getUserMedia(xt),this.microphoneStream)}stopMicrophoneStream(){this.activeMicrophoneStream?.getAudioTracks().forEach(e=>{e.stop()}),this.microphoneStream===this.activeMicrophoneStream&&(this.microphoneStream=null),this.activeMicrophoneStream=null}async playHttpTtsFallback(e){try{let t=await fetch(`${this.apiBaseUrl}/api/widget/tts`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({siteKey:this.siteKey,text:e})});if(!t.ok)throw Error(`/api/widget/tts failed ${t.status}: ${await t.text()}`);let n=await t.blob(),r=new Audio(URL.createObjectURL(n));this.activeHttpTts=r,await this.playInterruptibleAudioUntilEnded(r)}catch(e){console.warn(`[Barkan] tts fallback failed`,e)}finally{this.activeHttpTts=null,this.activeHttpTtsStopper=null}}playInterruptibleAudioUntilEnded(e){return new Promise((t,n)=>{let r=!1,i=t=>{r||(r=!0,e.removeEventListener(`ended`,a),e.removeEventListener(`error`,o),this.activeHttpTts===e&&(this.activeHttpTtsStopper=null),t())},a=()=>i(t),o=()=>i(()=>n(Error(`audio playback failed`)));this.activeHttpTtsStopper=()=>{e.pause(),i(t)},e.addEventListener(`ended`,a,{once:!0}),e.addEventListener(`error`,o,{once:!0}),e.play().catch(e=>i(()=>n(e)))})}async performScrollAction(e,t){let n=e.surfaceId===`page`?Gi():t.kind===`dom`?t.snapshot.scrollSurfaces.find(t=>t.id===e.surfaceId):null;if(!n||!Yi(n,e.direction))return!1;let r=n.kind===`page`?window:Ji(n.id);if(!r)return!1;let i=Math.max(120,Math.round(n.clientHeight*.72)),a=e.direction===`down`?i:-i;return r.scrollBy({top:a,behavior:`smooth`}),await po(r,e.direction),!0}async performScrollToElement(e,t){if(t.kind!==`dom`)return null;let n=qa(t.snapshot.elements,e),r=n?null:oa(t.snapshot,e);if(!n&&!r||n&&!Zi(n)||r&&(r.rect.width<1||r.rect.height<1))return null;let i=t.targetElements.get(e);if(!i||!i.isConnected||Qi(i))return null;let a=Xi(i),o=na(a),s=j(i);if(a){if(Qi(a))return null;let n=j(a);if(!ea(n)){let e=ta(n,0,window.innerHeight);if(Math.abs(e)>1){let t=j(i).top;window.scrollBy({top:e,behavior:`smooth`}),await mo(i,t),ra(o),n=j(a)}}if(!$i(a))return ra(o),null;let r=ta(j(i),n.top,n.height);if(Math.abs(r)>1){let e=j(i).top;a.scrollBy({top:r,behavior:`smooth`}),await mo(i,e)}return ra(o),G(t,e)}let c=ta(s,0,window.innerHeight);return Math.abs(c)>1&&(window.scrollBy({top:c,behavior:`smooth`}),await mo(i,s.top)),ra(o),G(t,e)}stopSpeakingAudio(){this.rememberAssistantSpeech(this.currentAssistantSpeech),this.currentAssistantSpeech=``,this.activeTts?.close(),this.activeTts=null,this.activeHttpTtsStopper?.(),this.activeHttpTtsStopper=null,this.activeHttpTts?.pause(),this.activeHttpTts=null}interruptCurrentSpeechForUserInput(){this.state===`speaking`&&(this.isSpeechInterruptedByUser=!0,this.stopSpeakingAudio(),this.activeOpenAIAbortController?.abort(),this.setState(`listening`,`listening`))}resetPerMessageContextForFreshUserInput(){this.cancelPendingGuidanceClick(),this.navigationContext=null,this.turnQueue.clear(),this.choicePromptMode===`question`&&this.clearActionChoices(),this.activeOpenAIAbortController&&(this.isSpeechInterruptedByUser=!0,this.activeOpenAIAbortController.abort()),this.stopSpeakingAudio(),this.currentAssistantSpeech=``,this.state===`speaking`&&this.setState(this.isMuted?`muted`:`listening`,this.isMuted?`muted`:`listening`),this.persistCallState()}interruptCurrentSpeechForPartialTranscript(e){if(this.state!==`speaking`||this.isMuted)return;let t=e.trim();!To(t)||this.isLikelySelfEchoTranscript(t)||this.isRecentlyHandledUserTranscript(t)||this.interruptCurrentSpeechForUserInput()}isLikelySelfEchoTranscript(e){return Eo(e,this.getRecentAssistantSpeechSamples())}getRecentAssistantSpeechSamples(){let e=performance.now();return this.recentAssistantSpeech=this.recentAssistantSpeech.filter(t=>t.expiresAt>e),[this.currentAssistantSpeech,...this.recentAssistantSpeech.map(e=>e.text)].filter(e=>e.trim().length>0)}rememberAssistantSpeech(e){let t=e.trim();if(!t)return;let n=performance.now();this.recentAssistantSpeech=[{text:t,expiresAt:n+12e3},...this.recentAssistantSpeech.filter(e=>e.expiresAt>n&&e.text!==t)].slice(0,8)}isRecentlyHandledUserTranscript(e){let t=Co(e);if(!t)return!1;let n=performance.now();return this.recentUserTranscripts=this.recentUserTranscripts.filter(e=>e.expiresAt>n),this.recentUserTranscripts.some(e=>wo(t,e.normalized))}rememberUserTranscript(e){let t=Co(e);if(!t)return;let n=performance.now();this.recentUserTranscripts=[{normalized:t,expiresAt:n+3e4},...this.recentUserTranscripts.filter(e=>e.expiresAt>n&&!wo(t,e.normalized))].slice(0,12)}buildTranscriberCallbacks(e){return{onCommittedTranscript:t=>this.handleCommittedTranscript(e,t),onPartialTranscript:e=>{window.__BARKAN_DEBUG__={...window.__BARKAN_DEBUG__??{},lastTranscript:e},this.interruptCurrentSpeechForPartialTranscript(e)},onAudioLevel:(e,t)=>{this.updateWaveformLevel(e,t)},onSessionClosed:()=>{this.handleTranscriberClosed(e)}}}handleTranscriberClosed(e){!this.isCurrentSession(e)||this.isMuted||(this.activeTranscriber=null,this.recoverMicrophonePipeline(`transcriber closed`))}startMicrophoneHealthMonitor(){this.microphoneHealthTimer===null&&(this.microphoneHealthTimer=window.setInterval(()=>{this.ensureMicrophoneCaptureHealthy()},2e3))}stopMicrophoneHealthMonitor(){this.microphoneHealthTimer!==null&&(window.clearInterval(this.microphoneHealthTimer),this.microphoneHealthTimer=null)}async ensureMicrophoneCaptureHealthy(){if(this.shouldCaptureMicrophone()){if(!this.hasLiveMicrophoneStream()){this.recoverMicrophonePipeline(`microphone stream ended`);return}this.activeTranscriber&&await this.activeTranscriber.ensureReadyForInput()||this.recoverMicrophonePipeline(this.activeTranscriber?`transcriber health check`:`missing transcriber`)}}toggleMute(){this.isCallActive&&(this.isMuted=!this.isMuted,!this.isMuted&&this.isTextModeActive&&this.setTextModeActive(!1),this.applyMicrophoneCaptureState(),(this.state===`listening`||this.state===`muted`)&&this.setState(this.isMuted?`muted`:`listening`,this.isMuted?`muted`:`listening`),this.updateTextModeUi(),this.persistCallState())}resumeMicrophoneCapture(){this.applyMicrophoneCaptureState()}applyMicrophoneCaptureState(){let e=this.shouldCaptureMicrophone();this.isMuted?this.releaseMicrophoneCapture():(this.activeTranscriber?.setInputEnabled(e),this.activeMicrophoneStream?.getAudioTracks().forEach(t=>{t.enabled=e})),e?this.activeTranscriber||this.recoverMicrophonePipeline(`missing transcriber`):this.updateWaveformLevel(0),this.callControl.dataset.muted=this.isMuted?`true`:`false`,this.micButton.setAttribute(`aria-label`,this.isMuted?`Unmute microphone`:`Mute microphone`),this.micButton.title=this.isMuted?`Unmute microphone`:`Mute microphone`}releaseMicrophoneCapture(){this.activeTranscriber?.stop(),this.activeTranscriber=null,this.stopMicrophoneStream()}shouldCaptureMicrophone(){return this.isCallActive&&!this.isMuted&&this.state!==`thinking`&&this.state!==`error`}async recoverMicrophonePipeline(e){return this.microphoneRecoveryPromise||=this.recoverMicrophonePipelineNow(e).finally(()=>{this.microphoneRecoveryPromise=null}),this.microphoneRecoveryPromise}async recoverMicrophonePipelineNow(e){if(!this.isCallActive||this.isMuted)return;let t=this.callSessionId;try{if(window.__BARKAN_DEBUG__={...window.__BARKAN_DEBUG__??{},lastMicRecovery:e},this.hasLiveMicrophoneStream()||await this.reacquireMicrophoneStream(t),!this.isCurrentSession(t)||this.isMuted){this.stopMicrophoneStream();return}await this.reconnectTranscriptionSession(t)}catch(e){this.activeTranscriber?.stop(),this.activeTranscriber=null,this.hasLiveMicrophoneStream()||this.stopMicrophoneStream(),console.warn(`[Barkan] microphone recovery failed`,e),this.showError(`microphone blocked`)}}async reacquireMicrophoneStream(e){this.stopMicrophoneStream();let t=await this.getMicrophoneStream();this.activeMicrophoneStream=t,this.watchMicrophoneTrackEnd(t,e)}async reconnectTranscriptionSession(e){let t=this.activeMicrophoneStream;if(!t||!this.hasLiveMicrophoneStream())throw Error(`microphone stream unavailable`);let n=await this.consumeSttToken();if(!this.isCurrentSession(e)||this.isMuted)return;this.activeTranscriber?.stop();let r=new Dn(n,t,this.buildTranscriberCallbacks(e));if(this.activeTranscriber=r,await r.start(),!this.isCurrentSession(e)||this.isMuted||this.activeTranscriber!==r){r.stop();return}this.applyMicrophoneCaptureState()}watchMicrophoneTrackEnd(e,t){e.getAudioTracks().forEach(n=>{n.addEventListener(`ended`,()=>{this.activeMicrophoneStream===e&&this.isCurrentSession(t)&&!this.isMuted&&this.recoverMicrophonePipeline(`microphone track ended`)},{once:!0})})}hasLiveMicrophoneStream(){return!!(this.activeMicrophoneStream?.active&&this.activeMicrophoneStream.getAudioTracks().some(e=>e.readyState===`live`))}isCurrentSession(e){return this.isCallActive&&this.callSessionId===e}setState(e,t){this.state=e,this.callControl.dataset.state=e,this.updateCallControlVisibility(),this.callControl.dataset.muted=this.isMuted?`true`:`false`,this.callStatus.textContent=t,this.recordStateChange(e,t),(e===`idle`||e===`thinking`||e===`speaking`||e===`error`)&&this.updateWaveformLevel(0),this.persistCallState()}updateCallControlVisibility(){let e=(this.isCallActive||this.state===`error`)&&!this.isTextModeActive;this.callControl.dataset.visible=e?`true`:`false`,this.updateLauncherVisibility()}showError(e){window.__BARKAN_DEBUG__={...window.__BARKAN_DEBUG__??{},lastError:e},this.setState(`error`,e),window.setTimeout(()=>{this.state===`error`&&(this.isCallActive?(this.setState(this.isMuted?`muted`:`listening`,this.isMuted?`muted`:`listening`),this.resumeMicrophoneCapture()):this.setState(`idle`,``))},1800)}recordStateChange(e,t){let n=[...window.__BARKAN_DEBUG__?.stateHistory??[],{state:e,message:t,isCallActive:this.isCallActive,at:Math.round(performance.now())}].slice(-20);window.__BARKAN_DEBUG__={...window.__BARKAN_DEBUG__??{},stateHistory:n}}recordDebugEvent(e,t){zo(e,t)}showAgentAtPoint(e,t,n){this.agentTarget={x:e,y:t},this.setAgentText(n),this.positionAgentAtTarget(),this.agent.dataset.visible=`true`,this.agent.setAttribute(`aria-hidden`,`false`),this.lastMousePosition&&this.updateAgentPointerHover(this.lastMousePosition.x,this.lastMousePosition.y)}hideAgent(){this.agentTarget=null,this.agent.dataset.visible=`false`,this.agent.setAttribute(`aria-hidden`,`true`),this.agentBubble.textContent=``,this.agentBubble.dataset.empty=`true`}setAgentText(e){let t=e.trim();this.agentBubble.textContent=t,this.agentBubble.dataset.empty=t?`false`:`true`,this.positionAgentAtTarget()}positionAgentAtTarget(){if(!this.agentTarget)return;this.agent.style.width=``,this.agent.style.height=``;let e=this.agentBubble.getBoundingClientRect(),t=this.getAgentAvailableViewport(),n=o({x:Math.min(Math.max(this.agentTarget.x,12),t.width-12),y:this.agentTarget.y},t,{width:e.width,height:e.height});this.agent.dataset.placement=n.placement,this.agent.style.width=`${n.width}px`,this.agent.style.height=`${n.height}px`,this.agent.style.transform=`translate3d(${n.x}px, ${n.y}px, 0)`,this.lastMousePosition&&this.updateAgentPointerHover(this.lastMousePosition.x,this.lastMousePosition.y)}getAgentAvailableViewport(){if(!this.isTextModeActive)return{width:window.innerWidth,height:window.innerHeight};let e=this.getChatSidebarReservedWidth();return{width:Math.max(320,window.innerWidth-e),height:window.innerHeight}}updateAgentPointerHover(e,t){if(this.agent.dataset.visible!==`true`)return;let n=this.agentPointer.getBoundingClientRect();e>=n.left&&e<=n.right&&t>=n.top&&t<=n.bottom&&this.dismissAgent()}dismissAgent(){this.agent.dataset.visible=`false`,this.agent.setAttribute(`aria-hidden`,`true`)}updateWaveformLevel(e,t){let n=Math.max(0,Math.min(1,e));!t&&Math.abs(n-this.lastWaveformLevel)<.025||(this.lastWaveformLevel=n,this.waveformTargetScales=this.waveformBars.map((e,r)=>{let i=St[r]??.7,a=t?.[r]??n;return P+Math.max(0,Math.min(1,a))*i}),this.ensureWaveformAnimation())}ensureWaveformAnimation(){if(this.waveformAnimationId!==null)return;let e=()=>{let t=!0;if(this.waveformBars.forEach((e,n)=>{let r=this.waveformCurrentScales[n]??P,i=this.waveformTargetScales[n]??P,a=r+(i-r)*.22;this.waveformCurrentScales[n]=a,e.style.transform=`scaleY(${a.toFixed(3)})`,Math.abs(a-i)>.006&&(t=!1)}),t){this.waveformCurrentScales=[...this.waveformTargetScales],this.waveformBars.forEach((e,t)=>{e.style.transform=`scaleY(${(this.waveformCurrentScales[t]??P).toFixed(3)})`}),this.waveformAnimationId=null;return}this.waveformAnimationId=window.requestAnimationFrame(e)};this.waveformAnimationId=window.requestAnimationFrame(e)}},Dn=class{token;stream;callbacks;primedAudioContext;socket=null;audioContext=null;processor=null;source=null;inputEnabled=!0;isStopped=!1;latestPartialTranscript=``;lastEmittedTranscript=``;lastVoiceActivityAt=0;fallbackCommitTimer=null;constructor(e,t,n,r){this.token=e,this.stream=t,this.callbacks=n,this.primedAudioContext=r}async start(){this.isStopped=!1,this.lastVoiceActivityAt=performance.now(),this.socket=new WebSocket(Mo(this.token)),this.socket.addEventListener(`message`,e=>this.handleMessage(e)),this.socket.addEventListener(`error`,e=>{console.warn(`[Barkan] realtime transcription socket error`,e)}),this.socket.addEventListener(`close`,e=>{this.cleanupAudioPipeline(),e.code!==1e3&&e.code!==1005&&console.warn(`[Barkan] realtime transcription socket closed`,{code:e.code,reason:e.reason}),this.isStopped||this.callbacks.onSessionClosed?.()}),await No(this.socket),this.audioContext=this.primedAudioContext&&this.primedAudioContext.state!==`closed`?this.primedAudioContext:new AudioContext,this.audioContext.state===`suspended`&&await this.audioContext.resume().catch(()=>void 0),this.source=this.audioContext.createMediaStreamSource(this.stream),this.processor=this.audioContext.createScriptProcessor(4096,1,1),this.processor.onaudioprocess=e=>{if(this.socket?.readyState!==WebSocket.OPEN||!this.audioContext||!this.inputEnabled){this.callbacks.onAudioLevel?.(0,[]);return}let t=e.inputBuffer.getChannelData(0),n=go(t),r=_o(t,9),i=performance.now()-this.lastVoiceActivityAt<Tt;n>Ct&&(this.lastVoiceActivityAt=performance.now()),this.callbacks.onAudioLevel?.(n,r);let a=vo(t,this.audioContext.sampleRate,F);this.socket.send(JSON.stringify({message_type:`input_audio_chunk`,audio_base_64:bo(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)),sample_rate:F})),this.maybeCommitPartialAfterSilence(),i&&n<=wt&&this.socket.send(JSON.stringify({message_type:`input_audio_chunk`,audio_base_64:xo(F,Ot),sample_rate:F}))},this.source.connect(this.processor),this.processor.connect(this.audioContext.destination)}setInputEnabled(e){this.inputEnabled=e}isReadyForInput(){return!this.isStopped&&this.inputEnabled&&this.socket?.readyState===WebSocket.OPEN&&this.audioContext?.state===`running`&&this.stream.active&&this.stream.getAudioTracks().some(e=>e.readyState===`live`&&e.enabled)}async ensureReadyForInput(){return this.isStopped||this.socket?.readyState!==WebSocket.OPEN||!this.stream.active||!this.stream.getAudioTracks().some(e=>e.readyState===`live`&&e.enabled)?!1:(this.audioContext?.state===`suspended`&&await this.audioContext.resume().catch(()=>void 0),this.isReadyForInput())}stop(){this.isStopped=!0,this.clearFallbackCommitTimer(),this.cleanupAudioPipeline(),this.socket?.close()}cleanupAudioPipeline(){this.clearFallbackCommitTimer(),this.processor?.disconnect(),this.source?.disconnect(),this.processor=null,this.source=null,this.audioContext?.close().catch(()=>void 0),this.audioContext=null}handleMessage(e){if(!this.isStopped)try{let t=JSON.parse(String(e.data));if(t.message_type?.includes(`error`)||t.error){console.warn(`[Barkan] realtime transcription error`,t);return}let n=t.text||t.transcript||``;if(!n.trim())return;t.message_type===`committed_transcript`||t.message_type===`committed_transcript_with_timestamps`?this.emitCommittedTranscript(n):(this.latestPartialTranscript=n,this.scheduleFallbackCommitCheck(),this.callbacks.onPartialTranscript?.(n))}catch{}}maybeCommitPartialAfterSilence(){this.isStopped||this.latestPartialTranscript.trim()&&(performance.now()-this.lastVoiceActivityAt<Et||(this.emitCommittedTranscript(this.latestPartialTranscript),this.socket?.readyState===WebSocket.OPEN&&this.socket.send(JSON.stringify({message_type:`input_audio_chunk`,audio_base_64:xo(F,kt),commit:!0,sample_rate:F}))))}scheduleFallbackCommitCheck(){this.fallbackCommitTimer===null&&(this.fallbackCommitTimer=window.setTimeout(()=>{this.fallbackCommitTimer=null,this.maybeCommitPartialAfterSilence(),this.latestPartialTranscript.trim()&&this.scheduleFallbackCommitCheck()},Dt))}emitCommittedTranscript(e){if(this.isStopped)return;let t=Co(e);!t||t===this.lastEmittedTranscript||(this.lastEmittedTranscript=t,this.latestPartialTranscript=``,this.clearFallbackCommitTimer(),this.callbacks.onCommittedTranscript(e))}clearFallbackCommitTimer(){this.fallbackCommitTimer!==null&&(window.clearTimeout(this.fallbackCommitTimer),this.fallbackCommitTimer=null)}},On=class{config;audio;socket=null;mediaSource=null;sourceBuffer=null;pendingAudioChunks=[];isMediaOpen=!1;hasReceivedAudio=!1;hasFinishedInput=!1;hasClosed=!1;playbackCompleted=!1;audioArrivalResolver=null;playbackResolver=null;constructor(e,t){this.config=e,this.audio=t??new Audio}async start(){this.mediaSource=new MediaSource,this.audio.src=URL.createObjectURL(this.mediaSource),this.audio.addEventListener(`ended`,()=>this.markPlaybackCompleted()),this.mediaSource.addEventListener(`sourceopen`,()=>{this.mediaSource&&(this.isMediaOpen=!0,this.sourceBuffer=this.mediaSource.addSourceBuffer(`audio/mpeg`),this.sourceBuffer.addEventListener(`updateend`,()=>this.flushAudioQueue()),this.flushAudioQueue())}),this.socket=new WebSocket(`wss://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.config.voiceId)}/stream-input?model_id=${encodeURIComponent(this.config.modelId)}&output_format=${encodeURIComponent(this.config.outputFormat)}&single_use_token=${encodeURIComponent(this.config.token)}&inactivity_timeout=60`),this.socket.addEventListener(`message`,e=>this.handleMessage(e)),this.socket.addEventListener(`error`,e=>{console.warn(`[Barkan] tts websocket error`,e)}),this.socket.addEventListener(`close`,e=>{this.hasClosed=!0,(!this.hasReceivedAudio||e.code!==1e3&&e.code!==1005)&&console.warn(`[Barkan] tts websocket closed`,{code:e.code,reason:e.reason,hasReceivedAudio:this.hasReceivedAudio}),this.audioArrivalResolver?.(this.hasReceivedAudio)}),await No(this.socket),this.socket.send(JSON.stringify({text:` `,voice_settings:{stability:.45,similarity_boost:.75},generation_config:{chunk_length_schedule:[80,120,160,220]}})),this.audio.play().then(()=>zo(`tts-audio-play-started`)).catch(e=>{console.warn(`[Barkan] tts audio playback blocked`,e),zo(`tts-audio-play-failed`,Q(e))})}sendText(e,t){!e.trim()||this.socket?.readyState!==WebSocket.OPEN||this.socket.send(JSON.stringify({text:e,flush:t}))}async finishAndWaitForAudio(){return this.hasFinishedInput=!0,this.socket?.readyState===WebSocket.OPEN&&this.socket.send(JSON.stringify({text:``})),this.hasReceivedAudio?!0:this.hasClosed?!1:new Promise(e=>{let t=window.setTimeout(()=>{this.audioArrivalResolver=null,e(this.hasReceivedAudio)},1400);this.audioArrivalResolver=n=>{window.clearTimeout(t),this.audioArrivalResolver=null,e(n)}})}close(){this.hasClosed=!0,this.playbackCompleted=!0,this.socket?.close(),this.audio.pause(),this.audioArrivalResolver?.(this.hasReceivedAudio),this.playbackResolver?.(),this.audioArrivalResolver=null,this.playbackResolver=null}handleMessage(e){try{let t=JSON.parse(String(e.data));t.audio&&(this.hasReceivedAudio=!0,this.audioArrivalResolver?.(!0),this.pendingAudioChunks.push(So(t.audio)),this.flushAudioQueue()),t.isFinal&&this.mediaSource?.readyState===`open`&&window.setTimeout(()=>{this.mediaSource?.readyState===`open`&&!this.sourceBuffer?.updating&&this.mediaSource.endOfStream()},250)}catch{}}flushAudioQueue(){if(!this.isMediaOpen||!this.sourceBuffer||this.sourceBuffer.updating)return;let e=this.pendingAudioChunks.shift();if(!e){if(this.hasFinishedInput&&this.hasReceivedAudio&&this.mediaSource?.readyState===`open`&&!this.sourceBuffer.updating)try{this.mediaSource.endOfStream()}catch{}return}let t=e.buffer.slice(e.byteOffset,e.byteOffset+e.byteLength);this.sourceBuffer.appendBuffer(t)}waitForPlaybackComplete(){return!this.hasReceivedAudio||this.playbackCompleted?Promise.resolve():new Promise(e=>{let t=window.setTimeout(()=>{this.playbackResolver=null,e()},12e3);this.playbackResolver=()=>{window.clearTimeout(t),this.playbackResolver=null,e()}})}markPlaybackCompleted(){this.playbackCompleted=!0,this.playbackResolver?.()}};async function kn(e,t=performance.now()){let n=performance.now();await Qa();let r=Math.round(performance.now()-n),i=An(e,t,{layoutSettleMs:r,staleRetryCount:0});for(let n=0;n<pn&&lo(i.snapshot);n++){await Z(fn);let a=performance.now();await Qa({retry:!0}),r+=Math.round(performance.now()-a)+fn,i=An(e,t,{layoutSettleMs:r,staleRetryCount:n+1})}return i}function An(e,t=performance.now(),n={}){let r=performance.now(),i=performance.now(),a=jn(),o=Math.round(performance.now()-i),s=new Map,c=new Map,l=performance.now(),u=Wi(s,a),d=Math.round(performance.now()-l),f=performance.now(),p=Vr(a.slice(0,Yt)),m=Math.round(performance.now()-f),h=performance.now(),g=lr(a,e,s,p,c),_=Math.round(performance.now()-h),v=Xr(p),y=X(),b=performance.now(),x=In(document.body,c,a),ee=Math.round(performance.now()-b),te=performance.now(),ne=Ir(y,a,g.uiFacts,v,g.elementToFactId),re=Math.round(performance.now()-te),S=Mn(e),ie=performance.now()-r>S,ae=performance.now(),C=ie?[]:Ar(a,g.pairs,e),w=Math.round(performance.now()-ae),T=ie||performance.now()-r>S,oe=performance.now(),E=T?[]:xr(a,g.elementToFactId),se=Math.round(performance.now()-oe),ce=T||performance.now()-r>S,le=performance.now(),ue=ce?[]:vr(a,g.pairs,g.elementToFactId),de=Math.round(performance.now()-le);return{kind:`dom`,snapshot:{captureVersion:It,route:y,viewportWidth:window.innerWidth,viewportHeight:window.innerHeight,title:document.title||void 0,elements:x,uiFacts:g.uiFacts,offscreenUiFacts:g.offscreenUiFacts,scrollSurfaces:u,...v.length>0?{activeSurfaces:v}:{},markers:Br(g.uiFacts,v),contentBlocks:C,forms:E,relationships:ue,pageMeta:ne},targetElements:c,debugTimings:{contextCaptureMs:Math.round(performance.now()-t),candidateCollectionMs:o,scrollSurfacesMs:d,activeSurfacesMs:m,uiFactsCreationMs:_,cleanDomTreeMs:ee,pageMetaMs:re,contentBlocksMs:w,formsMs:se,relationshipsMs:de,domSnapshotBuildMs:Math.round(performance.now()-r),optionalContextSkipped:+!!ie,layoutSettleMs:n.layoutSettleMs??0,staleRetryCount:n.staleRetryCount??0}}}function jn(){return nt(document.body,Jt,e=>W(e)||Fn(e))}function Mn(e){return Nn(e)?Zt:Xt}function Nn(e){return/\b(form|field|input|type|enter|fill|submit|select|choose|login|sign ?in|signup|sign ?up|password|email|checkout|billing|profile|settings?|modal|dialog|popup|save|edit|create|add)\b/i.test(e)}function Pn(e=[]){let t=[],n=new WeakSet,r=e=>{!M(e)||n.has(e)||W(e)||z(e)&&(n.add(e),t.push(e))};for(let t of e)r(t);for(let e of document.body?.querySelectorAll(Ht)??[])r(e);return t}function Fn(e){return[`SCRIPT`,`STYLE`,`META`,`LINK`,`NOSCRIPT`,`TEMPLATE`].includes(e.tagName)}function In(e,t,n=[]){let r={count:0,deadlineAt:performance.now()+Qt,targetElements:t,capturedElements:new WeakSet},i=Ln(e,r,0,!1),a=Math.max(0,Ut-i.length);R(r)||i.push(...zn(e,r,!1,a));let o=Math.max(0,Ut-i.length);return o>0&&i.push(...Bn(n,r,o)),i}function Ln(e,t,n,r){if(t.count>=I||R(t))return[];if(n>Wt)return Rn(e,t,r);let i=[];for(let a of O(e)){if(R(t))break;let e=Wn(a,t,n,r);if(e&&i.push(e),i.length>=Gt||t.count>=I)break}return i}function Rn(e,t,n){let r=[],i=[];for(let a of L(e,Jt)){if(r.length>=Kt||t.count>=I||R(t))break;if(i.some(e=>A(e,a))||!Vn(a))continue;let e=Wn(a,t,Wt,n);e&&(i.push(a),r.push(e))}return r}function zn(e,t,n,r){let i=[],a=Math.min(qt,r);for(let r of L(e,Jt)){if(i.length>=a||t.count>=I||R(t))break;if(t.capturedElements.has(r)||!Vn(r))continue;let e=Wn(r,t,Wt,n);e&&i.push(e)}return i}function Bn(e,t,n){let r=[],i=t.deadlineAt;t.deadlineAt=Math.max(t.deadlineAt,performance.now()+160);for(let i of Pn(e)){if(r.length>=n||t.count>=I)break;if(t.capturedElements.has(i)||!Hn(i)||!Un(i))continue;let e=Wn(i,t,Wt,!1);e&&r.push(e)}return t.deadlineAt=Math.max(i,t.deadlineAt),r}function*L(e,t){yield*rt(e,t,Fn)}function Vn(e){if(W(e)||Jn(e))return!1;let t=ar(j(e));return t!==`visible`&&t!==`partially_visible`?!1:z(e)||cr(e)}function Hn(e){return W(e)?!1:z(e)}function Un(e){let t=window.getComputedStyle(e);if(t.display===`none`||t.visibility===`hidden`||t.visibility===`collapse`||t.opacity===`0`||e.hidden||e.getAttribute(`aria-hidden`)===`true`||e.inert)return!1;let n=j(e);return n.width>=1&&n.height>=1&&n.right>=0&&n.left<=window.innerWidth}function Wn(e,t,n,r){if(t.count>=I||R(t))return null;let i=window.getComputedStyle(e);if(Gn(e,i))return null;let a=r||qn(e,i);if(a)return null;let o=Ln(e,t,n+1,a),s=j(e),c=e.tagName.toLowerCase(),l=e.getAttribute(`role`)||void 0,u=Na(e),d=$n(e,c,u),f=tr(e),p=sr(e),m=ar(s);if(!or(e,{label:u,text:d,attributes:f,interactive:p,tag:c,role:l})&&o.length===0)return null;let h=`c${t.count+1}`;return t.count++,t.targetElements.set(h,e),t.capturedElements.add(e),{id:h,tag:c,...l?{role:l}:{},...u?{label:u}:{},...d?{text:d}:{},...Object.keys(f).length>0?{attributes:f}:{},state:rr(e,a,r),rect:{x:Math.round(s.left),y:Math.round(s.top),width:Math.round(s.width),height:Math.round(s.height)},visibility:m,interactive:p,...o.length>0?{children:o}:{}}}function R(e){return performance.now()>e.deadlineAt}function Gn(e,t){if(W(e))return!0;let n=e.tagName.toLowerCase();return[`script`,`style`,`meta`,`link`,`noscript`,`template`,`path`,`circle`,`line`,`polyline`,`polygon`,`defs`,`clipPath`].includes(n)?!0:t.display===`none`?!Kn(e):t.visibility===`hidden`||t.opacity===`0`||e.hidden||e.getAttribute(`aria-hidden`)===`true`||e.inert?!Zn(e,0)&&!Qn(e,t):!1}function Kn(e){return W(e)?!1:Zn(e,0)}function qn(e,t){return t.display===`none`||t.visibility===`hidden`||t.visibility===`collapse`||t.opacity===`0`||t.contentVisibility===`hidden`||e.hidden||e.getAttribute(`aria-hidden`)===`true`||e.inert}function Jn(e){let t=e;for(;t;){let e=window.getComputedStyle(t);if(qn(t,e))return!0;t=k(t)}return!1}function Yn(e){return!W(e)&&!Jn(e)}function Xn(e){if(!Yn(e))return!1;let t=ar(j(e));return t===`visible`||t===`partially_visible`}function Zn(e,t){if(t>7)return!1;let n=e.tagName.toLowerCase(),r=e.getAttribute(`role`)?.toLowerCase()??``,i=[n,r,e.id,e.className,e.getAttribute(`name`),e.getAttribute(`type`),e.getAttribute(`placeholder`),e.getAttribute(`title`),e.getAttribute(`alt`),e.getAttribute(`aria-label`),e.getAttribute(`aria-controls`),e.getAttribute(`aria-haspopup`),e.getAttribute(`data-action`),e.getAttribute(`data-role`),e.getAttribute(`data-state`),e.getAttribute(`data-slot`),Pa(e),J(e,240)].filter(Boolean).join(` `).toLowerCase();return[`button`,`a`,`input`,`select`,`textarea`,`summary`,`option`,`dialog`].includes(n)||/button|link|menuitem|tab|checkbox|radio|switch|option|textbox|combobox|searchbox|dialog|alertdialog|menu/.test(r)||e.hasAttribute(`onclick`)||e.tabIndex>=0||/\b(menu|modal|dialog|popover|dropdown|panel|drawer|sheet|tooltip|options?|settings?|preferences?|edit|modify|action|actions?|move|reorder|sort|position|left|right|up|down|previous|next|delete|remove|share|help|save|submit|cancel|close)\b/.test(i)?!0:O(e).slice(0,40).some(e=>M(e)&&Zn(e,t+1))}function Qn(e,t){if(W(e))return!1;let n=j(e);if(n.width<1||n.height<1)return!1;if(e.hasAttribute(`onclick`)||e.onclick||t.cursor===`pointer`||e.tabIndex>=0)return!0;let r=[e.id,e.className,e.getAttribute(`src`),e.getAttribute(`alt`),e.getAttribute(`title`),e.getAttribute(`aria-label`),e.getAttribute(`data-action`),e.getAttribute(`data-role`)].filter(Boolean).join(` `).toLowerCase();return/\b(edit|settings?|share|help|delete|remove|add|create|plus|close|back|next|previous|menu|more|options?)\b|\/(?:edit|settings?|share|help|delete|add|plus|menu|more)[^/]*\.svg\b/.test(r)}function $n(e,t,n){if([`input`,`select`,`textarea`,`img`,`svg`].includes(t))return``;let r=Pa(e);if(r&&r!==n)return r;if([`p`,`li`,`dt`,`dd`,`figcaption`,`small`,`strong`,`em`,`span`,`h1`,`h2`,`h3`,`h4`,`h5`,`h6`].includes(t)){if(er(e)&&!cr(e))return``;let t=J(e,260);return t===n?``:t}return``}function er(e){let t=[`a`,`button`,`input`,`select`,`textarea`,`summary`,`[role='button']`,`[role='link']`,`[role='menuitem']`,`[role='tab']`,`[role='checkbox']`,`[role='radio']`,`[role='switch']`].join(`,`);return O(e).some(e=>M(e)&&(z(e)||e.querySelector(t)))}function tr(e){let t={},n=(e,n,r=180)=>{let i=H(n??``,r);i&&(t[e]=i)};n(`id`,e.id,80);let r=ki(e);r.length>0&&(t.class=r.join(` `));for(let t of[`name`,`type`,`placeholder`,`title`,`alt`,`aria-label`,`aria-current`,`aria-expanded`,`aria-controls`,`aria-haspopup`])n(t,e.getAttribute(t),160);e.hasAttribute(`draggable`)&&n(`draggable`,e.getAttribute(`draggable`),16),e.hasAttribute(`aria-grabbed`)&&n(`aria-grabbed`,e.getAttribute(`aria-grabbed`),16),e.hasAttribute(`dropzone`)&&n(`dropzone`,e.getAttribute(`dropzone`),80),wa(e)&&n(`href`,Ka(e),240),Oa(e)&&n(`src`,nr(e.getAttribute(`src`)),240),(Oa(e)||ja(e))&&n(`icon`,Va(e),80);let i=bi(e);i&&(t.testid=i);let a=Ai(e);for(let[e,t]of Object.entries(a))n(`data-${e}`,t,120);return t}function nr(e){if(!e)return``;try{let t=new URL(e,window.location.href);return`${t.pathname}${t.hash?t.hash:``}`.slice(0,240)}catch{return e.slice(0,240)}}function rr(e,t,n){let r=window.getComputedStyle(e);return{...mi(e)||e.getAttribute(`aria-disabled`)===`true`?{disabled:!0}:{},...hi(e)||e.getAttribute(`aria-selected`)===`true`?{selected:!0}:{},...e.getAttribute(`aria-expanded`)?{expanded:e.getAttribute(`aria-expanded`)===`true`}:{},...e.getAttribute(`aria-checked`)?{checked:ir(e.getAttribute(`aria-checked`))}:{},...gi(e)||e.getAttribute(`aria-required`)===`true`?{required:!0}:{},...document.activeElement===e?{focused:!0}:{},...t||qn(e,r)?{hidden:!0}:{},...n?{ancestorHidden:!0}:{}}}function ir(e){return e===`mixed`?`mixed`:e===`true`}function ar(e){return e.width<1||e.height<1||e.right<0||e.left>window.innerWidth?`outside`:Ui(e)}function or(e,t){return t.interactive||t.label||t.text||Object.keys(t.attributes).length>0||/button|link|menuitem|tab|checkbox|radio|switch|option|textbox|combobox|searchbox|dialog|alertdialog|navigation|main|banner|contentinfo/.test(t.role??``)?!0:`main.nav.header.footer.aside.section.article.form.dialog.button.a.label.img.svg.input.select.textarea.summary.ul.ol.li.table.thead.tbody.tr.th.td`.split(`.`).includes(t.tag)||/^h[1-6]$/.test(t.tag)}function sr(e){return z(e)?!0:window.getComputedStyle(e).cursor===`pointer`}function z(e){let t=e.tagName.toLowerCase(),n=e.getAttribute(`role`)?.toLowerCase()??``;return[`button`,`a`,`input`,`select`,`textarea`,`summary`,`option`].includes(t)||/button|link|menuitem|tab|checkbox|radio|switch|option|textbox|combobox|searchbox|slider|spinbutton/.test(n)||e.hasAttribute(`onclick`)||!!e.onclick||e.tabIndex>=0}function cr(e){let t=e.tagName.toLowerCase(),n=e.getAttribute(`role`)?.toLowerCase()??``;return/^h[1-6]$/.test(t)||n===`heading`}function lr(e,t,n,r,i){let a=new Map,o=[],s=[],c=new WeakSet,l=0;for(let i of e){if(W(i)||!li(i)||mr(i))continue;let e=j(i),c=Ui(e),u=c===`visible`||c===`partially_visible`;if(!u&&c!==`above`&&c!==`below`)continue;let d=fr(i,e,u,n,r,a);if(!d)continue;let f=Jr(i,r),p=u?ci(d,t,e,c):ya(d,t),m={element:i,baseElement:d,activeSurface:f,order:l,score:p};l++,u?o.push(m):(p>0||aa(d)||d.kind===`heading`)&&s.push(m)}let u=hr(o),d=gr(s),f=new WeakMap,p=[],m=0,h=e=>{if(c.has(e.element))return null;m++;let t={id:`u${m}`,...e.baseElement};return c.add(e.element),i.set(t.id,e.element),f.set(e.element,t.id),p.push({fact:t,element:e.element}),Yr(e.activeSurface,t.id,t.label),t},g=u.map(h).filter(e=>!!e),_=d.map(h).filter(e=>!!e),v=ur(e,t,n,r,a,c);for(let e of v){if(g.length>=zt&&_.length>=Bt)break;let t=e.baseElement.state.visible;if(t&&g.length>=zt||!t&&_.length>=Bt)continue;let n=h(e);n&&(t?g.push(n):_.length<Bt&&_.push(n))}return{uiFacts:g,offscreenUiFacts:_,pairs:p,elementToFactId:f}}function ur(e,t,n,r,i,a){let o=[],s=0;for(let c of Pn(e)){if(o.length>=Vt)break;if(a.has(c)||!Hn(c)||!Un(c))continue;let e=j(c),l=Ui(e),u=l===`visible`||l===`partially_visible`;if(!u&&l!==`above`&&l!==`below`)continue;let d=fr(c,e,u,n,r,i);if(!d||!dr(d))continue;let f=Jr(c,r),p=u?ci(d,t,e,l):ya(d,t);o.push({element:c,baseElement:d,activeSurface:f,order:s,score:p}),s++}return o.sort((e,t)=>{let n=+!!e.baseElement.state.visible,r=+!!t.baseElement.state.visible;return r===n?e.order-t.order:r-n})}function dr(e){return!!(e.label||e.text||e.href||e.metadata?.domId||e.metadata?.testId)}function fr(e,t,n,r,i,a){let o=fi(e),s=Na(e)||J(e,180)||Ba(e),c=J(e,o===`text`||o===`table`?320:180),l=_i(e);if(!s&&!c&&!l&&!aa({kind:o})&&o!==`heading`)return null;let u=Jr(e,i),d=u?.surface.id??qi(e,r),f=Li(e,a),p=Ka(e);return{kind:o,...e.getAttribute(`role`)?{role:e.getAttribute(`role`)??void 0}:{},label:Y(s||c||pr(e,o)).slice(0,180),...c&&c!==s?{text:c.slice(0,260)}:{},...p?{href:p}:{},...f?{context:f}:{},...l?{metadata:l}:{},state:pi(e,n),rect:zr(t),...d?{surface:{id:d,relation:u?.element===e?`self`:`descendant`}}:{}}}function pr(e,t){return Y([e.getAttribute(`aria-label`),e.getAttribute(`title`),e.getAttribute(`name`),e.getAttribute(`placeholder`),vi(e)].filter(Boolean).join(` `)||t)}function mr(e){return z(e)?!1:ui(e)}function hr(e){let t=e.filter(e=>Hn(e.element)).sort((e,t)=>e.order-t.order),n=new WeakSet(t.map(e=>e.element)),r=e.filter(e=>!n.has(e.element)).sort(_r);return[...t,...r].slice(0,zt)}function gr(e){return[...e].sort((e,t)=>_r(e,t)||Math.abs(e.baseElement.rect.y)-Math.abs(t.baseElement.rect.y)).slice(0,Bt)}function _r(e,t){if(t.score!==e.score)return t.score-e.score;let n=+!!aa(e.baseElement),r=+!!aa(t.baseElement);return r===n?e.order-t.order:r-n}function vr(e,t,n){let r=[],i=new Set,a=new Map;for(let t of e){if(!t.id)continue;let e=n.get(t);e&&a.set(t.id,e)}let o=e=>{let t=`${e.kind}:${e.from}:${e.to}`;i.has(t)||r.length>=160||(i.add(t),r.push(e))};for(let{fact:e,element:n}of t){let t=yr(n.getAttribute(`aria-describedby`),a);for(let n of t)o({kind:`described_by`,from:e.id,to:n});let r=yr(n.getAttribute(`aria-controls`),a);for(let t of r)o({kind:`controls`,from:e.id,to:t});let i=yr(n.getAttribute(`aria-owns`),a);for(let t of i)o({kind:`owns`,from:e.id,to:t})}for(let t of e.filter(br)){if(W(t))continue;let e=n.get(t),r=at(t,t.htmlFor);if(!e||!r)continue;let i=n.get(r);i&&o({kind:`label_for`,from:e,to:i,label:Y(t.textContent||``).slice(0,120)})}let s=e.filter(Da);for(let[e,t]of s.entries()){if(W(t))continue;let r=Er(t,e+1);for(let e of Array.from(t.elements)){if(!M(e))continue;let t=n.get(e);t&&o({kind:Or(e)?`form_submit`:`form_field`,from:r,to:t})}}return r}function yr(e,t){if(!e)return[];let n=[];for(let r of e.split(/\s+/)){let e=t.get(r);e&&n.push(e)}return n}function br(e){return e.tagName.toLowerCase()===`label`&&!!e.htmlFor}function xr(e,t){let n=[],r=e.filter(Da);for(let[e,i]of r.entries()){if(n.length>=12||W(i))continue;let r=j(i);if(r.width<8||r.height<8)continue;let a=[],o=[];for(let e of Array.from(i.elements)){if(!M(e))continue;let n=t.get(e);n&&(Or(e)?o.length<20&&o.push(n):a.length<80&&a.push(n))}a.length===0&&o.length===0||n.push({id:Er(i,e+1),label:Tr(i)||`form`,rect:zr(r),fieldIds:a,submitIds:o,validationMessages:Dr(i)})}return n.length>0?n:Sr(e,t)}function Sr(e,t){let n=e.filter(e=>t.has(e)).filter(e=>kr(e));if(n.length===0)return[];let r=new Map;for(let e of n){let t=Cr(e);t&&r.set(t,[...r.get(t)??[],e])}let i=[],a=0;for(let[e,n]of r.entries()){if(i.length>=12)break;let r=j(e);if(r.width<8||r.height<8||n.length<2)continue;a++;let o=[],s=[];for(let e of n){let n=t.get(e);n&&(Or(e)?s.push(n):o.push(n))}i.push({id:`form_implicit_${a}`,label:Tr(e)||`form group`,rect:zr(r),fieldIds:o.slice(0,80),submitIds:s.slice(0,20),validationMessages:Dr(e)})}return i}function Cr(e){let t=k(e),n=0;for(;t&&t!==document.body&&n<5;){if(wr(t)>=2)return t;t=k(t),n++}return null}function wr(e){let t=0;for(let n of L(e,80))if(!(n===e||W(n))&&kr(n)&&(t++,t>=4))break;return t}function Tr(e){return Y(e.getAttribute(`aria-label`)||U(e,e.getAttribute(`aria-labelledby`))||zi(e)||e.getAttribute(`name`)||``).slice(0,180)}function Er(e,t=1){let n=H(e.id,40);return n&&Mi(n)?`form_${n}`:`form_${Math.max(1,t)}`}function Dr(e){return B(Array.from(L(e,160)).filter(e=>e.matches(`[role='alert'],[aria-live],[data-error],[data-validation],.error,.field-error,.form-error`)).filter(e=>!W(e)).map(e=>Y(e.textContent||``).slice(0,180)),8)}function Or(e){return Ta(e)||K(e)&&[`submit`,`button`,`reset`].includes(e.type.toLowerCase())||e.getAttribute(`role`)?.toLowerCase()===`button`}function kr(e){let t=e.getAttribute(`role`)?.toLowerCase()??``;return K(e)||q(e)||Aa(e)||Ta(e)||/textbox|checkbox|radio|switch|combobox|searchbox|slider|spinbutton|button/.test(t)}function Ar(e,t,n){let r=[],i=new Set,a=t.map(e=>({fact:e.fact,rect:j(e.element)}));for(let t of e){if(r.length>=60||W(t)||!jr(t))continue;let e=j(t),o=Ui(e);if(o!==`visible`&&o!==`partially_visible`||e.width<40||e.height<16)continue;let s=Mr(t);if(s.length<30)continue;let c=Sa(s.slice(0,180));if(!c||i.has(c))continue;i.add(c);let l=a.filter(({rect:t})=>Fr(t,e)).map(({fact:e})=>e.id).slice(0,20),u=Pr(t)||zi(t)||void 0,d=Nr(t,s,u,l,n);d<=0||r.push({id:`block_${r.length+1}`,...u?{heading:u.slice(0,180)}:{},text:s.slice(0,700),rect:zr(e),nearbyFactIds:l,score:d,area:e.width*e.height})}return r.sort((e,t)=>t.score===e.score?e.rect.y-t.rect.y||e.area-t.area:t.score-e.score).slice(0,20).map(({score:e,area:t,...n})=>n)}function jr(e){let t=e.tagName.toLowerCase(),n=e.getAttribute(`role`)?.toLowerCase()??``;return[`button`,`a`,`input`,`select`,`textarea`,`script`,`style`,`svg`,`path`].includes(t)||/button|link|textbox|checkbox|radio|switch|combobox|searchbox|slider|spinbutton/.test(n)?!1:[`main`,`section`,`article`,`aside`,`li`,`p`,`td`,`th`,`blockquote`,`figcaption`].includes(t)||/region|article|cell|row|listitem|status|note/.test(n)||e.hasAttribute(`data-description`)||e.hasAttribute(`data-summary`)}function Mr(e){return Y(e.getAttribute(`data-description`)||e.getAttribute(`data-summary`)||e.textContent||``).slice(0,900)}function Nr(e,t,n,r,i){let a=[t,n,e.getAttribute(`aria-label`),e.getAttribute(`role`)].filter(Boolean).join(` `).toLowerCase(),o=ba(i),s=r.length>0?3:1;for(let e of o)a.includes(e)&&(s+=4);let c=e.tagName.toLowerCase();return[`article`,`section`,`main`].includes(c)&&(s+=3),n&&(s+=2),t.length>80&&(s+=2),s}function Pr(e){let t=e.previousElementSibling,n=0;for(;M(t)&&n<4;){if(/^h[1-6]$/i.test(t.tagName)||t.getAttribute(`role`)?.toLowerCase()===`heading`)return Y(t.textContent||``);t=t.previousElementSibling,n++}return``}function Fr(e,t){return e.bottom>=t.top-8&&e.top<=t.bottom+8&&e.right>=t.left-8&&e.left<=t.right+8}function Ir(e,t,n,r,i){let a=M(document.activeElement)?document.activeElement:null;return{...document.title?{title:Y(document.title).slice(0,180)}:{},route:e,headings:Lr(t),landmarks:Rr(t),selectedNav:B(n.filter(e=>e.state.selected||e.metadata?.aria?.current).map(e=>e.label),16),...r.find(e=>/dialog|alertdialog/i.test(e.role??``)||e.stacking.hasBackdrop)?.label?{activeDialog:r.find(e=>/dialog|alertdialog/i.test(e.role??``)||e.stacking.hasBackdrop)?.label}:{},...a&&i.get(a)?{focusedFactId:i.get(a)}:{}}}function Lr(e){return B(e.filter(e=>e.matches(`h1,h2,h3,h4,h5,h6,[role='heading']`)).filter(Xn).map(e=>e.textContent||``),24)}function Rr(e){return B(e.filter(e=>e.matches(`header,nav,main,footer,aside,form,[role='banner'],[role='navigation'],[role='main'],[role='contentinfo'],[role='complementary'],[role='search'],[role='form'],[role='region']`)).filter(Yn).map(e=>{let t=e.getAttribute(`role`)||e.tagName.toLowerCase(),n=Zr(e);return Y(n?`${t}: ${n}`:t)}),24)}function zr(e){return{x:Math.round(e.left),y:Math.round(e.top),width:Math.round(e.width),height:Math.round(e.height)}}function Br(e,t){return{selectedLabels:B(e.filter(e=>e.state.selected).map(e=>e.label),16),visibleHeadings:B(e.filter(e=>e.kind===`heading`).map(e=>e.label),16),primaryActions:B(e.filter(e=>[`button`,`link`,`input`,`menu`].includes(e.kind)&&!e.state.disabled).sort((e,t)=>e.rect.y-t.rect.y||e.rect.x-t.rect.x).map(e=>e.label),20),collectionHints:B(e.filter(e=>e.kind===`table`||/\b(card|row|list|grid|table|collection|folder|file)\b/i.test(e.context??``)).flatMap(e=>[e.context,e.label]).filter(e=>!!e),16),activeSurfaceLabels:B(t.flatMap(e=>[e.label,...e.sampleLabels]).filter(e=>!!e),16),transientLabels:B([...e.filter(e=>e.kind===`modal`||e.kind===`menu`).map(e=>e.label),...t.filter(e=>e.stacking.hasBackdrop||e.stacking.zIndex!==null||e.stacking.containsFocus).flatMap(e=>[e.label,...e.sampleLabels]).filter(e=>!!e)],16)}}function B(e,t){let n=[],r=new Set;for(let i of e){let e=Y(i),a=e.toLowerCase();if(!(!e||r.has(a))&&(r.add(a),n.push(e),n.length>=t))break}return n}function Vr(e){let t=[];for(let n of e){if(W(n))continue;let e=window.getComputedStyle(n),r=j(n);if(!Hr(r,e))continue;let i=Ur(n,r,e);i<=0||t.push({element:n,score:i,area:r.width*r.height,style:e})}return Wr(t).map((e,t)=>{let n=j(e.element),r=Zr(e.element);return{element:e.element,score:e.score,area:e.area,surface:{id:`surface_${t+1}`,...r?{label:r}:{},role:e.element.getAttribute(`role`)||void 0,tagName:e.element.tagName.toLowerCase(),rect:{x:Math.round(n.left),y:Math.round(n.top),width:Math.round(n.width),height:Math.round(n.height)},layout:Qr(n),stacking:ti(e.element,e.style),factIds:[],sampleLabels:[]}}})}function Hr(e,t){return t.display===`none`||t.visibility===`hidden`||t.opacity===`0`||t.pointerEvents===`none`||e.width<48||e.height<32?!1:e.bottom>0&&e.right>0&&e.top<window.innerHeight&&e.left<window.innerWidth}function Ur(e,t,n){if([`HTML`,`BODY`,`SCRIPT`,`STYLE`,`META`,`LINK`,`NOSCRIPT`,`SVG`,`PATH`].includes(e.tagName))return 0;let r=e.getAttribute(`role`)?.toLowerCase()??``,i=e.tagName.toLowerCase(),a=oi(t),o=!!(e.getAttribute(`aria-label`)||e.getAttribute(`aria-labelledby`)||e.getAttribute(`title`)),s=n.position.toLowerCase(),c=ni(e),l=0;if(ri(e,r)&&(l+=14),/dialog|alertdialog|menu|listbox|tooltip|tree|grid|tabpanel/.test(r)&&(l+=8),/navigation|main|banner|contentinfo|complementary|region|search|form/.test(r)&&(l+=5),[`dialog`,`aside`,`nav`,`header`,`footer`,`main`,`form`].includes(i)&&(l+=5),s===`fixed`||s===`sticky`?l+=7:s===`absolute`&&(l+=3),c&&(l+=5),o&&(l+=3),a>.92&&!ri(e,r)&&(l-=6),l<=0&&!c)return 0;let u=Kr(e);return u>=4?l+=3:u>=2&&(l+=1),a>=.03&&a<=.85&&(l+=2),u>0||c||ri(e,r)?l:0}function Wr(e){let t=[...e].sort((e,t)=>{if(t.score!==e.score)return t.score-e.score;let n=ai(t.style.zIndex)??0,r=ai(e.style.zIndex)??0;return n===r?e.area-t.area:n-r}),n=[];for(let e of t)if(!n.some(t=>Gr(e.element,t.element))&&(n.push(e),n.length>=12))break;return n}function Gr(e,t){if(e===t)return!0;let n=j(e),r=j(t);return Math.abs(n.left-r.left)<4&&Math.abs(n.top-r.top)<4&&Math.abs(n.width-r.width)<8&&Math.abs(n.height-r.height)<8?!0:A(t,e)&&oi(n)<=oi(r)*.92}function Kr(e){let t=0,n=O(e),r=0;for(;n.length>0&&r<48;){let i=n.shift();if(r++,!(i===e||W(i))){if(qr(i)&&li(i)&&t++,t>=8)break;r<48&&n.push(...O(i).slice(0,8))}}return t}function qr(e){let t=e.tagName.toLowerCase(),n=e.getAttribute(`role`)?.toLowerCase()??``;return[`button`,`a`,`input`,`select`,`textarea`,`summary`,`label`,`th`,`td`].includes(t)||/^h[1-6]$/.test(t)||/button|link|menuitem|tab|checkbox|radio|switch|option|cell|row|heading|textbox|combobox|searchbox/i.test(n)||e.hasAttribute(`onclick`)||e.tabIndex>=0}function Jr(e,t){return t.filter(t=>A(t.element,e)).sort((e,t)=>t.score===e.score?e.area-t.area:t.score-e.score)[0]??null}function Yr(e,t,n){e&&(e.surface.factIds.length<80&&e.surface.factIds.push(t),e.surface.sampleLabels.length<12&&!e.surface.sampleLabels.includes(n)&&e.surface.sampleLabels.push(n))}function Xr(e){return e.filter(e=>e.surface.factIds.length>0||e.surface.stacking.containsFocus).map(e=>e.surface)}function Zr(e){let t=e.getAttribute(`aria-label`),n=U(e,e.getAttribute(`aria-labelledby`)),r=zi(e),i=e.getAttribute(`title`);return Y(t||n||r||i||``)}function Qr(e){let t=si(e.width/Math.max(1,window.innerWidth)),n=si(e.height/Math.max(1,window.innerHeight));return{horizontalBand:$r(e),verticalBand:ei(e),widthRatio:t,heightRatio:n,viewportAreaRatio:si(oi(e))}}function $r(e){let t=Math.max(1,window.innerWidth);if(e.width/t>=.82)return`full`;let n=e.left/t,r=e.right/t,i=(e.left+e.right)/2/t;return n<=.12&&r>=.5||r>=.88&&n<=.5?`spans`:i<.38?`left`:i>.62?`right`:`center`}function ei(e){let t=Math.max(1,window.innerHeight);if(e.height/t>=.82)return`full`;let n=e.top/t,r=e.bottom/t,i=(e.top+e.bottom)/2/t;return n<=.12&&r>=.5||r>=.88&&n<=.5?`spans`:i<.38?`top`:i>.62?`bottom`:`middle`}function ti(e,t){return{cssPosition:t.position||`static`,zIndex:ai(t.zIndex),hasBackdrop:ri(e,e.getAttribute(`role`)?.toLowerCase()??``),containsFocus:ni(e),pointerEvents:t.pointerEvents||`auto`}}function ni(e){let t=e.ownerDocument.activeElement;return M(t)&&A(e,t)}function ri(e,t){let n=e.getAttribute(`aria-modal`)?.toLowerCase()===`true`,r=Ea(e)&&e.open;return n||r||t===`dialog`||t===`alertdialog`||ii(e)}function ii(e){try{return e.matches(`:popover-open`)}catch{return!1}}function ai(e){let t=Number.parseInt(e,10);return Number.isFinite(t)?t:null}function oi(e){return e.width*e.height/Math.max(1,window.innerWidth*window.innerHeight)}function si(e){return Math.round(Math.max(0,Math.min(1,e))*1e3)/1e3}function ci(e,t,n,r){let i=ya(e,t);aa(e)?i+=42:e.kind===`heading`?i+=24:e.kind===`table`?i+=18:e.kind===`text`&&(i+=8),r===`visible`&&(i+=8),e.state.disabled&&(i-=18),(e.state.selected||e.metadata?.aria?.current)&&(i+=10),oi(n)>.35&&e.kind===`text`&&(i-=16);let a=n.top/Math.max(1,window.innerHeight);return a>=0&&a<=.9&&(i+=Math.round((1-a)*4)),i}function li(e){let t=window.getComputedStyle(e);if(t.display===`none`||t.visibility===`hidden`||t.opacity===`0`)return!1;let n=j(e);if([`SCRIPT`,`STYLE`,`META`,`LINK`,`NOSCRIPT`,`SVG`,`PATH`].includes(e.tagName))return!1;if(z(e))return n.width>=1&&n.height>=1;if(t.pointerEvents===`none`||n.width<8||n.height<8)return!1;let r=e.tagName.toLowerCase(),i=e.getAttribute(`role`),a=[`button`,`a`,`input`,`select`,`textarea`,`summary`,`label`,`th`,`td`].includes(r)||/^h[1-6]$/.test(r),o=!!(i&&/button|link|menuitem|tab|checkbox|radio|switch|option|cell|row|heading|textbox|combobox|searchbox/i.test(i)),s=!!(e.onclick||e.tabIndex>=0),c=di(e);return a||o||s||c}function ui(e){let t=k(e),n=0;for(;t&&t!==document.body&&n<8;){if(t.matches(`button,a,summary,[role='button'],[role='link'],[role='menuitem'],[role='tab'],[role='option']`))return!0;t=k(t),n++}return!1}function di(e){let t=e.tagName.toLowerCase(),n=e.getAttribute(`role`)?.toLowerCase()??``;if(/button|link|textbox|checkbox|radio|switch|combobox|searchbox|slider|spinbutton|menuitem|tab|option/.test(n))return!1;let r=O(e).length;if([`div`,`span`].includes(t)&&r>1)return!1;let i=J(e,240);return i.length<2||i.length>220?!1:[`p`,`li`,`dt`,`dd`,`figcaption`,`small`,`strong`,`em`,`span`,`div`].includes(t)?r<=2:!1}function fi(e){let t=e.tagName.toLowerCase(),n=e.getAttribute(`role`)?.toLowerCase()??``,r=K(e)?e.type.toLowerCase():``;return n===`dialog`||n===`alertdialog`||t===`dialog`?`modal`:/menu|menuitem|listbox|option/.test(n)?`menu`:/^h[1-6]$/.test(t)||n===`heading`?`heading`:[`table`,`tr`,`th`,`td`].includes(t)||/table|row|cell|grid/.test(n)?`table`:t===`a`||n===`link`?`link`:t===`button`||r===`button`||r===`submit`||n===`button`?`button`:[`input`,`select`,`textarea`].includes(t)||/textbox|checkbox|radio|switch|combobox|searchbox|slider|spinbutton|tab/.test(n)?`input`:`text`}function pi(e,t){let n=e.getAttribute(`aria-disabled`)?.toLowerCase()===`true`,r=e.getAttribute(`aria-selected`)?.toLowerCase()===`true`,i=e.getAttribute(`aria-expanded`)?.toLowerCase()===`true`,a=e.getAttribute(`aria-required`)?.toLowerCase()===`true`;return{visible:t,disabled:n||mi(e),selected:r||hi(e),expanded:i,required:a||gi(e)}}function mi(e){return(Ta(e)||K(e)||q(e)||Aa(e))&&e.disabled}function hi(e){return K(e)&&e.checked||ka(e)&&e.selected}function gi(e){return(K(e)||q(e)||Aa(e))&&e.required}function _i(e){let t={tagName:e.tagName.toLowerCase()},n=H(e.id,80);n&&Mi(n)&&(t.domId=n);let r=V(e,`name`,80);r&&(t.name=r);let i=vi(e);i&&(t.type=i);let a=yi(e);a&&(t.value=a);let o=bi(e);o&&(t.testId=o);let s=Va(e);s&&(t.iconName=s);let c=ki(e);c.length>0&&(t.classTokens=c);let l=Ai(e);Object.keys(l).length>0&&(t.data=l);let u=xi(e);Object.keys(u).length>0&&(t.aria=u);let d=Si(e);return d&&(t.container=d),Object.keys(t).length>1?t:void 0}function vi(e){return K(e)||Ta(e)||q(e)||Aa(e)?H(e.getAttribute(`type`)||e.tagName.toLowerCase(),40):V(e,`type`,40)}function yi(e){if(!Pi([e.getAttribute(`name`),e.id,e.getAttribute(`aria-label`),U(e,e.getAttribute(`aria-labelledby`)),Na(e)].join(` `))){if(q(e))return H(Y(Array.from(e.selectedOptions).map(e=>e.label||e.textContent||e.value).join(` `)),100);if(K(e)&&[`checkbox`,`radio`].includes(e.type.toLowerCase())&&e.checked)return H(e.value,80)}}function bi(e){for(let t of[`data-testid`,`data-test-id`,`data-cy`,`data-qa`]){let n=V(e,t,100);if(n)return n}}function xi(e){let t={},n=V(e,`aria-controls`,120),r=V(e,`aria-describedby`,120),i=V(e,`aria-current`,40),a=V(e,`aria-haspopup`,40),o=V(e,`aria-live`,40);n&&(t.controls=n),r&&(t.describedBy=r),i&&(t.current=i),a&&(t.hasPopup=a),o&&(t.live=o);let s=Di(e.getAttribute(`aria-pressed`));s!==void 0&&(t.pressed=s);let c=Oi(e.getAttribute(`aria-checked`));c!==void 0&&(t.checked=c);let l=Di(e.getAttribute(`aria-invalid`));return l!==void 0&&(t.invalid=l),t}function Si(e){let t=k(e),n=0;for(;t&&t!==document.body&&n<7;){if(W(t))return;let r=Ci(t);if(r){let n=wi(t,e),i=V(t,`role`,60),a=Ei(t,r);return{kind:r,...n?{label:n}:{},...i?{role:i}:{},...a?{index:a}:{}}}t=k(t),n++}}function Ci(e){let t=e.tagName.toLowerCase(),n=e.getAttribute(`role`)?.toLowerCase()??``,r=`${n} ${Array.from(e.classList).slice(0,12).join(` `).toLowerCase()} ${[e.getAttribute(`data-component`),e.getAttribute(`data-role`),e.getAttribute(`data-kind`),e.getAttribute(`data-type`),e.getAttribute(`data-item`),e.getAttribute(`data-testid`)].filter(Boolean).join(` `).toLowerCase()}`;return t===`tr`||n===`row`||/\b(table-row|data-row|list-row|row-item)\b/.test(r)?`row`:t===`li`||n===`listitem`||/\b(list-item|listitem|menu-item)\b/.test(r)?`listitem`:t===`article`||/\b(card|tile|panel-card|result-card|product-card|repo-card|issue-card)\b/.test(r)?`card`:t===`form`||n===`form`?`form`:t===`section`||n===`region`?`section`:n===`group`||/\b(group|item|record|entity|resource)\b/.test(r)?`group`:null}function wi(e,t){let n=Y(e.getAttribute(`aria-label`)||U(e,e.getAttribute(`aria-labelledby`))||e.getAttribute(`data-name`)||e.getAttribute(`data-title`)||e.getAttribute(`title`)||``);if(n)return n.slice(0,180);for(let n of[`h1,h2,h3,h4,h5,h6,[role='heading']`,`[data-title],[data-name],[data-label]`,`a[href]`,`strong,b`,`th`,`[role='cell'],td`,`p,span`]){let r=Ti(e,t,n);if(r)return r}return``}function Ti(e,t,n){let r=0;for(let i of L(e,120)){if(!i.matches(n))continue;if(r++,r>24)break;if(i===t||A(t,i)||W(i)||!i.isConnected||!A(e,i))continue;let a=Y(i.getAttribute(`data-title`)||i.getAttribute(`data-name`)||i.getAttribute(`data-label`)||i.getAttribute(`aria-label`)||i.getAttribute(`title`)||i.textContent||``);if(a.length>=2&&a.length<=180)return a}return``}function Ei(e,t){let n=1,r=e.previousElementSibling;for(;M(r)&&n<500;)Ci(r)===t&&n++,r=r.previousElementSibling;return n>1?n:void 0}function Di(e){if(e?.toLowerCase()===`true`)return!0;if(e?.toLowerCase()===`false`)return!1}function Oi(e){return e?.toLowerCase()===`mixed`?`mixed`:Di(e)}function ki(e){let t=[];for(let n of Array.from(e.classList)){let e=H(n,40);if(!(!e||!Fi(e)||t.includes(e))&&(t.push(e),t.length>=6))break}return t}function Ai(e){let t={};for(let n of Array.from(e.attributes)){if(!n.name.startsWith(`data-`))continue;let e=n.name.slice(5);if(!ji(e)||Object.keys(t).length>=10)continue;let r=H(n.value,120);!r||!Ni(r)||(t[e]=r)}return t}function V(e,t,n){let r=H(e.getAttribute(t),n);return r&&Ni(r)?r:void 0}function H(e,t){let n=Y(e??``);if(n)return n.slice(0,t)}function ji(e){let t=e.toLowerCase();return Pi(t)?!1:/^(testid|test-id|cy|qa|action|route|state|component|entity|id|item-id|itemid|key|name|status|kind|type|view|screen|role|target|mode|variant|index|slug)$/i.test(t)||/^(app|ui|barkan|route|nav|page|panel|modal|tab|menu|item)-/.test(t)}function Mi(e){return!(!Ni(e)||Pi(e)||/^[a-f0-9]{12,}$/i.test(e)||/\d{8,}/.test(e))}function Ni(e){return!(e.length>140||Pi(e)||/^[\[{]/.test(e)||/bearer\s+|eyJ[a-zA-Z0-9_-]{12,}|sk-[a-zA-Z0-9_-]+/i.test(e)||/[^\s:@/]{80,}/.test(e))}function Pi(e){let t=e.replace(/[_\-\s]+/g,``).toLowerCase();return/(token|secret|password|passwd|passcode|auth|session|cookie|csrf|jwt|email|phone|address|creditcard|cardnumber|ccnumber|iban|ssn|socialsecurity|privatekey|signature)/.test(t)}function Fi(e){return!(e.length<3||e.length>40||Pi(e)||/[:\[\]/]/.test(e)||/^(css|sc)-[a-z0-9]+$/i.test(e)||/^[a-z0-9_-]*\d[a-z0-9_-]*\d[a-z0-9_-]*\d/i.test(e)||/^(flex|grid|block|inline|hidden|relative|absolute|fixed|sticky|static|overflow|items|justify|content|self|place|gap|p[trblxy]?|m[trblxy]?|w|h|min|max|text|font|leading|tracking|bg|border|rounded|shadow|ring|opacity|z|top|right|bottom|left|translate|scale|rotate|duration|ease|transition|container)(-|$)/i.test(e))}function Ii(e){return e?[e.tagName,e.domId,e.name,e.type,e.value,e.testId,e.iconName,e.container?.kind,e.container?.label,e.container?.role,e.container?.index?String(e.container.index):void 0,...e.classTokens??[],...Object.entries(e.data??{}).flatMap(([e,t])=>[e,t]),...Object.entries(e.aria??{}).flatMap(([e,t])=>[e,String(t)])].filter(Boolean).join(` `):``}function Li(e,t){let n=k(e),r=0,i=[];for(;n&&n!==document.body&&r<7;){let a=t.get(n);if(a!==void 0)return a;i.push(n);let o=Y(n.getAttribute(`aria-label`)||U(n,n.getAttribute(`aria-labelledby`))||``),s=Ri(e,n),c=zi(n);if(o||s||c){let e=B([o,s,c,c?Hi(n,c):``].filter(Boolean),4).join(` `).slice(0,240);return i.forEach(n=>t.set(n,e)),e}n=k(n),r++}return i.forEach(e=>t.set(e,``)),``}function Ri(e,t){let n=e,r=k(t),i=0;for(;n&&n!==r&&n!==document.body&&i<6;){let e=n.previousElementSibling,t=0;for(;M(e)&&t<10;){let n=Vi(e)||Bi(e);if(n)return n;e=e.previousElementSibling,t++}n=k(n),i++}return``}function zi(e){let t=Array.from(L(e,120)).find(e=>!!Vi(e));return t?Vi(t):``}function Bi(e){let t=Array.from(L(e,160)).filter(e=>!!Vi(e));for(let e of t.reverse()){let t=Vi(e);if(t)return t}return``}function Vi(e){return!/^h[1-6]$/i.test(e.tagName)&&e.getAttribute(`role`)?.toLowerCase()!==`heading`?``:Y(e.textContent||``)}function Hi(e,t){let n=Array.from(L(e,120)).filter(e=>e.matches(`p,[data-description]`));for(let e of n){let n=Y(e.textContent||``);if(n&&n!==t)return n.slice(0,140)}return``}function U(e,t){return t?t.split(/\s+/).map(t=>at(e,t)?.textContent??``).join(` `):``}function Ui(e){return e.bottom>0&&e.right>0&&e.top<window.innerHeight&&e.left<window.innerWidth?e.top>=0&&e.left>=0&&e.bottom<=window.innerHeight&&e.right<=window.innerWidth?`visible`:`partially_visible`:e.bottom<=0?`above`:`below`}function Wi(e,t){let n=[Gi()],r=0;for(let i of t){if(W(i)||!Ki(i))continue;r++;let t=`s${r}`;e.set(i,t);let a=j(i);if(n.push({id:t,kind:`container`,label:Na(i)||i.getAttribute(`aria-label`)||i.tagName.toLowerCase(),rect:{x:Math.round(a.left),y:Math.round(a.top),width:Math.round(a.width),height:Math.round(a.height)},scrollTop:Math.round(i.scrollTop),scrollHeight:Math.round(i.scrollHeight),clientHeight:Math.round(i.clientHeight),canScrollUp:i.scrollTop>4,canScrollDown:i.scrollTop+i.clientHeight<i.scrollHeight-4}),n.length>=7)break}return n}function Gi(){let e=document.scrollingElement??document.documentElement,t=window.scrollY||e.scrollTop,n=Math.max(e.scrollHeight,document.documentElement.scrollHeight,document.body.scrollHeight),r=window.innerHeight,i=n,a=t>4,o=t+r<i-4;return{id:`page`,kind:`page`,label:`main page`,rect:{x:0,y:0,width:window.innerWidth,height:window.innerHeight},scrollTop:Math.round(t),scrollHeight:Math.round(i),clientHeight:Math.round(r),canScrollUp:a,canScrollDown:o}}function Ki(e){if(Jn(e))return!1;let t=window.getComputedStyle(e);if(t.pointerEvents===`none`||!(/(auto|scroll)/i.test(t.overflowY)&&e.scrollHeight>e.clientHeight+8))return!1;let n=j(e);return n.width<80||n.height<80||n.bottom<0||n.right<0||n.top>window.innerHeight||n.left>window.innerWidth?!1:e.scrollTop>4||e.scrollTop+e.clientHeight<e.scrollHeight-4}function qi(e,t){let n=k(e);for(;n;){let e=t.get(n);if(e)return e;n=k(n)}}function Ji(e){let t=new Map;Wi(t,jn());for(let[n,r]of t.entries())if(r===e&&M(n))return n;return null}function W(e){return e.id===`barkan-widget-root`||!!e.closest(`#barkan-widget-root`)}function Yi(e,t){return t===`down`?e.canScrollDown:e.canScrollUp}function Xi(e){let t=k(e);for(;t&&t!==document.body&&t!==document.documentElement;){if(!W(t)){let e=window.getComputedStyle(t);if(/(auto|scroll|overlay)/i.test(e.overflowY)&&t.scrollHeight>t.clientHeight+4)return t}t=k(t)}return null}function Zi(e){return e.visibility===`outside`?!1:e.rect.width>=1&&e.rect.height>=1}function Qi(e){return Jn(e)}function $i(e){let t=j(e);if(t.width<1||t.height<1||!ea(t)||t.right<=0||t.left>=window.innerWidth)return!1;let n=window.getComputedStyle(e);return n.pointerEvents!==`none`&&n.display!==`none`&&n.visibility!==`hidden`&&n.opacity!==`0`}function ea(e){return e.bottom>0&&e.top<window.innerHeight}function ta(e,t,n){let r=Math.min(80,Math.max(24,n*.12)),i=t+r,a=t+n-r;if(e.top>=i&&e.bottom<=a)return 0;let o=e.top+e.height/2,s=t+n/2;return Math.round(o-s)}function na(e){return{windowX:window.scrollX,container:e,containerLeft:e?.scrollLeft??0}}function ra(e){Math.abs(window.scrollX-e.windowX)>1&&window.scrollTo(e.windowX,window.scrollY),e.container&&Math.abs(e.container.scrollLeft-e.containerLeft)>1&&(e.container.scrollLeft=e.containerLeft)}function ia(e){return e.kind===`table`?!0:e.kind===`text`&&e.label.length>12}function aa(e){return[`button`,`link`,`input`,`menu`].includes(e.kind)}function G(e,t){if(!t)return null;let n=qa(e.snapshot.elements,t);if(n?.state?.hidden===!0||n?.state?.ancestorHidden===!0)return null;let r=n?null:oa(e.snapshot,t),i=Xa(e,t);if(i)return{x:i.x,y:i.y,elementId:t,label:n?.label||n?.text||r?.label,source:`live`};if(n&&!Ya(n))return null;let a=n?Ja(n):null;return a?{x:a.x,y:a.y,elementId:t,label:n?.label||n?.text,source:`snapshot`}:r&&sa(r)?{x:r.rect.x+r.rect.width/2,y:r.rect.y+r.rect.height/2,elementId:t,label:r.label,source:`snapshot`}:null}function oa(e,t){return e.uiFacts.find(e=>e.id===t)??e.offscreenUiFacts.find(e=>e.id===t)??null}function sa(e){return e.state.visible&&e.rect.width>=1&&e.rect.height>=1}function ca(e,t){let n=e.targetElements.get(t);return n?Za(n):null}function la(e){let t=Ca(e);if(!t)return!1;let n=/\b(?:use|click|press|tap|open|select|choose)\b.{0,140}\b(?:to|then|after|look for|find|show|open|access|choose|select)\b/i.test(t)||/\b(?:use|click|press|tap|open|select|choose)\b.{0,100}\b(?:panel|tab|menu|section|view|drawer|sidebar|first)\b/i.test(t)||/\b(?:look for|find|then|after that|next)\b.{0,120}\b(?:option|button|control|menu|panel|submenu|settings|action)\b/i.test(t),r=/\b(?:edit|settings|options?|more|menu|submenu|panel|dialog|drawer|dropdown|tab|section|view|move|reorder|sort|left|right|up|down|next|previous)\b/i.test(t)||fa(t).length>0;return n&&r}function ua(e,t,n){let r=da(n);if(r.length===0)return null;let i=ga(e.snapshot.elements).filter(e=>e.interactive).filter(e=>e.visibility===`visible`||e.visibility===`partially_visible`).filter(e=>e.state?.ancestorHidden!==!0).map(e=>({element:e,searchText:_a(e)})).filter(({searchText:e})=>r.some(t=>e.includes(t)));if(i.length===0)return null;let a=i.filter(({element:e})=>e.state?.hidden!==!0),o=(a.length>0?a:i).sort((e,t)=>{let n=ma(e.searchText,r),i=ma(t.searchText,r);return i===n?e.element.rect.y-t.element.rect.y||e.element.rect.x-t.element.rect.x:i-n}),s=o[ha(t,o.length)]?.element??o[0]?.element;return s?{elementId:s.id,label:s.label||s.text}:null}function da(e){let t=Ca(e),n=[];for(let[e,r]of[[`edit`,/\b(?:edit|modify|pencil)\b/i],[`settings`,/\b(?:settings|preferences|parameters|parametres|parametres|paramètres)\b/i],[`options`,/\b(?:options?|more|ellipsis|menu|submenu|dropdown|actions?)\b/i],[`move`,/\b(?:move|reorder|sort|position|left|right|up|down|previous|next)\b/i]])r.test(t)&&n.push(e);n.includes(`move`)&&!n.includes(`edit`)&&!n.includes(`settings`)&&!n.includes(`options`)&&n.push(`edit`,`settings`,`options`);for(let e of fa(t))n.includes(e)||n.push(e);return n}function fa(e){let t=[];for(let n of[/\b(?:open|click|press|tap|select|choose|use|go to)\s+(?:the\s+)?([a-z0-9 ]{3,80}?)\s+(?:panel|tab|menu|section|view|page|drawer|sidebar|button)\b/g,/\b(?:open|click|press|tap|select|choose|use)\s+(?:the\s+)?([a-z0-9 ]{3,80}?)(?:\s+first|\s+then|\s+so\b|\s+to\b|$)/g])for(let r of e.matchAll(n)){let e=r[1]??``;for(let n of pa(e))t.includes(n)||t.push(n)}return t}function pa(e){let t=new Set([`action`,`button`,`control`,`drawer`,`first`,`icon`,`menu`,`option`,`page`,`panel`,`section`,`sidebar`,`tab`,`view`]);return Sa(e).split(` `).filter(e=>e.length>2&&!t.has(e)).slice(0,4)}function ma(e,t){return t.reduce((t,n)=>t+ +!!e.includes(n),0)}function ha(e,t){let n=Sa(e);return/\b(?:first|1st|one|premier|premiere|première)\b/.test(n)?0:/\b(?:last|final)\b/.test(n)?Math.max(0,t-1):/\b(?:second|2nd|two|deux|deuxieme|deuxième)\b/.test(n)?Math.min(1,Math.max(0,t-1)):0}function ga(e){return e.flatMap(e=>[e,...ga(e.children??[])])}function _a(e){return Sa([e.tag,e.role,e.label,e.text,...Object.entries(e.attributes??{}).flatMap(([e,t])=>[e,t])].filter(Boolean).join(` `))}function va(e){return/\b(latest|recent|first|last|activity|activities|event|events|item|row|entry|details?|content|record|status|value|owner|account)\b/i.test(e)}function ya(e,t){let n=ba(t);if(n.length===0)return 0;let r=[e.label,e.text,e.context,e.role,e.kind,e.href,Ii(e.metadata)].filter(Boolean).join(` `).toLowerCase(),i=0,a=e.label.toLowerCase(),o=(e.context??``).toLowerCase();for(let e of n)a.includes(e)?i+=4:o.includes(e)?i+=3:r.includes(e)&&(i+=2);let s=n.join(` `);return s.length>3&&r.includes(s)&&(i+=8),o&&va(t)&&ia(e)&&(i+=6),i}function ba(e){let t=new Set([`a`,`an`,`and`,`are`,`can`,`click`,`find`,`for`,`how`,`i`,`is`,`it`,`me`,`of`,`on`,`please`,`show`,`the`,`this`,`to`,`where`,`you`]);return e.normalize(`NFD`).replace(/[\u0300-\u036f]/g,``).toLowerCase().split(/[^a-z0-9]+/i).map(e=>e.trim()).map(xa).filter(e=>e.length>2&&!t.has(e)).slice(0,12)}function xa(e){return e.endsWith(`ies`)&&e.length>4?`${e.slice(0,-3)}y`:e.endsWith(`s`)&&e.length>4?e.slice(0,-1):e}function Sa(e){return ba(e).join(` `)}function Ca(e){return e.normalize(`NFD`).replace(/[\u0300-\u036f]/g,``).toLowerCase().replace(/[^a-z0-9]+/g,` `).replace(/\s+/g,` `).trim()}function wa(e){return N(e,`HTMLAnchorElement`)}function Ta(e){return N(e,`HTMLButtonElement`)}function Ea(e){return N(e,`HTMLDialogElement`)}function Da(e){return N(e,`HTMLFormElement`)}function Oa(e){return N(e,`HTMLImageElement`)}function K(e){return N(e,`HTMLInputElement`)}function ka(e){return N(e,`HTMLOptionElement`)}function q(e){return N(e,`HTMLSelectElement`)}function Aa(e){return N(e,`HTMLTextAreaElement`)}function ja(e){return N(e,`SVGElement`)}function Ma(e){return N(e,`SVGUseElement`)}function Na(e){let t=e.getAttribute(`aria-label`),n=U(e,e.getAttribute(`aria-labelledby`)),r=La(e),i=e.getAttribute(`title`),a=e.getAttribute(`placeholder`),o=e.getAttribute(`alt`),s=Pa(e),c=Ia(e)?J(e,180):``,l=Fa(e),u=Ra(e),d=Ba(e,{includeDescendants:za(e)});return Y(t||n||r||i||a||o||s||c||l||u||d)}function Pa(e){return Y(Array.from(e.childNodes).filter(e=>e.nodeType===Node.TEXT_NODE).map(e=>e.textContent??``).join(` `))}function J(e,t=180){return Y(e.textContent||``).slice(0,t)}function Fa(e){return Y(Array.from(L(e,64)).filter(e=>e.matches(`img[alt],svg[aria-label],svg title,[data-icon],[data-lucide]`)).slice(0,4).map(e=>Oa(e)?e.alt||Ga(e.getAttribute(`src`)?.split(`/`).pop()?.replace(/\.[a-z0-9]+$/i,``)??``):e.tagName.toLowerCase()===`title`?e.textContent??``:e.getAttribute(`aria-label`)||Ba(e)).filter(Boolean).join(` `))}function Ia(e){let t=e.tagName.toLowerCase(),n=e.getAttribute(`role`)?.toLowerCase()??``;return[`button`,`a`,`summary`,`label`,`th`,`td`].includes(t)||/^h[1-6]$/.test(t)||/button|link|menuitem|tab|checkbox|radio|switch|option|cell|row|heading/.test(n)}function La(e){return K(e)||q(e)||Aa(e)?Y(Array.from(e.labels??[]).map(e=>J(e,120)).filter(Boolean).join(` `)):``}function Ra(e){let t=wa(e)?e.href:e.closest(`a[href]`)?.href;if(!t)return``;try{let e=new URL(t,window.location.href);return Ga(e.pathname.split(`/`).map(e=>decodeURIComponent(e.trim())).filter(Boolean).filter(e=>!/^[:\d]+$/.test(e)&&!/^[a-f0-9-]{8,}$/i.test(e)).at(-1)??(e.pathname===`/`?`home`:``))}catch{return``}}function za(e){let t=e.tagName.toLowerCase(),n=e.getAttribute(`role`)?.toLowerCase()??``;return[`button`,`a`,`summary`,`label`].includes(t)||/button|link|menuitem|tab|checkbox|radio|switch|option/.test(n)||e.hasAttribute(`onclick`)||!!e.onclick||e.tabIndex>=0}function Ba(e,t={}){let n=Va(e,t);return n?{bell:`notifications`,"bell-ring":`notifications`,"bell-dot":`notifications`,"bell-plus":`notifications`,"bell-off":`notifications`,home:`home`,house:`home`,user:`profile`,users:`users`,"circle-help":`help`,"help-circle":`help`,question:`help`,settings:`settings`,cog:`settings`,search:`search`,plus:`add`,"plus-circle":`add`,x:`close`,close:`close`,edit:`edit`,pencil:`edit`,pen:`edit`,"pen-line":`edit`,"more-horizontal":`options`,"more-vertical":`options`,ellipsis:`options`,menu:`menu`,"arrow-left":`left`,"arrow-right":`right`,"arrow-up":`up`,"arrow-down":`down`,"chevron-left":`left`,"chevron-right":`right`,"chevron-up":`up`,"chevron-down":`down`}[n]??Ga(n):``}function Va(e,t={}){let n=[e,...t.includeDescendants?Array.from(L(e,96)).filter(e=>e.matches(`svg,img,[class],[data-icon],[data-lucide]`)):[]].slice(0,12);for(let e of n){let t=[e.getAttribute(`data-icon`),e.getAttribute(`data-lucide`),e.getAttribute(`icon`),e.getAttribute(`name`),e.getAttribute(`aria-label`),e.getAttribute(`title`),Oa(e)?e.getAttribute(`src`)?.split(`/`).pop()?.replace(/\.[a-z0-9]+$/i,``):void 0].map(Ua).find(Boolean);if(t)return t;for(let t of Array.from(e.classList)){let e=Ha(t);if(e)return e}let n=Ua((Ma(e)?e.href.baseVal:e.querySelector(`use`)?.href.baseVal)?.split(`#`).at(-1));if(n)return n;if(ja(e)||e.querySelector(`svg`)){let t=Wa(e);if(t)return t}}}function Ha(e){let t=e.trim().toLowerCase(),n=t.match(/(?:^|[-_])(bell(?:[-_](?:ring|dot|plus|off))?|home|house|user|users|circle-help|help-circle|question|settings|cog|search|plus-circle|plus|x|close|edit|pencil|pen(?:[-_]line)?|more[-_](?:horizontal|vertical)|ellipsis|menu|arrow[-_](?:left|right|up|down)|chevron[-_](?:left|right|up|down))(?:$|[-_])/);return n?.[1]?Ua(n[1]):Ua(t)}function Ua(e){if(!e)return;let t=e.replace(/^#/,``).replace(/^(lucide|icon|icons|tabler|heroicons|hero|fa|fas|far|material|mdi)[-_:/]*/i,``).replace(/([a-z])([A-Z])/g,`$1-$2`).replace(/[_\s:/.]+/g,`-`).toLowerCase().replace(/^-+|-+$/g,``);if(!(!t||/^(svg|path|icon|lucide|outline|solid)$/.test(t)))return t.match(/(?:^|-)(bell(?:-(?:ring|dot|plus|off))?|home|house|user|users|circle-help|help-circle|question|settings|cog|search|plus-circle|plus|x|close|edit|pencil|pen(?:-line)?|more-(?:horizontal|vertical)|ellipsis|menu|arrow-(?:left|right|up|down)|chevron-(?:left|right|up|down))$/)?.[1]}function Wa(e){let t=Array.from(e.querySelectorAll(`path,circle,polyline,line`)).map(e=>[e.getAttribute(`d`),e.getAttribute(`points`),e.getAttribute(`cx`),e.getAttribute(`cy`),e.getAttribute(`r`),e.getAttribute(`x1`),e.getAttribute(`x2`),e.getAttribute(`y1`),e.getAttribute(`y2`)].filter(Boolean).join(` `)).join(` `).replace(/[,\s]+/g,` `).toLowerCase();if(t){if(/bell|notification/i.test(t)||/(?:17h16|h-16|15\.326|17\.082|v-3a7|v3a4)/.test(t)&&/(?:10\.268 21a2|m9 17v1a3|a6 6 0 0 0 6 8|18 8a6|18\.75 8\.25a6\.75)/.test(t)||/(?:a6|a7|a6\.75)\s+(?:6|7|6\.75)\s+0\s+0\s+[01]/.test(t)&&/(?:h16|h-16|v3|v-3|15\.326|17\.082)/.test(t))return`bell`;if(/m3 9l9-7 9 7|m10 20v-6h4v6|house|home/i.test(t))return`home`;if(/m20 21v-2a4 4 0 0 0-4-4h-8a4 4|user/i.test(t))return`user`;if(/m9\.09 9a3 3 0 1 1 5\.83 1c0 2-3 3-3 3|circle help|help/i.test(t))return`circle-help`}}function Ga(e){return Y(e.replace(/[_-]+/g,` `).replace(/\b\w/g,e=>e.toLowerCase()))}function Y(e){return e.replace(/\s+/g,` `).trim().slice(0,180)}function Ka(e){if(!(!wa(e)||!e.href))try{let t=new URL(e.href);return`${t.pathname}${t.search}`.slice(0,240)}catch{return}}function X(){return a(window.location.pathname,window.location.search,window.location.hash)}function qa(e,t){for(let n of e){if(n.id===t)return n;let e=n.children?qa(n.children,t):null;if(e)return e}return null}function Ja(e){return Ya(e)?{x:e.rect.x+e.rect.width/2,y:e.rect.y+e.rect.height/2}:null}function Ya(e){return!(e.state?.ancestorHidden===!0||e.visibility!==`visible`&&e.visibility!==`partially_visible`||e.rect.width<1||e.rect.height<1)}function Xa(e,t){let n=e.targetElements.get(t);if(!n)return null;let r=Za(n);if(Qi(r))return null;let i=j(r);return i.width<1||i.height<1||i.bottom<0||i.right<0||i.top>window.innerHeight||i.left>window.innerWidth?null:{x:i.left+i.width/2,y:i.top+i.height/2}}function Za(e){return ot(e,{isPointable:sr,shouldIgnore:W,maxDepth:6})}async function Qa(e={}){try{!e.retry&&document.fonts?.status!==`loaded`&&await Promise.race([document.fonts?.ready,Z($t)])}catch{}await $a(e),await fo()}async function $a(e={}){let t=performance.now(),n=ao(),r=X(),i=t,a=!1,o=``,s=0,c=0,l=!e.retry&&to(),u=e.retry?Math.min(220,en):l?tn:en,d=e.retry?0:l?on:an,f=e.retry?0:l?ln:cn,p=l?dn:un;try{for(;performance.now()-t<u;){await fo();let u=performance.now(),m=X();m!==r&&(r=m,i=u,a=!0,o=``,c=0);let h=co(r);n.count!==s&&(s=n.count,c=0),h===o?c+=1:(o=h,c=0);let g=u-t,_=u-i,v=a&&!e.retry?sn:0,y=n.lastMutationAt===0||u-n.lastMutationAt>=f,b=e.retry||!eo(),x=e.retry||!l||!to()||g>=nn;if(c>=p&&g>=d&&_>=v&&y&&b&&x)return;await Z(rn)}}finally{n.disconnect()}}function eo(){return typeof document.documentElement.getAnimations==`function`?document.documentElement.getAnimations({subtree:!0}).some(e=>{let t=String(e.playState);if(t!==`running`&&t!==`pending`)return!1;let n=typeof KeyframeEffect<`u`&&e.effect instanceof KeyframeEffect?e.effect.target:null;return!(!M(n)||W(n)||!ro(n))}):!1}function to(){if(document.readyState===`loading`||no())return!0;if(document.readyState!==`complete`){let e=document.body,t=e?.childElementCount??0,n=(e?.textContent??``).replace(/\s+/g,``).length;return t<=3&&n<80&&uo()===0}return!1}function no(){let e=document.querySelectorAll([`[aria-busy="true"]`,`[role="progressbar"]`,`[data-loading="true"]`,`[data-state="loading"]`,`.loading`,`.spinner`,`.skeleton`,`[class*="spinner"]`,`[class*="skeleton"]`].join(`,`));for(let t of Array.from(e).slice(0,16))if(!(W(t)||!ro(t)))return!0;return!1}function ro(e){let t=j(e);if(t.width<4||t.height<4||t.bottom<=0||t.right<=0)return!1;let n=window.getComputedStyle(e);return n.display!==`none`&&n.visibility!==`hidden`&&n.opacity!==`0`}async function io(e){let t=performance.now(),n=ao(),r=e,i=0,a=0;try{for(;performance.now()-t<mn;){await fo();let o=performance.now(),s=o-t,c=co(X()),l=c!==e||n.count>0;n.count!==i&&(i=n.count,a=0),c===r?a+=1:(r=c,a=0);let u=n.lastMutationAt===0||o-n.lastMutationAt>=gn;if(l&&s>=hn&&a>=un&&u||!l&&s>=_n)return;await Z(rn)}}finally{n.disconnect()}}function ao(){if(typeof MutationObserver>`u`||!document.documentElement)return{count:0,lastMutationAt:0,disconnect:()=>void 0};let e={count:0,lastMutationAt:0,disconnect:()=>t.disconnect()},t=new MutationObserver(t=>{t.some(oo)&&(e.count+=1,e.lastMutationAt=performance.now())});return t.observe(document.documentElement,{subtree:!0,childList:!0,attributes:!0,characterData:!0,attributeFilter:[`class`,`style`,`hidden`,`open`,`role`,`aria-hidden`,`aria-expanded`,`aria-selected`,`aria-modal`,`aria-busy`,`data-state`,`data-open`]}),e}function oo(e){if(so(e.target))return!1;if(e.type!==`childList`)return!0;let t=[...Array.from(e.addedNodes),...Array.from(e.removedNodes)];return t.length===0||t.some(e=>!so(e))}function so(e){let t=M(e)?e:M(e.parentElement)?e.parentElement:null;return!t||W(t)}function co(e){let t=document.querySelector(`main,[role='main']`),n=t?j(t):void 0;return[e,document.title,document.body?.childElementCount??0,t?.childElementCount??0,Math.round(document.body?.scrollHeight??0),Math.round(n?.width??0),Math.round(n?.height??0)].join(`::`)}function lo(e){return lt(e,{livePrimaryControlCount:uo()})}function uo(){return document.querySelectorAll(`button,a,input,select,textarea,summary,[role='button'],[role='link'],[role='menuitem'],[role='tab'],[role='checkbox'],[role='radio'],[role='switch'],[role='textbox'],[role='combobox'],[role='searchbox']`).length}function fo(){return new Promise(e=>requestAnimationFrame(()=>e()))}async function po(e,t){let n=ho(e),r=performance.now();for(;performance.now()-r<900;){await Z(80);let r=ho(e),i=t===`down`?r>n:r<n,a=Math.abs(r-n)>1;if(n=r,!a&&!i)break}await Qa()}async function mo(e,t){let n=performance.now();for(;performance.now()-n<1e3;){await Z(80);let n=j(e).top,r=Math.abs(n-t)>1;if(t=n,!r)break}await Qa()}function ho(e){return e instanceof Window?e.scrollY:e.scrollTop}function go(e){let t=0;for(let n of e)t+=n*n;let n=Math.sqrt(t/Math.max(1,e.length));return Math.max(0,Math.min(1,(n-.01)/.11))}function _o(e,t){let n=Math.max(1,Math.floor(e.length/t)),r=[];for(let i=0;i<t;i++){let a=i*n,o=i===t-1?e.length:Math.min(e.length,a+n),s=0;for(let t=a;t<o;t++){let n=e[t]??0;s+=n*n}let c=Math.sqrt(s/Math.max(1,o-a));r.push(Math.max(0,Math.min(1,(c-.008)/.105)))}return r}function vo(e,t,n){if(n===t)return yo(e);let r=t/n,i=Math.floor(e.length/r),a=new Float32Array(i);for(let t=0;t<i;t++)a[t]=e[Math.floor(t*r)]??0;return yo(a)}function yo(e){let t=new Int16Array(e.length);for(let n=0;n<e.length;n++){let r=Math.max(-1,Math.min(1,e[n]));t[n]=r<0?r*32768:r*32767}return t}function bo(e){let t=``;for(let n of e)t+=String.fromCharCode(n);return btoa(t)}function xo(e,t){let n=Math.max(1,Math.floor(e*t/1e3));return bo(new Uint8Array(n*2))}function So(e){let t=atob(e),n=new Uint8Array(t.length);for(let e=0;e<t.length;e++)n[e]=t.charCodeAt(e);return n}function Co(e){return Oo(e)}function wo(e,t){if(!e||!t)return!1;if(e===t||e.length>=18&&t.includes(e)||t.length>=18&&e.includes(t))return!0;let n=Do(e),r=Do(t);if(n.length<3||r.length<3)return!1;let i=ko(n,r),a=i/Math.max(1,Math.min(n.length,r.length)),o=2*i/Math.max(1,n.length+r.length);return a>=.86||a>=.74&&o>=.7}function To(e){return Do(e).length>=3?!0:/^(stop|wait|pause|no|barkan|hey barkan|listen|actually)\b/i.test(e.trim())}function Eo(e,t){let n=Oo(e),r=Do(e);if(r.length<3||!n)return!1;for(let e of t){let t=Oo(e),i=Do(e);if(i.length<3||!t)continue;if(n.length>=14&&t.includes(n)||t.length>=14&&n.includes(t))return!0;let a=ko(r,i),o=a/Math.max(1,Math.min(r.length,i.length)),s=2*a/Math.max(1,r.length+i.length);if(o>=.78||o>=.68&&s>=.62)return!0}return!1}function Do(e){let t=new Set([`a`,`an`,`and`,`are`,`i`,`it`,`is`,`of`,`on`,`that`,`the`,`this`,`to`,`you`]);return Oo(e).split(` `).map(e=>e.trim()).map(xa).filter(e=>e.length>1&&!t.has(e))}function Oo(e){return e.toLowerCase().replace(/\[[^\]]+\]/g,` `).replace(/[^a-z0-9\s]/g,` `).replace(/\s+/g,` `).trim()}function ko(e,t){let n=new Map;for(let e of t)n.set(e,(n.get(e)??0)+1);let r=0;for(let t of e){let e=n.get(t)??0;e<=0||(r++,n.set(t,e-1))}return r}function Ao(){let e=[`Hi, I'm Barkan. How can I help you today?`,`Hi, I'm Barkan. What can I help with?`,`Hi, I'm Barkan. Tell me what you need.`,`Hi, I'm Barkan. How can I help?`];return e[Math.floor(Math.random()*e.length)]??e[0]}function jo(e){let t=e.answeredQuestions&&e.historyTranscript&&e.historyTranscript!==e.transcript?`original visitor request:\n${e.historyTranscript}\n\n`:``,n=e.answeredQuestions?`The visitor answered the clarification questions below. This is the answer to your previous ask_user question. Continue the original request now using these answers. Do not ask_user, ask another clarification, or ask another dummy/test question in this response. If something is still ambiguous, choose the safest visible/current option or tell the visitor what to click/type.\n\n${t}clarification answers:\n${e.transcript}`:e.transcript;return e.scrollRetryCount===0?n:`${n}

internal note: barkan already performed one smooth scroll for this request. use the new viewport now; do not emit another scroll action.`}function Mo(e){return`wss://api.elevenlabs.io/v1/speech-to-text/realtime?${new URLSearchParams({model_id:`scribe_v2_realtime`,token:e,audio_format:`pcm_${F}`,language_code:`en`,commit_strategy:`vad`,vad_silence_threshold_secs:`1.1`,vad_threshold:`0.35`,min_speech_duration_ms:`100`,min_silence_duration_ms:`100`,include_language_detection:`false`}).toString()}`}function No(e){return e.readyState===WebSocket.OPEN?Promise.resolve():new Promise((t,n)=>{let r=window.setTimeout(()=>n(Error(`websocket timeout`)),8e3);e.addEventListener(`open`,()=>{window.clearTimeout(r),t()},{once:!0}),e.addEventListener(`error`,()=>{window.clearTimeout(r),n(Error(`websocket failed`))},{once:!0})})}function Z(e){return new Promise(t=>window.setTimeout(t,e))}function Q(e){return e instanceof Error?e.message:String(e)}function Po(e,t=Fo()){let n;try{n=new URL(e)}catch{return e}if(n.port===`4888`&&(n.port=`4001`),t===`https:`&&n.protocol===`http:`&&!Io(n.hostname))throw Error(`Barkan API URL must use HTTPS on HTTPS pages.`);return n.origin}function Fo(){return typeof window<`u`?window.location.protocol:``}function Io(e){return e===`localhost`||e===`127.0.0.1`||e===`::1`}function Lo(e,t){let n=e.trim();if(!n||n===`none`||n===`all 0s ease 0s`)return t;let r=t.split(/\s+/)[0]??``;return r&&n.includes(r)?n:`${n}, ${t}`}function Ro(e){let t=e.trim();return!t||/^https?:\/\//i.test(t)?null:t.startsWith(`/`)?t:`/${t}`}function zo(e,t){let n=[...window.__BARKAN_DEBUG__?.events??[],{name:e,detail:t,at:Math.round(performance.now())}].slice(-20);window.__BARKAN_DEBUG__={...window.__BARKAN_DEBUG__??{},events:n,...e===`end-call`?{lastEndReason:t??e}:{}}}function $(e,t,n){let r={label:e,elapsedMs:Math.round(performance.now()-t),at:Math.round(performance.now()),...n?{details:n}:{}},i=[...window.__BARKAN_DEBUG__?.latencyLogs??[],r].slice(-80);window.__BARKAN_DEBUG__={...window.__BARKAN_DEBUG__??{},latencyLogs:i,lastTimings:{...window.__BARKAN_DEBUG__?.lastTimings??{},[`latency:${e}`]:r.elapsedMs}},console.info(`[Barkan latency] ${e}`,r)}function Bo(e){return e.reduce((e,t)=>e+1+Bo(t.children??[]),0)}async function Vo(){try{return(await navigator.permissions?.query({name:`microphone`}))?.state===`granted`}catch{return!1}}var Ho=typeof document>`u`?null:document.currentScript instanceof HTMLScriptElement?document.currentScript:Array.from(document.querySelectorAll(`script[data-barkan-site]`)).at(-1);return Ho?.dataset.barkanSite&&new En(Ho).start(),e.normalizeWidgetApiBaseUrl=Po,e})({});