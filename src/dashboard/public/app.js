var Dt=Object.create;var ot=Object.defineProperty;var $t=Object.getOwnPropertyDescriptor;var Et=Object.getOwnPropertyNames;var Lt=Object.getPrototypeOf,_t=Object.prototype.hasOwnProperty;var Le=(t,a)=>()=>(a||t((a={exports:{}}).exports,a),a.exports);var jt=(t,a,r,d)=>{if(a&&typeof a=="object"||typeof a=="function")for(let c of Et(a))!_t.call(t,c)&&c!==r&&ot(t,c,{get:()=>a[c],enumerable:!(d=$t(a,c))||d.enumerable});return t};var Se=(t,a,r)=>(r=t!=null?Dt(Lt(t)):{},jt(a||!t||!t.__esModule?ot(r,"default",{value:t,enumerable:!0}):r,t));var ft=Le(R=>{"use strict";var Ae=Symbol.for("react.element"),Bt=Symbol.for("react.portal"),qt=Symbol.for("react.fragment"),Ot=Symbol.for("react.strict_mode"),Ft=Symbol.for("react.profiler"),Wt=Symbol.for("react.provider"),Ht=Symbol.for("react.context"),Gt=Symbol.for("react.forward_ref"),Ut=Symbol.for("react.suspense"),Yt=Symbol.for("react.memo"),Kt=Symbol.for("react.lazy"),rt=Symbol.iterator;function Vt(t){return t===null||typeof t!="object"?null:(t=rt&&t[rt]||t["@@iterator"],typeof t=="function"?t:null)}var lt={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},dt=Object.assign,ct={};function Ce(t,a,r){this.props=t,this.context=a,this.refs=ct,this.updater=r||lt}Ce.prototype.isReactComponent={};Ce.prototype.setState=function(t,a){if(typeof t!="object"&&typeof t!="function"&&t!=null)throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,t,a,"setState")};Ce.prototype.forceUpdate=function(t){this.updater.enqueueForceUpdate(this,t,"forceUpdate")};function pt(){}pt.prototype=Ce.prototype;function Ke(t,a,r){this.props=t,this.context=a,this.refs=ct,this.updater=r||lt}var Ve=Ke.prototype=new pt;Ve.constructor=Ke;dt(Ve,Ce.prototype);Ve.isPureReactComponent=!0;var st=Array.isArray,ut=Object.prototype.hasOwnProperty,Je={current:null},mt={key:!0,ref:!0,__self:!0,__source:!0};function gt(t,a,r){var d,c={},l=null,i=null;if(a!=null)for(d in a.ref!==void 0&&(i=a.ref),a.key!==void 0&&(l=""+a.key),a)ut.call(a,d)&&!mt.hasOwnProperty(d)&&(c[d]=a[d]);var u=arguments.length-2;if(u===1)c.children=r;else if(1<u){for(var s=Array(u),v=0;v<u;v++)s[v]=arguments[v+2];c.children=s}if(t&&t.defaultProps)for(d in u=t.defaultProps,u)c[d]===void 0&&(c[d]=u[d]);return{$$typeof:Ae,type:t,key:l,ref:i,props:c,_owner:Je.current}}function Jt(t,a){return{$$typeof:Ae,type:t.type,key:a,ref:t.ref,props:t.props,_owner:t._owner}}function Qe(t){return typeof t=="object"&&t!==null&&t.$$typeof===Ae}function Qt(t){var a={"=":"=0",":":"=2"};return"$"+t.replace(/[=:]/g,function(r){return a[r]})}var it=/\/+/g;function Ye(t,a){return typeof t=="object"&&t!==null&&t.key!=null?Qt(""+t.key):a.toString(36)}function je(t,a,r,d,c){var l=typeof t;(l==="undefined"||l==="boolean")&&(t=null);var i=!1;if(t===null)i=!0;else switch(l){case"string":case"number":i=!0;break;case"object":switch(t.$$typeof){case Ae:case Bt:i=!0}}if(i)return i=t,c=c(i),t=d===""?"."+Ye(i,0):d,st(c)?(r="",t!=null&&(r=t.replace(it,"$&/")+"/"),je(c,a,r,"",function(v){return v})):c!=null&&(Qe(c)&&(c=Jt(c,r+(!c.key||i&&i.key===c.key?"":(""+c.key).replace(it,"$&/")+"/")+t)),a.push(c)),1;if(i=0,d=d===""?".":d+":",st(t))for(var u=0;u<t.length;u++){l=t[u];var s=d+Ye(l,u);i+=je(l,a,r,s,c)}else if(s=Vt(t),typeof s=="function")for(t=s.call(t),u=0;!(l=t.next()).done;)l=l.value,s=d+Ye(l,u++),i+=je(l,a,r,s,c);else if(l==="object")throw a=String(t),Error("Objects are not valid as a React child (found: "+(a==="[object Object]"?"object with keys {"+Object.keys(t).join(", ")+"}":a)+"). If you meant to render a collection of children, use an array instead.");return i}function _e(t,a,r){if(t==null)return t;var d=[],c=0;return je(t,d,"","",function(l){return a.call(r,l,c++)}),d}function Zt(t){if(t._status===-1){var a=t._result;a=a(),a.then(function(r){(t._status===0||t._status===-1)&&(t._status=1,t._result=r)},function(r){(t._status===0||t._status===-1)&&(t._status=2,t._result=r)}),t._status===-1&&(t._status=0,t._result=a)}if(t._status===1)return t._result.default;throw t._result}var te={current:null},Be={transition:null},Xt={ReactCurrentDispatcher:te,ReactCurrentBatchConfig:Be,ReactCurrentOwner:Je};function ht(){throw Error("act(...) is not supported in production builds of React.")}R.Children={map:_e,forEach:function(t,a,r){_e(t,function(){a.apply(this,arguments)},r)},count:function(t){var a=0;return _e(t,function(){a++}),a},toArray:function(t){return _e(t,function(a){return a})||[]},only:function(t){if(!Qe(t))throw Error("React.Children.only expected to receive a single React element child.");return t}};R.Component=Ce;R.Fragment=qt;R.Profiler=Ft;R.PureComponent=Ke;R.StrictMode=Ot;R.Suspense=Ut;R.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=Xt;R.act=ht;R.cloneElement=function(t,a,r){if(t==null)throw Error("React.cloneElement(...): The argument must be a React element, but you passed "+t+".");var d=dt({},t.props),c=t.key,l=t.ref,i=t._owner;if(a!=null){if(a.ref!==void 0&&(l=a.ref,i=Je.current),a.key!==void 0&&(c=""+a.key),t.type&&t.type.defaultProps)var u=t.type.defaultProps;for(s in a)ut.call(a,s)&&!mt.hasOwnProperty(s)&&(d[s]=a[s]===void 0&&u!==void 0?u[s]:a[s])}var s=arguments.length-2;if(s===1)d.children=r;else if(1<s){u=Array(s);for(var v=0;v<s;v++)u[v]=arguments[v+2];d.children=u}return{$$typeof:Ae,type:t.type,key:c,ref:l,props:d,_owner:i}};R.createContext=function(t){return t={$$typeof:Ht,_currentValue:t,_currentValue2:t,_threadCount:0,Provider:null,Consumer:null,_defaultValue:null,_globalName:null},t.Provider={$$typeof:Wt,_context:t},t.Consumer=t};R.createElement=gt;R.createFactory=function(t){var a=gt.bind(null,t);return a.type=t,a};R.createRef=function(){return{current:null}};R.forwardRef=function(t){return{$$typeof:Gt,render:t}};R.isValidElement=Qe;R.lazy=function(t){return{$$typeof:Kt,_payload:{_status:-1,_result:t},_init:Zt}};R.memo=function(t,a){return{$$typeof:Yt,type:t,compare:a===void 0?null:a}};R.startTransition=function(t){var a=Be.transition;Be.transition={};try{t()}finally{Be.transition=a}};R.unstable_act=ht;R.useCallback=function(t,a){return te.current.useCallback(t,a)};R.useContext=function(t){return te.current.useContext(t)};R.useDebugValue=function(){};R.useDeferredValue=function(t){return te.current.useDeferredValue(t)};R.useEffect=function(t,a){return te.current.useEffect(t,a)};R.useId=function(){return te.current.useId()};R.useImperativeHandle=function(t,a,r){return te.current.useImperativeHandle(t,a,r)};R.useInsertionEffect=function(t,a){return te.current.useInsertionEffect(t,a)};R.useLayoutEffect=function(t,a){return te.current.useLayoutEffect(t,a)};R.useMemo=function(t,a){return te.current.useMemo(t,a)};R.useReducer=function(t,a,r){return te.current.useReducer(t,a,r)};R.useRef=function(t){return te.current.useRef(t)};R.useState=function(t){return te.current.useState(t)};R.useSyncExternalStore=function(t,a,r){return te.current.useSyncExternalStore(t,a,r)};R.useTransition=function(){return te.current.useTransition()};R.version="18.3.1"});var qe=Le(($a,bt)=>{"use strict";bt.exports=ft()});var xt=Le(Oe=>{"use strict";var ea=qe(),ta=Symbol.for("react.element"),aa=Symbol.for("react.fragment"),na=Object.prototype.hasOwnProperty,oa=ea.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,ra={key:!0,ref:!0,__self:!0,__source:!0};function vt(t,a,r){var d,c={},l=null,i=null;r!==void 0&&(l=""+r),a.key!==void 0&&(l=""+a.key),a.ref!==void 0&&(i=a.ref);for(d in a)na.call(a,d)&&!ra.hasOwnProperty(d)&&(c[d]=a[d]);if(t&&t.defaultProps)for(d in a=t.defaultProps,a)c[d]===void 0&&(c[d]=a[d]);return{$$typeof:ta,type:t,key:l,ref:i,props:c,_owner:oa.current}}Oe.Fragment=aa;Oe.jsx=vt;Oe.jsxs=vt});var Re=Le((La,yt)=>{"use strict";yt.exports=xt()});var o=Se(qe(),1);var Te=Se(qe(),1),ia=Se(Re(),1),sa=(0,Te.createContext)({theme:"dark",setTheme:()=>{},resolved:"dark"});function wt(){return(0,Te.useContext)(sa)}function kt(t){return t.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g,"")}var e=Se(Re(),1);function Mt(t){switch(t){case"running":return"#e8703a";case"completed":return"#22c55e";case"failed":return"#ef4444";default:return"#4b5563"}}function la(t){return t===null||t===0?"":`$${t.toFixed(4)}`}function ce(t){if(!t)return"";let a=Date.now()-new Date(t).getTime();return a<6e4?"just now":a<36e5?`${Math.round(a/6e4)}m ago`:a<864e5?`${Math.round(a/36e5)}h ago`:`${Math.round(a/864e5)}d ago`}async function ve(t,a){return fetch(t,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(a)})}function et({size:t=20,color:a="currentColor"}){return(0,e.jsxs)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",width:t,height:t,fill:a,children:[(0,e.jsx)("path",{d:"M16,2H5C3.343,2,2,3.343,2,5v9c0,1.622,1.29,2.936,2.9,2.99l0.756,2.32c0.234,0.718,1.148,0.927,1.672,0.383L9.916,17H16 c1.657,0,3-1.343,3-3V5C19,3.343,17.657,2,16,2z",opacity:".35"}),(0,e.jsx)("path",{d:"M19,4h-0.184C18.928,4.314,19,4.647,19,5v9c0,1.657-1.343,3-3,3H9.916l-1.922,1.999C7.996,18.999,7.998,19,8,19h6.084 l2.589,2.693c0.523,0.544,1.438,0.335,1.672-0.383l0.756-2.32C20.71,18.936,22,17.622,22,16V7C22,5.343,20.657,4,19,4z"})]})}function Fe({size:t=20,color:a="currentColor"}){return(0,e.jsxs)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",width:t,height:t,fill:a,children:[(0,e.jsx)("path",{d:"M21.277,8.424c1.195-1.997-0.239-4.535-2.566-4.541L5.288,3.847C2.956,3.841,1.509,6.382,2.704,8.384l0.928,1.555H20.37 L21.277,8.424z"}),(0,e.jsx)("polygon",{points:"20.361,9.939 3.623,9.939 7.204,15.939 16.768,15.939",opacity:".35"}),(0,e.jsx)("path",{d:"M7.209,15.939l2.203,3.691c1.163,1.948,3.984,1.95,5.15,0.004l2.212-3.694H7.209z"})]})}function Ne({size:t=20,color:a="currentColor"}){return(0,e.jsxs)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",width:t,height:t,fill:a,children:[(0,e.jsx)("path",{d:"M17.677,13.346L16,12.517V7.233c0-1.279-0.508-2.506-1.413-3.41 L13.355,2.59c-0.748-0.748-1.961-0.748-2.709,0L9.413,3.823C8.508,4.728,8,5.954,8,7.233v5.284l-1.677,0.829 c-0.834,0.412-1.43,1.189-1.613,2.101L4.42,16.901C4.203,17.987,5.033,19,6.14,19H17.86c1.107,0,1.938-1.013,1.721-2.099 l-0.291-1.454C19.107,14.535,18.511,13.758,17.677,13.346z",opacity:".35"}),(0,e.jsx)("circle",{cx:"12",cy:"8",r:"2"}),(0,e.jsx)("path",{d:"M9,19c0,0.983,0.724,2.206,1.461,3.197c0.771,1.038,2.307,1.038,3.079,0C14.276,21.206,15,19.983,15,19H9z"})]})}function It({size:t=20,color:a="currentColor"}){return(0,e.jsxs)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",width:t,height:t,fill:a,children:[(0,e.jsx)("path",{d:"M12,4.5C12,3.119,10.881,2,9.5,2C8.275,2,7.26,2.883,7.046,4.046C5.33,4.271,4,5.723,4,7.5 c0,0.165,0.026,0.323,0.049,0.482C2.812,8.893,2,10.347,2,12s0.812,3.107,2.049,4.018C4.026,16.177,4,16.335,4,16.5 c0,1.777,1.33,3.229,3.046,3.454C7.26,21.117,8.275,22,9.5,22c1.381,0,2.5-1.119,2.5-2.5C12,19.352,12,4.654,12,4.5z",opacity:".35"}),(0,e.jsx)("path",{d:"M12,4.5C12,3.119,13.119,2,14.5,2c1.225,0,2.24,0.883,2.454,2.046C18.67,4.271,20,5.723,20,7.5 c0,0.165-0.026,0.323-0.049,0.482C21.188,8.893,22,10.347,22,12s-0.812,3.107-2.049,4.018C19.974,16.177,20,16.335,20,16.5 c0,1.777-1.33,3.229-3.046,3.454C16.74,21.117,15.725,22,14.5,22c-1.381,0-2.5-1.119-2.5-2.5C12,19.352,12,4.654,12,4.5z",opacity:".35"}),(0,e.jsx)("path",{d:"M10,8c0-1.105-0.895-2-2-2S6,6.895,6,8c0,0.738,0.405,1.376,1,1.723V10H2.43C2.15,10.61,2,11.29,2,12h6c0.55,0,1-0.45,1-1 V9.723C9.595,9.376,10,8.738,10,8z"}),(0,e.jsx)("path",{d:"M17,14.277c0.595,0.346,1,0.984,1,1.723c0,1.105-0.895,2-2,2s-2-0.895-2-2c0-0.738,0.405-1.376,1-1.723V13 c0-0.55,0.45-1,1-1h6c0-1.132-0.387-2.165-1.024-3h-3.253c-0.346,0.595-0.984,1-1.723,1c-1.105,0-2-0.895-2-2c0-1.105,0.895-2,2-2 c0.738,0,1.376,0.405,1.723,1h2.231c-0.223-1.542-1.448-2.751-2.999-2.954C16.74,2.883,15.725,2,14.5,2C13.119,2,12,3.119,12,4.5 c0,0.076,0,14.741,0,15c0,1.381,1.119,2.5,2.5,2.5c1.225,0,2.24-0.883,2.454-2.046C18.67,19.729,20,18.277,20,16.5 c0-0.165-0.026-0.323-0.049-0.482c0.702-0.517,1.26-1.213,1.617-2.018H17V14.277z"}),(0,e.jsx)("path",{d:"M8,14c-0.738,0-1.376,0.405-1.723,1H3.03c0.28,0.39,0.63,0.73,1.02,1.02C4.03,16.18,4,16.33,4,16.5 c0,0.17,0.01,0.34,0.04,0.5h2.237C6.624,17.595,7.262,18,8,18c1.105,0,2-0.895,2-2C10,14.895,9.105,14,8,14z"})]})}function St({size:t=14,color:a="currentColor"}){return(0,e.jsxs)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",width:t,height:t,fill:a,children:[(0,e.jsx)("path",{d:"M18,21H6c-1.657,0-3-1.343-3-3v-8c0-1.657,1.343-3,3-3h12c1.657,0,3,1.343,3,3v8 C21,19.657,19.657,21,18,21z",opacity:".35"}),(0,e.jsx)("path",{d:"M8,7c0-2.209,1.791-4,4-4s4,1.791,4,4h2c0-3.314-2.686-6-6-6S6,3.686,6,7H8z"}),(0,e.jsx)("path",{d:"M12,12c-1.105,0-2,0.895-2,2s0.895,2,2,2s2-0.895,2-2S13.105,12,12,12z"})]})}function Ct({size:t=20,color:a="currentColor"}){return(0,e.jsx)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",width:t,height:t,fill:a,children:(0,e.jsx)("path",{d:"M19.483,8.192C18.345,5.161,15.429,3,12,3 c-4.112,0-7.496,3.104-7.945,7.095C1.746,10.538,0,12.562,0,15c0,2.761,2.239,5,5,5h13c3.314,0,6-2.686,6-6 C24,11.199,22.078,8.854,19.483,8.192z",opacity:".35"})})}function We({size:t=20,color:a="currentColor"}){return(0,e.jsxs)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",width:t,height:t,fill:a,children:[(0,e.jsx)("path",{d:"M19.5,4c-0.386,0-6.614,0-7,0C11.672,4,11,4.672,11,5.5S11.672,7,12.5,7c0.386,0,6.614,0,7,0C20.328,7,21,6.328,21,5.5 S20.328,4,19.5,4z"}),(0,e.jsx)("path",{d:"M19.5,11c-0.386,0-6.614,0-7,0c-0.828,0-1.5,0.672-1.5,1.5s0.672,1.5,1.5,1.5c0.386,0,6.614,0,7,0 c0.828,0,1.5-0.672,1.5-1.5S20.328,11,19.5,11z"}),(0,e.jsx)("path",{d:"M19.5,18c-0.386,0-6.614,0-7,0c-0.828,0-1.5,0.672-1.5,1.5s0.672,1.5,1.5,1.5c0.386,0,6.614,0,7,0 c0.828,0,1.5-0.672,1.5-1.5S20.328,18,19.5,18z",opacity:".35"}),(0,e.jsx)("path",{d:"M6,15H5c-1.105,0-2-0.895-2-2v-1c0-1.105,0.895-2,2-2h1c1.105,0,2,0.895,2,2v1C8,14.105,7.105,15,6,15z"}),(0,e.jsx)("path",{d:"M6,8H5C3.895,8,3,7.105,3,6V5c0-1.105,0.895-2,2-2h1c1.105,0,2,0.895,2,2v1C8,7.105,7.105,8,6,8z"}),(0,e.jsx)("path",{d:"M6,22H5c-1.105,0-2-0.895-2-2v-1c0-1.105,0.895-2,2-2h1c1.105,0,2,0.895,2,2v1 C8,21.105,7.105,22,6,22z",opacity:".35"})]})}function da({size:t=14,color:a="currentColor"}){return(0,e.jsx)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",width:t,height:t,fill:a,children:(0,e.jsx)("path",{d:"M18.673,13.092l0.051-0.081l-0.003-0.007C18.894,12.708,19,12.368,19,12c0-0.974-0.697-1.783-1.619-1.962L14,9V4 c0-1.105-0.895-2-2-2c-0.712,0-1.333,0.375-1.688,0.936l-0.005-0.001l-4.944,7.921C5.136,11.18,5,11.573,5,12 c0,0.91,0.611,1.669,1.442,1.911l0.002,0.006L10,15v5c0,1.105,0.895,2,2,2c0.773,0,1.436-0.444,1.769-1.086l4.88-7.785 C18.658,13.117,18.665,13.104,18.673,13.092z",opacity:".35"})})}function ca({status:t}){let a=t==="running"?"amber":t==="error"?"red":"green";return(0,e.jsxs)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",width:40,height:40,children:[(0,e.jsx)("path",{d:"M20,5.344V5c0-0.552-0.448-1-1-1h-0.184C18.403,2.837,17.304,2,16,2H8C6.696,2,5.597,2.837,5.184,4H5C4.448,4,4,4.448,4,5 v0.344c0,0.837,0.395,1.575,1,2.061V10c-0.552,0-1,0.448-1,1v0.344c0,0.837,0.395,1.575,1,2.061V16c-0.552,0-1,0.448-1,1v0.344 c0,0.858,0.414,1.613,1.045,2.098C5.26,20.888,6.495,22,8,22h8c1.505,0,2.74-1.112,2.955-2.558C19.586,18.956,20,18.202,20,17.344 V17c0-0.552-0.448-1-1-1v-2.595c0.605-0.487,1-1.224,1-2.061V11c0-0.552-0.448-1-1-1V7.405C19.605,6.918,20,6.181,20,5.344z",fill:"#333",opacity:"0.6"}),(0,e.jsx)("circle",{cx:"12",cy:"6",r:"2.2",fill:a==="red"?"#ef4444":"#1a1a1a",className:a==="red"?"traffic-light-active":""}),(0,e.jsx)("circle",{cx:"12",cy:"12",r:"2.2",fill:a==="amber"?"#f59e0b":"#1a1a1a",className:a==="amber"?"traffic-light-active":""}),(0,e.jsx)("circle",{cx:"12",cy:"18",r:"2.2",fill:a==="green"?"#22c55e":"#1a1a1a",className:a==="green"?"traffic-light-active":""})]})}var pa=`
/* \u2500\u2500 CSS custom properties (dark default) \u2500\u2500 */
:root {
  --bg-primary: #141414;
  --bg-secondary: #1e1e1e;
  --bg-card: #252525;
  --bg-card-hover: #2e2e2e;
  --bg-terminal: #0d0d0d;
  --border: #333333;
  --border-subtle: #2a2a2a;
  --text-primary: #f0f0f0;
  --text-secondary: #b0b0b0;
  --text-muted: #787878;
  --accent-gray: #6b7280;
  --accent-orange: #e8703a;
  --accent-lavender: #a78bfa;
  --accent-green: #22c55e;
  --accent-red: #ef4444;
}
:root.light {
  --bg-primary: #f8f9fc;
  --bg-secondary: #ffffff;
  --bg-card: #ffffff;
  --bg-card-hover: #f1f3f9;
  --bg-terminal: #f4f5f8;
  --border: #d5d9e2;
  --border-subtle: #e5e8ef;
  --text-primary: #1a1d2e;
  --text-secondary: #4b5568;
  --text-muted: #8493a8;
  --accent-gray: #6b7280;
  --accent-orange: #d4622e;
  --accent-lavender: #7c5cec;
  --accent-green: #16a34a;
  --accent-red: #dc2626;
}

/* \u2500\u2500 Skeleton / ghost loader \u2500\u2500 */
@keyframes shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.skeleton {
  background: linear-gradient(90deg, var(--bg-card) 25%, var(--bg-card-hover) 50%, var(--bg-card) 75%);
  background-size: 800px 100%;
  animation: shimmer 1.4s ease-in-out infinite;
  border-radius: 4px;
}
.skeleton-text { height: 12px; margin-bottom: 6px; }
.skeleton-text.wide { width: 80%; }
.skeleton-text.medium { width: 55%; }
.skeleton-text.narrow { width: 35%; }
.skeleton-block { height: 60px; width: 100%; margin-bottom: 8px; border-radius: 6px; }

/* \u2500\u2500 Spinner \u2500\u2500 */
@keyframes spin { to { transform: rotate(360deg); } }
.spinner {
  width: 20px; height: 20px;
  border: 2px solid var(--border);
  border-top-color: #e8703a;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}
.spinner.sm { width: 14px; height: 14px; border-width: 2px; }
.spinner.lg { width: 28px; height: 28px; border-width: 3px; }

.daemon-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
  font-size: 13px;
}
.daemon-header {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
  gap: 12px;
  flex-shrink: 0;
}
.daemon-header-title {
  font-size: 14px;
  font-weight: 600;
  color: #e8703a;
  letter-spacing: 0.02em;
}
.daemon-header-sub {
  color: var(--text-muted);
  font-size: 12px;
}
@keyframes ticker-in {
  0%   { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes torch-sweep {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}
.ticker-text {
  display: inline-block;
  font-style: italic;
  font-size: 11px;
  letter-spacing: 0.015em;
  /* dark mode: muted \u2192 warm orange \u2192 soft amber \u2192 warm orange \u2192 muted, lazy sweep */
  background: linear-gradient(90deg,
    #787878 0%, #787878 30%,
    #c96030 46%, #e89060 50%, #c96030 54%,
    #787878 70%, #787878 100%
  );
  background-size: 400% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: ticker-in 0.35s cubic-bezier(0.22,1,0.36,1) both,
             torch-sweep 3.2s ease-in-out 0.8s both;
}
.light .ticker-text {
  /* light mode: secondary \u2192 deep orange \u2192 amber \u2192 deep orange \u2192 secondary sweep */
  background: linear-gradient(90deg,
    #6b7280 0%, #6b7280 30%,
    #b83c00 46%, #c2600a 50%, #b83c00 54%,
    #6b7280 70%, #6b7280 100%
  );
  background-size: 400% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.daemon-header-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  flex-shrink: 0;
}
.daemon-header-dot.disconnected {
  background: #ef4444;
}
.daemon-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.daemon-sidebar {
  width: 220px;
  border-right: 1px solid var(--border);
  overflow-y: auto;
  background: var(--bg-primary);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}
.daemon-sidebar-project {
  padding: 14px 14px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-subtle);
  transition: background 0.1s;
  border-left: 3px solid transparent;
}
.daemon-sidebar-project:hover {
  background: var(--bg-secondary);
}
.daemon-sidebar-project.selected {
  background: var(--bg-card);
  border-left-color: #e8703a;
}
.daemon-sidebar-project-name {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 5px;
}
.daemon-sidebar-project-meta {
  color: var(--text-muted);
  font-size: 11px;
  margin-top: 2px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.daemon-sidebar-project-pill {
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.daemon-sidebar-progress {
  height: 2px;
  background: var(--border);
  border-radius: 1px;
  margin-top: 5px;
  overflow: hidden;
}
.daemon-sidebar-progress-fill {
  height: 100%;
  background: #e8703a;
  border-radius: 1px;
  transition: width 0.3s;
}
.daemon-sidebar-add {
  padding: 10px 12px;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  border-top: 1px solid var(--border);
}
.daemon-sidebar-add:hover {
  color: #e8703a;
}
.daemon-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.daemon-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
  padding: 0 16px;
  flex-shrink: 0;
}
.daemon-tab {
  padding: 10px 16px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 12px;
  border-bottom: 2px solid transparent;
  transition: color 0.1s;
  font-weight: 500;
}
.daemon-tab:hover {
  color: var(--text-secondary);
}
.daemon-tab.active {
  color: #e8703a;
  border-bottom-color: #e8703a;
}
/* Tab info pill */
.tab-info-pill { position: relative; display: flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 20px; font-size: 11px; color: var(--text-muted); cursor: default; border: 1px solid transparent; transition: border-color 0.15s, background 0.15s; flex-shrink: 0; }
.tab-info-pill:hover, .tab-info-pill:focus { border-color: var(--border); background: var(--bg-card); outline: none; }
.tab-info-pill-name { font-weight: 600; color: var(--text-secondary); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tab-info-popover { display: none; position: absolute; right: 0; top: calc(100% + 6px); background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; min-width: 260px; box-shadow: 0 8px 24px rgba(0,0,0,0.25); z-index: 200; flex-direction: column; gap: 6px; }
.tab-info-pill:hover .tab-info-popover, .tab-info-pill:focus .tab-info-popover { display: flex; }
.tab-info-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; font-size: 11px; }
.tab-info-row span:first-child { color: var(--text-muted); white-space: nowrap; }
.tab-info-row span:last-child { color: var(--text-secondary); text-align: right; word-break: break-all; }
.daemon-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.daemon-content.chat-content {
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.daemon-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  flex-direction: column;
  gap: 8px;
}
.daemon-empty-title {
  font-size: 14px;
  color: var(--accent-gray);
}
.daemon-empty-sub {
  font-size: 12px;
  color: var(--text-muted);
}
.daemon-section-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
}
.daemon-spec-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}
.daemon-spec-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  transition: border-color 0.1s;
}
.daemon-spec-item:hover {
  border-color: #555555;
}
.daemon-spec-item.selected {
  border-color: #e8703a;
  background: var(--bg-card);
}
.daemon-spec-title {
  font-weight: 500;
  color: var(--text-primary);
  font-size: 12px;
}
.daemon-spec-path {
  color: var(--text-muted);
  font-size: 11px;
  margin-top: 2px;
}
.daemon-spec-headings {
  color: var(--accent-gray);
  font-size: 10px;
  margin-top: 3px;
}
.daemon-btn {
  padding: 6px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  transition: background 0.1s, border-color 0.1s;
}
.daemon-btn:hover:not(:disabled) {
  background: var(--bg-card-hover);
  border-color: #555555;
}
.daemon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.daemon-btn.primary {
  background: rgba(232,112,58,0.2);
  border-color: #e8703a;
  color: #e8703a;
}
.daemon-btn.primary:hover:not(:disabled) {
  background: rgba(232,112,58,0.3);
}
.daemon-btn.danger {
  background: #da3633;
  border-color: #f85149;
  color: #fff;
}
.daemon-btn-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  align-items: center;
}
.daemon-output-log {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 10px;
  height: 280px;
  overflow-y: auto;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
}
.daemon-qa-card {
  background: var(--bg-card);
  border: 1px solid #e8703a;
  border-radius: 6px;
  padding: 14px;
  margin-bottom: 14px;
}
.daemon-qa-label {
  font-size: 11px;
  color: #e8703a;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
}
.daemon-qa-question {
  font-size: 13px;
  color: var(--text-primary);
  margin-bottom: 10px;
  line-height: 1.5;
}
.daemon-qa-input {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 6px 10px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 12px;
  width: 100%;
  margin-bottom: 8px;
  box-sizing: border-box;
}
.daemon-qa-input:focus {
  outline: none;
  border-color: #e8703a;
}
.daemon-plan-summary {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 14px;
}
.daemon-plan-task {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 11px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
}
.daemon-plan-task:last-child {
  border-bottom: none;
}
.daemon-task-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.daemon-run-stat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-secondary);
  margin-right: 6px;
  margin-bottom: 8px;
}
/* Custom model picker */
.model-picker { position: relative; display: inline-block; }
.model-picker-btn { display: flex; align-items: center; gap: 6px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; padding: 5px 10px; cursor: pointer; font-size: 12px; color: var(--text-primary); font-family: inherit; transition: border-color 0.12s; white-space: nowrap; }
.model-picker-btn:hover { border-color: #a78bfa; }
.model-picker-btn .mp-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.model-picker-btn .mp-name { font-weight: 600; }
.model-picker-btn .mp-chevron { font-size: 9px; color: var(--text-muted); margin-left: 2px; }
.model-picker-dropdown { position: absolute; bottom: calc(100% + 6px); left: 0; min-width: 220px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 6px; z-index: 200; box-shadow: 0 8px 32px rgba(0,0,0,0.4); display: flex; flex-direction: column; gap: 3px; }
.model-picker-item { padding: 8px 10px; border-radius: 7px; cursor: pointer; transition: background 0.1s; display: flex; flex-direction: column; gap: 2px; }
.model-picker-item:hover { background: var(--bg-secondary); }
.model-picker-item.selected { background: rgba(167,139,250,0.1); border: 1px solid rgba(167,139,250,0.25); }
.mp-item-header { display: flex; align-items: center; gap: 7px; }
.mp-item-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.mp-item-name { font-size: 12px; font-weight: 700; color: var(--text-primary); flex: 1; }
.mp-item-badge { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 6px; letter-spacing: 0.04em; }
.mp-item-desc { font-size: 10px; color: var(--text-muted); padding-left: 14px; line-height: 1.4; }
.mp-item-meta { display: flex; align-items: center; gap: 8px; padding-left: 14px; margin-top: 1px; }
.mp-item-meta-pill { font-size: 9px; padding: 1px 5px; border-radius: 4px; background: var(--bg-secondary); color: var(--text-muted); border: 1px solid var(--border); }
.daemon-model-select {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 4px 8px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.daemon-pipeline-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  margin-bottom: 6px;
}
.daemon-pipeline-index {
  width: 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 11px;
  flex-shrink: 0;
}
.daemon-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 500;
}
.daemon-no-project {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text-muted);
  font-size: 13px;
}
.chat-sessions-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-bottom: 1px solid var(--border);
  background: var(--bg-secondary); flex-shrink: 0; overflow-x: auto;
}
.chat-session-tab {
  padding: 3px 10px; border-radius: 12px; font-size: 11px;
  cursor: pointer; background: var(--bg-card); border: 1px solid var(--border);
  color: var(--text-secondary); white-space: nowrap; transition: all 0.1s;
}
.chat-session-tab.active {
  background: rgba(232,112,58,0.15); border-color: #e8703a; color: #e8703a;
}
.chat-session-tab:hover:not(.active) { border-color: #555; color: var(--text-primary); }
.chat-filter-bar { display: flex; gap: 4px; padding: 6px 12px; border-bottom: 1px solid var(--border); flex-shrink: 0; background: var(--bg-secondary); }
.chat-filter-chip { padding: 2px 9px; border-radius: 12px; border: 1px solid var(--border); background: none; color: var(--text-muted); font-size: 10px; cursor: pointer; font-family: inherit; transition: all 0.12s; }
.chat-filter-chip:hover { color: var(--text-secondary); border-color: #555; }
.chat-filter-chip.active { background: rgba(148,163,184,0.15); border-color: rgba(148,163,184,0.4); color: var(--text-primary); }
.chat-messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.chat-msg { max-width: 85%; padding: 8px 12px; border-radius: 8px; font-size: 12px; line-height: 1.6; }
.chat-msg.user { align-self: flex-end; background: rgba(59,130,246,0.22); border: 1px solid rgba(59,130,246,0.5); color: var(--text-primary); }
.chat-msg.assistant { align-self: flex-start; background: rgba(232,112,58,0.22); border: 1px solid rgba(232,112,58,0.5); color: var(--text-primary); }
.chat-msg-role { font-size: 10px; margin-bottom: 4px; font-weight: 600; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.chat-msg.user .chat-msg-role { color: #60a5fa; }
.chat-msg.assistant .chat-msg-role { color: #e8703a; }
.chat-msg-ts { font-weight: 400; opacity: 0.5; font-size: 9px; font-family: 'SF Mono', monospace; white-space: nowrap; }
.chat-input-row { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--border); background: var(--bg-secondary); flex-shrink: 0; }
.chat-input { flex: 1; background: var(--bg-primary); border: 1px solid var(--border); color: var(--text-primary); padding: 7px 10px; border-radius: 6px; font-family: inherit; font-size: 12px; resize: none; }
.chat-input:focus { outline: none; border-color: #e8703a; }
.chat-cursor { display: inline-block; width: 8px; height: 14px; background: #a78bfa; animation: blink 1s step-end infinite; vertical-align: text-bottom; margin-left: 2px; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
.chat-hint { font-size: 10px; color: var(--text-muted); padding: 4px 12px; }
.chat-hint kbd { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 3px; padding: 0 4px; font-family: inherit; font-size: 10px; }
/* \u2500\u2500 Slash command autocomplete \u2500\u2500 */
.slash-menu {
  position: absolute; bottom: calc(100% - 2px); left: 0; right: 0;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 6px 6px 0 0; z-index: 100; overflow: hidden;
  box-shadow: 0 -4px 16px rgba(0,0,0,0.2);
}
.slash-menu-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 12px;
  cursor: pointer; font-size: 12px; transition: background 0.1s;
}
.slash-menu-item:hover, .slash-menu-item.active { background: var(--bg-hover); }
.slash-menu-cmd { font-family: 'SF Mono', monospace; font-weight: 600; color: #e8703a; min-width: 80px; }
.slash-menu-usage { font-family: 'SF Mono', monospace; font-size: 11px; color: var(--text-secondary); min-width: 160px; }
.slash-menu-desc { color: var(--text-muted); font-size: 11px; }
/* \u2500\u2500 Memory tab \u2500\u2500 */
.memory-tab { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.memory-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.memory-content {
  flex: 1; overflow: auto; padding: 16px 18px;
  font-family: 'SF Mono', monospace; font-size: 12px; line-height: 1.6;
  color: var(--text-primary); background: var(--bg-primary);
  white-space: pre-wrap; word-break: break-word; margin: 0;
}
.cc-status-bar {
  display: flex; align-items: center; gap: 6px; padding: 5px 12px;
  background: var(--bg-secondary); border-top: 1px solid var(--border);
  font-size: 11px; font-family: 'SF Mono', monospace; color: var(--text-muted);
  flex-shrink: 0; white-space: nowrap; overflow: hidden;
}
.cc-status-bar.active { color: #e8703a; }
.cc-status-asterisk { animation: blink 0.8s step-end infinite; font-weight: 700; }
.light .cc-status-bar { background: var(--bg-secondary); border-top-color: var(--border); }
/* \u2500\u2500 Icon styling \u2500\u2500 */
.daemon-tab { display: flex; align-items: center; gap: 6px; }
.tab-icon { flex-shrink: 0; opacity: 0.7; }
.daemon-tab.active .tab-icon { opacity: 1; }
/* \u2500\u2500 Pulsing dot for running projects \u2500\u2500 */
@keyframes pulse-ring {
  0% { box-shadow: 0 0 0 0 rgba(232,112,58,0.5); }
  70% { box-shadow: 0 0 0 6px rgba(232,112,58,0); }
  100% { box-shadow: 0 0 0 0 rgba(232,112,58,0); }
}
.status-dot-running { animation: pulse-ring 1.5s ease-out infinite; }
/* \u2500\u2500 Source badges \u2500\u2500 */
.session-badge {
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 700; letter-spacing: 0.04em;
  padding: 1px 5px; border-radius: 3px; flex-shrink: 0;
  line-height: 1.4;
}
.session-badge.cc {
  background: rgba(232,112,58,0.2); color: #e8703a; border: 1px solid rgba(232,112,58,0.4);
}
.session-badge.cw {
  background: rgba(167,139,250,0.15); color: #a78bfa; border: 1px solid rgba(167,139,250,0.3);
}
/* \u2500\u2500 Locked session \u2500\u2500 */
.chat-session-item.locked { border-left: 2px solid rgba(239,68,68,0.6); background: rgba(239,68,68,0.04); cursor: pointer; }
.chat-session-item.locked:hover { background: rgba(239,68,68,0.08) !important; }
.chat-session-item.locked .chat-session-name { color: #ef4444; }
.chat-session-item.locked .chat-session-meta { color: rgba(239,68,68,0.6); }
/* \u2500\u2500 Improved sidebar \u2500\u2500 */
.daemon-sidebar-header {
  padding: 8px 12px 6px;
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  border-bottom: 1px solid var(--border-subtle);
}
/* \u2500\u2500 Locked banner \u2500\u2500 */
.locked-banner {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 12px;
  background: rgba(232,112,58,0.08); border-bottom: 1px solid rgba(232,112,58,0.2);
  color: #e8703a; font-size: 11px; flex-shrink: 0;
}
/* \u2500\u2500 Chat sidebar layout \u2500\u2500 */
.chat-layout { display: flex; flex: 1; overflow: hidden; }
.chat-sidebar {
  width: 200px; border-right: 1px solid var(--border-subtle);
  display: flex; flex-direction: column;
  background: var(--bg-primary); flex-shrink: 0;
  overflow: hidden;
}
.chat-sidebar-header {
  padding: 8px 10px 6px;
  font-size: 10px; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.08em;
  border-bottom: 1px solid var(--border-subtle);
  display: flex; align-items: center; justify-content: space-between;
}
.chat-sidebar-list { flex: 1; overflow-y: auto; }
.chat-group-label {
  padding: 6px 10px 3px; font-size: 9px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--text-muted); user-select: none;
}
.chat-compaction-badge {
  font-size: 10px; color: var(--text-muted); cursor: help;
}
.chat-tool-cycle {
  display: flex; flex-direction: column; gap: 2px; align-items: center;
  padding: 2px 0; opacity: 0.85;
}
.chat-load-earlier {
  display: flex; align-items: center; gap: 6px; justify-content: center;
  padding: 8px; font-size: 11px; color: var(--text-muted);
  cursor: pointer; border-bottom: 1px solid var(--border-subtle);
  margin-bottom: 8px;
}
.chat-load-earlier:hover { color: var(--text-secondary); }
.chat-segment-divider {
  display: flex; align-items: center; gap: 8px;
  font-size: 9px; color: var(--text-muted); text-transform: uppercase;
  letter-spacing: 0.08em; padding: 4px 0; margin: 4px 0;
}
.chat-segment-divider::before, .chat-segment-divider::after {
  content: ''; flex: 1; height: 1px; background: var(--border-subtle);
}
.chat-segment-divider span { cursor: help; }
.chat-session-item {
  padding: 10px 12px; cursor: pointer;
  border-bottom: 1px solid var(--border-subtle);
  transition: background 0.1s;
  position: relative;
}
.chat-session-item:hover { background: var(--bg-secondary); }
.chat-session-item.active { background: var(--bg-card); border-left: 2px solid #a78bfa; }
.chat-session-item-top {
  display: flex; align-items: center; gap: 5px; margin-bottom: 3px;
}
.chat-session-name {
  font-size: 11px; color: var(--text-primary); font-weight: 500;
  overflow: hidden; text-overflow: ellipsis;
  flex: 1;
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.chat-session-meta {
  font-size: 10px; color: var(--text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.chat-session-delete {
  position: absolute; right: 6px; top: 6px;
  background: none; border: none; color: var(--text-muted);
  cursor: pointer; font-size: 14px; line-height: 1;
  padding: 2px 4px; border-radius: 3px;
  opacity: 0; transition: opacity 0.1s, color 0.1s;
}
.chat-session-item:hover .chat-session-delete { opacity: 1; }
.chat-session-delete:hover { color: #ef4444; }
.chat-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.chat-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-secondary);
  display: flex; align-items: center; gap: 8px;
  flex-shrink: 0;
}
.chat-title-input {
  background: transparent; border: none; color: var(--text-primary);
  font-family: inherit; font-size: 13px; font-weight: 600;
  flex: 1; cursor: pointer; padding: 2px 4px;
  border-radius: 3px;
}
.chat-title-input:hover { background: var(--bg-card); }
.chat-title-input:focus { outline: 1px solid #e8703a; background: var(--bg-card); cursor: text; }
.chat-new-btn {
  padding: 4px 10px;
  background: rgba(167,139,250,0.12); border: 1px solid rgba(167,139,250,0.3);
  color: #a78bfa; border-radius: 4px; cursor: pointer;
  font-size: 11px; font-family: inherit;
  transition: background 0.1s;
}
.chat-new-btn:hover { background: rgba(167,139,250,0.2); }
/* \u2500\u2500 Empty state with icon \u2500\u2500 */
.daemon-empty-icon { opacity: 0.3; margin-bottom: 12px; }
/* \u2500\u2500 Header improvement \u2500\u2500 */
.daemon-header-badge {
  padding: 2px 7px; background: rgba(232,112,58,0.15);
  border: 1px solid rgba(232,112,58,0.3); border-radius: 3px;
  font-size: 10px; color: #e8703a; font-weight: 600; letter-spacing: 0.04em;
}
/* \u2500\u2500 Plan search bar \u2500\u2500 */
.plan-search-input {
  width: 100%; padding: 7px 32px 7px 10px;
  background: var(--bg-secondary); border: 1px solid var(--border);
  border-radius: 6px; color: var(--text-primary);
  font-family: inherit; font-size: 12px;
  outline: none; box-sizing: border-box;
  transition: border-color 0.15s;
}
.plan-search-input:focus { border-color: #e8703a; }
.plan-search-input::placeholder { color: var(--text-muted); }
.plan-search-chips {
  display: flex; flex-wrap: wrap; gap: 5px;
}
.plan-search-chip {
  padding: 3px 9px; border-radius: 12px; font-size: 11px;
  cursor: pointer; background: var(--bg-secondary);
  border: 1px solid var(--border); color: var(--text-secondary);
  font-family: inherit; transition: all 0.1s; white-space: nowrap;
}
.plan-search-chip:hover { border-color: #e8703a; color: #e8703a; }
.plan-search-chip.active {
  background: rgba(232,112,58,0.15); border-color: #e8703a; color: #e8703a;
}
/* \u2500\u2500 Tool blocks \u2500\u2500 */
.chat-msg-blocks { display: flex; flex-direction: column; gap: 3px; }
.tool-block {
  display: flex; align-items: flex-start; gap: 5px;
  padding: 4px 7px; border-radius: 4px; cursor: pointer;
  font-size: 11px; line-height: 1.4; font-family: 'SF Mono', 'Cascadia Code', monospace;
  flex-wrap: wrap;
}
.tool-block.tool-call {
  background: rgba(148,163,184,0.08); border: 1px solid rgba(148,163,184,0.2);
  color: var(--text-secondary); border-radius: 20px; max-width: 75%;
}
.tool-block.tool-call:hover { background: rgba(148,163,184,0.14); }
.tool-block.tool-result {
  background: rgba(148,163,184,0.06); border: 1px solid rgba(148,163,184,0.15);
  color: var(--text-muted); border-radius: 20px; max-width: 75%;
}
.tool-block.tool-result.error {
  background: rgba(239,68,68,0.06); border-color: rgba(239,68,68,0.2); color: #ef4444;
}
.tool-block.tool-result:hover { background: rgba(148,163,184,0.10); }
.tool-block-header { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; }
.tool-block-icon { flex-shrink: 0; }
.tool-block-name { color: rgba(148,163,184,0.9); font-weight: 600; flex-shrink: 0; }
.tool-block-preview { color: var(--text-muted); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.tool-block-toggle { color: var(--text-muted); flex-shrink: 0; margin-left: auto; }
.tool-block-expanded { width: 100%; margin-top: 4px; }
.tool-block-code {
  margin: 0; padding: 8px 10px; width: 100%; box-sizing: border-box;
  background: var(--bg-primary); border-radius: 4px; border: 1px solid var(--border);
  font-size: 10.5px; font-family: 'SF Mono', 'Fira Code', monospace;
  color: var(--text-secondary); white-space: pre-wrap; word-break: break-all;
  overflow-y: auto; max-height: 400px; line-height: 1.5;
}
.tool-block-code.bash { color: #86efac; }
/* \u2500\u2500 Dashboard tab \u2500\u2500 */
.dashboard-tab { padding: 20px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
.dashboard-hero { padding: 16px 18px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; }
.dashboard-hero-name { font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 3px; }
.dashboard-hero-path { font-size: 11px; color: var(--text-muted); font-family: 'SF Mono', monospace; margin-bottom: 6px; }
.dashboard-hero-status { font-size: 12px; font-weight: 600; }
.dashboard-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.dashboard-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
  padding: 14px 16px; cursor: default; transition: border-color 0.15s;
  display: flex; flex-direction: column; gap: 2px;
}
.dashboard-card[title] { cursor: pointer; }
.dashboard-card[title]:hover { border-color: #a78bfa; }
.dashboard-card-icon { margin-bottom: 6px; opacity: 0.85; }
.dashboard-card-value { font-size: 26px; font-weight: 700; color: var(--text-primary); line-height: 1; }
.dashboard-card-label { font-size: 11px; color: var(--text-secondary); font-weight: 500; margin-top: 2px; }
.dashboard-card-sub { font-size: 10px; color: var(--text-muted); margin-top: 1px; }
.dashboard-live-banner {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px;
  background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.25);
  border-radius: 6px; font-size: 12px; color: var(--text-secondary); cursor: pointer;
}
.dashboard-live-banner:hover { background: rgba(239,68,68,0.12); }
.dashboard-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.dashboard-actions .daemon-btn { display: flex; align-items: center; gap: 5px; }
/* Traffic light animation */
@keyframes traffic-pulse {
  0%, 100% { opacity: 1; filter: drop-shadow(0 0 3px currentColor); }
  50% { opacity: 0.6; filter: drop-shadow(0 0 8px currentColor); }
}
@keyframes traffic-pulse-fast {
  0%, 100% { opacity: 1; filter: drop-shadow(0 0 4px currentColor); }
  50% { opacity: 0.5; filter: drop-shadow(0 0 12px currentColor); }
}
.traffic-light-active {
  animation: traffic-pulse 2s ease-in-out infinite;
}
/* faster pulse for running */
circle.traffic-light-active[fill="#f59e0b"] {
  animation: traffic-pulse-fast 1s ease-in-out infinite;
}
/* History tab */
.history-tab { display: flex; flex-direction: column; height: 100%; overflow-y: auto; }
.history-header { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--border); font-size: 12px; font-weight: 600; color: var(--text-secondary); flex-shrink: 0; }
.history-group { }
.history-group-label { padding: 8px 16px 4px; font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
.history-run-card { margin: 0 12px 6px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--bg-card); }
.history-run-header { display: flex; align-items: center; gap: 10px; padding: 12px 14px; cursor: pointer; transition: background 0.1s; }
.history-run-header:hover { background: var(--bg-secondary); }
.history-run-icon { flex-shrink: 0; }
.history-run-info { flex: 1; min-width: 0; }
.history-run-name { font-size: 12px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: capitalize; }
.history-run-meta { display: flex; align-items: center; gap: 6px; margin-top: 2px; font-size: 10px; color: var(--text-muted); }
.history-run-badge { padding: 1px 6px; border-radius: 8px; font-size: 9px; font-weight: 700; letter-spacing: 0.04em; }
.history-run-badge.pipeline { background: rgba(167,139,250,0.15); color: #a78bfa; border: 1px solid rgba(167,139,250,0.25); }
.history-run-toggle { color: var(--text-muted); flex-shrink: 0; }
.history-run-log { padding: 10px 14px; background: var(--bg-primary); border-top: 1px solid var(--border); font-size: 10px; font-family: 'SF Mono', monospace; color: var(--text-secondary); white-space: pre-wrap; max-height: 300px; overflow-y: auto; word-break: break-all; }
/* \u2500\u2500 Light theme overrides \u2500\u2500 */
.light .daemon-root,
.light .daemon-header,
.light .daemon-sidebar,
.light .daemon-main,
.light .daemon-tabs,
.light .chat-sidebar,
.light .chat-main,
.light .chat-header {
  color-scheme: light;
}
.light .daemon-root { background: var(--bg-primary); color: var(--text-primary); }
.light .daemon-header { background: var(--bg-secondary); border-bottom-color: var(--border); }
.light .daemon-sidebar { background: var(--bg-primary); border-right-color: var(--border); }
.light .daemon-sidebar-project { border-bottom-color: var(--border-subtle); }
.light .daemon-sidebar-project:hover { background: var(--bg-secondary); }
.light .daemon-sidebar-project.selected { background: var(--bg-card); }
.light .daemon-tabs { background: var(--bg-secondary); border-bottom-color: var(--border); }
.light .daemon-content { background: var(--bg-primary); }
.light .daemon-spec-item { background: var(--bg-secondary); border-color: var(--border); }
.light .daemon-spec-item:hover { border-color: var(--accent-orange); }
.light .daemon-output-log { background: var(--bg-secondary); border-color: var(--border); color: var(--text-secondary); }
.light .daemon-btn { background: var(--bg-card); border-color: var(--border); color: var(--text-primary); }
.light .daemon-btn:hover:not(:disabled) { background: var(--bg-card-hover); }
.light .daemon-model-select { background: var(--bg-secondary); border-color: var(--border); color: var(--text-primary); }
.light .daemon-pipeline-item { background: var(--bg-secondary); border-color: var(--border); }
.light .daemon-plan-summary { background: var(--bg-secondary); border-color: var(--border); }
.light .daemon-run-stat { background: var(--bg-secondary); border-color: var(--border); color: var(--text-secondary); }
.light .daemon-qa-card { background: var(--bg-card); }
.light .daemon-qa-input { background: var(--bg-primary); border-color: var(--border); color: var(--text-primary); }
.light .chat-sidebar { background: var(--bg-primary); border-right-color: var(--border); }
.light .chat-session-item { border-bottom-color: var(--border-subtle); }
.light .chat-session-item:hover { background: var(--bg-secondary); }
.light .chat-session-item.active { background: var(--bg-card); }
.light .chat-header { background: var(--bg-secondary); border-bottom-color: var(--border); }
.light .chat-messages { background: var(--bg-primary); }
.light .chat-input-row { background: var(--bg-secondary); border-top-color: var(--border); }
.light .chat-input { background: var(--bg-primary); border-color: var(--border); color: var(--text-primary); }
.light .chat-msg.user { background: rgba(59,130,246,0.15); }
.light .chat-msg.assistant { background: rgba(232,112,58,0.15); }
.light .locked-banner { background: rgba(232,112,58,0.06); }
/* Build tab */
.build-tab { display: flex; height: 100%; overflow: hidden; }
.build-left { width: 40%; border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
.build-right { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-primary); }
.build-section-header { padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--bg-secondary); display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); flex-shrink: 0; }
.build-left-body { flex: 1; overflow-y: auto; padding: 10px; }
.spec-drag-card { display: flex; align-items: flex-start; gap: 6px; padding: 7px 8px; border-radius: 5px; border: 1px solid var(--border); background: var(--bg-card); margin-bottom: 5px; cursor: grab; transition: border-color 0.12s, box-shadow 0.12s; user-select: none; }
.spec-drag-card:hover { border-color: #a78bfa; box-shadow: 0 0 0 1px rgba(167,139,250,0.2); }
.spec-drag-card.in-chain { border-color: rgba(34,197,94,0.4); background: rgba(34,197,94,0.04); }
.spec-drag-card.spec-card-oversized { border-color: rgba(248,113,113,0.35); background: rgba(248,113,113,0.04); }
.spec-drag-card.spec-card-oversized:hover { border-color: #f87171; }
.spec-drag-card.dragging { opacity: 0.4; }
.spec-drag-handle { color: var(--text-muted); font-size: 13px; cursor: grab; flex-shrink: 0; line-height: 1; padding-top: 1px; }
.spec-card-title { font-size: 11px; font-weight: 600; color: var(--text-primary); line-height: 1.3; }
.spec-card-path { font-size: 10px; color: var(--text-muted); margin-top: 1px; }
.chain-canvas { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; align-items: center; }
.chain-name-row { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.chain-name-input { background: none; border: none; color: var(--text-primary); font-size: 13px; font-weight: 600; outline: none; flex: 1; }
.chain-name-input::placeholder { color: var(--text-muted); font-weight: 400; }
.chain-empty-drop { width: 100%; max-width: 340px; border: 2px dashed var(--border); border-radius: 10px; padding: 32px 20px; text-align: center; color: var(--text-muted); font-size: 12px; transition: border-color 0.15s, background 0.15s; }
.chain-empty-drop.drag-over { border-color: #a78bfa; background: rgba(167,139,250,0.06); color: var(--text-secondary); }
.chain-step-wrapper { display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 340px; }
.chain-drop-zone { width: 100%; height: 20px; border-radius: 4px; transition: background 0.12s, height 0.12s; display: flex; align-items: center; justify-content: center; }
.chain-drop-zone.drag-over { height: 36px; background: rgba(167,139,250,0.1); border: 1px dashed #a78bfa; }
.chain-step-card { width: 100%; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; display: flex; align-items: center; gap: 8px; cursor: default; transition: border-color 0.12s; position: relative; }
.chain-step-card:hover { border-color: #a78bfa; }
.chain-step-card.dragging { opacity: 0.3; }
.chain-step-num { width: 20px; height: 20px; border-radius: 50%; background: rgba(167,139,250,0.2); color: #a78bfa; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.chain-step-drag { color: var(--text-muted); cursor: grab; flex-shrink: 0; font-size: 14px; }
.chain-step-info { flex: 1; min-width: 0; }
.chain-step-title { font-size: 11px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chain-step-type { font-size: 10px; color: var(--text-muted); }
.chain-step-delete { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 14px; opacity: 0; transition: opacity 0.1s; padding: 2px 4px; }
.chain-step-card:hover .chain-step-delete { opacity: 1; }
.chain-step-delete:hover { color: #ef4444; }
.chain-connector { display: flex; flex-direction: column; align-items: center; color: var(--text-muted); gap: 0; }
.chain-connector-line { width: 2px; height: 16px; background: var(--border); }
.chain-connector-arrow { font-size: 10px; color: var(--border); }
.chain-step-type-select { background: none; border: none; color: var(--text-muted); font-size: 10px; cursor: pointer; padding: 0; outline: none; }
.chain-footer { padding: 10px 14px; border-top: 1px solid var(--border); display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
/* Saved plans panel */
.plan-split { display: flex; height: 100%; overflow: hidden; }
.plan-left { flex: 1; display: flex; flex-direction: column; overflow: hidden; border-right: 1px solid var(--border); }
.plan-right { width: 280px; display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0; }
.plan-right-header { padding: 10px 12px; border-bottom: 1px solid var(--border); background: var(--bg-secondary); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.plan-right-body { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.saved-plan-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; cursor: default; transition: border-color 0.12s; position: relative; }
.saved-plan-card:hover { border-color: #a78bfa; }
.saved-plan-name { font-size: 12px; font-weight: 700; color: var(--text-primary); margin-bottom: 3px; }
.saved-plan-goal { font-size: 10px; color: var(--text-muted); margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.saved-plan-footer { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.saved-plan-badge { padding: 1px 6px; border-radius: 8px; font-size: 9px; font-weight: 700; background: rgba(167,139,250,0.12); color: #a78bfa; border: 1px solid rgba(167,139,250,0.2); }
.saved-plan-status { font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 8px; }
.saved-plan-status.ready { background: rgba(34,197,94,0.1); color: #22c55e; border: 1px solid rgba(34,197,94,0.2); }
.saved-plan-status.running { background: rgba(232,112,58,0.1); color: #e8703a; border: 1px solid rgba(232,112,58,0.2); }
.saved-plan-status.completed { background: rgba(34,197,94,0.1); color: #22c55e; border: 1px solid rgba(34,197,94,0.2); }
.saved-plan-status.failed { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); }
.saved-plan-time { font-size: 10px; color: var(--text-muted); }
.saved-plan-delete { position: absolute; right: 6px; top: 6px; background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 14px; opacity: 0; transition: opacity 0.1s; padding: 2px 5px; }
.saved-plan-card:hover .saved-plan-delete { opacity: 1; }
.saved-plan-delete:hover { color: #ef4444; }
/* Plan name input */
.plan-name-row { padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--bg-secondary); display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.plan-name-input { flex: 1; background: var(--bg-card); border: 1px solid var(--border); border-radius: 5px; padding: 5px 8px; font-size: 12px; color: var(--text-primary); outline: none; font-family: inherit; }
.plan-name-input:focus { border-color: #a78bfa; }
.plan-name-input::placeholder { color: var(--text-muted); }
/* OutputLog fill mode */
.output-panel-fill { display: flex; flex-direction: column; flex: 1; overflow: hidden; border: none; border-radius: 0; }
.output-panel-fill .output-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.output-panel-fill .output-log { flex: 1; overflow-y: auto; }
/* Plan chat view \u2014 replaces split during planning */
.plan-chat-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.plan-chat-header { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--bg-secondary); flex-shrink: 0; }
.plan-chat-back { background: none; border: 1px solid var(--border); border-radius: 5px; color: var(--text-muted); font-size: 11px; cursor: pointer; padding: 3px 8px; }
.plan-chat-back:hover { color: var(--text-primary); border-color: var(--text-muted); }
.plan-chat-title { font-size: 12px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 6px; }
.plan-chat-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.plan-chat-input-area { flex-shrink: 0; border-top: 1px solid var(--border); }
/* Planning status body \u2014 replaces output log */
.plan-status-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 24px; gap: 24px; }
.plan-status-working { display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center; }
.plan-status-label { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.plan-status-sub { font-size: 12px; color: var(--text-muted); }
.plan-status-error { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #f87171; font-size: 13px; text-align: center; }
/* Planning progress log */
.plan-log-list { width: 100%; max-width: 520px; max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.plan-log-line { font-size: 11px; font-family: monospace; padding: 2px 0; color: var(--text-muted); white-space: pre-wrap; word-break: break-word; }
.plan-log-line.warn { color: #fb923c; }
.plan-log-line.error { color: #f87171; }
/* Question card */
.plan-question-card { width: 100%; max-width: 480px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
.plan-question-badge { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #a78bfa; }
.plan-question-text { font-size: 14px; font-weight: 600; color: var(--text-primary); line-height: 1.5; }
.plan-question-input { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; font-size: 13px; color: var(--text-primary); font-family: inherit; resize: vertical; outline: none; }
.plan-question-input:focus { border-color: #a78bfa; }
.plan-question-actions { display: flex; gap: 8px; }
.plan-question-timeout { font-size: 10px; color: var(--text-muted); }
/* Completed plan task list */
.plan-result { width: 100%; max-width: 520px; display: flex; flex-direction: column; gap: 12px; }
.plan-result-header { display: flex; align-items: baseline; gap: 10px; }
.plan-result-count { font-size: 22px; font-weight: 800; color: #22c55e; }
.plan-result-goal { font-size: 13px; color: var(--text-muted); }
.plan-result-tasks { display: flex; flex-direction: column; gap: 4px; }
.plan-result-task { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; }
.plan-result-task-num { font-size: 10px; font-weight: 700; color: var(--text-muted); min-width: 16px; }
.plan-result-task-title { font-size: 12px; color: var(--text-primary); }
.plan-result-actions { margin-top: 4px; }
/* Q&A choice chips */
.plan-qa-choices { padding: 10px 12px 0; }
.plan-qa-question { font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; font-weight: 600; }
.plan-qa-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.plan-qa-chip { background: rgba(232,112,58,0.1); border: 1px solid rgba(232,112,58,0.4); color: #e8703a; border-radius: 20px; padding: 5px 14px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.12s, transform 0.1s; }
.plan-qa-chip:hover { background: rgba(232,112,58,0.2); transform: translateY(-1px); }
/* Planning working state bar */
.plan-working-bar { padding: 10px 14px; display: flex; flex-direction: column; gap: 6px; }
.plan-working-status { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); }
.plan-guidance-details summary { font-size: 11px; color: var(--text-muted); cursor: pointer; user-select: none; opacity: 0.7; }
.plan-guidance-details summary:hover { opacity: 1; color: var(--text-secondary); }
.plan-guidance-details[open] summary { opacity: 1; margin-bottom: 6px; }
/* Plan action footer \u2014 sticky bottom of left panel */
.plan-action-footer { flex-shrink: 0; border-top: 1px solid var(--border); background: var(--bg-secondary); padding: 10px 12px; display: flex; flex-direction: column; gap: 7px; }
.plan-action-footer-idle { display: flex; align-items: center; justify-content: center; padding: 8px 0; font-size: 11px; color: var(--text-muted); }
.plan-size-error { display: flex; flex-direction: column; gap: 2px; padding: 6px 8px; background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.25); border-radius: 5px; font-size: 11px; color: #f87171; }
.plan-action-name-input { background: var(--bg-card); border: 1px solid var(--border); border-radius: 5px; padding: 5px 10px; font-size: 11px; color: var(--text-primary); outline: none; font-family: inherit; width: 100%; box-sizing: border-box; }
.plan-action-name-input:focus { border-color: #a78bfa; }
.plan-action-name-input::placeholder { color: var(--text-muted); }
.plan-action-btn-row { display: flex; gap: 6px; align-items: center; }
.plan-action-btn { flex: 1; background: linear-gradient(135deg, #e8703a 0%, #e85c3a 100%); color: #fff; border: none; border-radius: 6px; padding: 9px 14px; font-size: 13px; font-weight: 700; cursor: pointer; transition: opacity 0.15s, transform 0.1s; letter-spacing: 0.01em; }
.plan-action-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.plan-action-btn:active:not(:disabled) { transform: translateY(0); }
.plan-action-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
.plan-action-btn.planning { background: linear-gradient(135deg, #a78bfa 0%, #7c5fa3 100%); }
.plan-stop-btn { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; padding: 9px 12px; font-size: 12px; font-weight: 700; cursor: pointer; transition: background 0.12s; flex-shrink: 0; }
.plan-stop-btn:hover { background: rgba(239,68,68,0.2); }
.plan-spec-chip { display: inline-flex; align-items: center; gap: 3px; background: rgba(139,92,246,0.1); border: 1px solid rgba(139,92,246,0.25); border-radius: 10px; padding: 1px 8px; font-size: 10px; color: #a78bfa; font-weight: 600; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: default; }
/* Register project dialog */
.register-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999; }
.register-dialog { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; width: 440px; max-width: calc(100vw - 40px); display: flex; flex-direction: column; gap: 6px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
.register-dialog-title { font-size: 15px; font-weight: 700; color: var(--text-primary); margin-bottom: 2px; }
.register-dialog-sub { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; line-height: 1.5; }
.register-dialog-sub code { background: var(--bg-secondary); border-radius: 3px; padding: 1px 5px; font-size: 11px; color: var(--text-secondary); }
.register-dialog-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-top: 4px; }
.register-dialog-input { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 7px; padding: 9px 12px; font-size: 13px; color: var(--text-primary); outline: none; font-family: 'SF Mono', monospace; }
.register-dialog-input:focus { border-color: rgba(139,92,246,0.5); }
.register-dialog-error { font-size: 11px; color: #ef4444; margin-top: 4px; }
.register-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.plan-selection-count { font-size: 10px; color: var(--text-muted); display: flex; align-items: center; gap: 6px; }
.plan-selection-clear { background: none; border: none; color: #a78bfa; font-size: 10px; cursor: pointer; padding: 0; text-decoration: underline; }
.plan-selection-clear:hover { color: #c4b5fd; }
/* Run tab split */
.run-split { display: flex; height: 100%; overflow: hidden; }
.run-left { width: 260px; flex-shrink: 0; border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
.run-right { flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 16px; gap: 12px; }
.run-left-header { padding: 10px 12px; border-bottom: 1px solid var(--border); background: var(--bg-secondary); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); flex-shrink: 0; }
.run-left-body { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 5px; }
.run-plan-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; display: flex; align-items: center; gap: 7px; cursor: grab; transition: border-color 0.12s; user-select: none; }
.run-plan-card:hover { border-color: #a78bfa; }
.run-plan-card.in-chain { border-color: rgba(34,197,94,0.35); }
.run-plan-drag-handle { color: var(--text-muted); font-size: 13px; flex-shrink: 0; }
.run-plan-info { flex: 1; min-width: 0; }
.run-plan-name { font-size: 11px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.run-plan-tasks { font-size: 10px; color: var(--text-muted); }
/* Traffic light section */
.run-traffic-light { display: flex; align-items: center; gap: 16px; padding: 14px 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; }
.run-traffic-status-text { }
.run-traffic-title { font-size: 15px; font-weight: 700; color: var(--text-primary); margin-bottom: 3px; }
.run-traffic-sub { font-size: 11px; color: var(--text-muted); }
/* Run progress view */
.run-progress-view { display: flex; flex-direction: column; height: 100%; overflow: hidden; background: var(--bg-primary); }
.run-progress-hero { display: flex; align-items: center; gap: 20px; padding: 20px 20px 16px; flex-shrink: 0; }
.run-progress-ring-wrap { position: relative; width: 100px; height: 100px; flex-shrink: 0; }
.run-progress-ring-wrap svg { transform: rotate(-90deg); }
.run-progress-ring-bg { fill: none; stroke: var(--border); stroke-width: 6; }
.run-progress-ring-fill { fill: none; stroke: #a78bfa; stroke-width: 6; stroke-linecap: round; transition: stroke-dashoffset 0.6s cubic-bezier(.4,0,.2,1); }
.run-progress-ring-fill.complete { stroke: #22c55e; }
.run-progress-ring-fill.failed { stroke: #ef4444; }
.run-progress-ring-pct { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.run-progress-info { flex: 1; min-width: 0; }
.run-progress-headline { font-size: 18px; font-weight: 800; color: var(--text-primary); margin-bottom: 4px; letter-spacing: -0.3px; }
.run-progress-subline { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }
.run-progress-bar-wrap { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
.run-progress-bar { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #7c3aed, #a78bfa, #c084fc); background-size: 200% 100%; transition: width 0.6s cubic-bezier(.4,0,.2,1); }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.run-progress-bar.running { animation: shimmer 2s linear infinite; }
.run-progress-bar.complete { background: linear-gradient(90deg, #16a34a, #22c55e); animation: none; }
.run-progress-bar.failed { background: #ef4444; animation: none; }
.run-task-list { flex: 1; overflow-y: auto; padding: 0 16px 10px; display: flex; flex-direction: column; gap: 6px; }
.run-task-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; background: var(--bg-card); border: 1px solid var(--border); font-size: 12px; transition: all 0.3s ease; border-left: 3px solid transparent; }
.run-task-item.run-task-completed { border-left-color: #22c55e; opacity: 0.75; }
.run-task-item.run-task-failed { border-left-color: #ef4444; background: rgba(239,68,68,0.04); }
@keyframes task-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(167,139,250,0.15), 0 0 0 0 rgba(167,139,250,0.1); border-left-color: #a78bfa; } 50% { box-shadow: 0 0 12px 2px rgba(167,139,250,0.12), 0 0 0 0 rgba(167,139,250,0); border-left-color: #c084fc; } }
.run-task-item.run-task-in_progress { border-left-color: #a78bfa; background: rgba(167,139,250,0.06); animation: task-pulse 2s ease-in-out infinite; }
.run-task-item.run-task-skipped { opacity: 0.45; }
.run-task-icon-wrap { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; }
.run-task-icon-wrap.status-completed { background: rgba(34,197,94,0.15); color: #22c55e; }
.run-task-icon-wrap.status-failed { background: rgba(239,68,68,0.15); color: #ef4444; }
.run-task-icon-wrap.status-in_progress { background: rgba(167,139,250,0.2); color: #a78bfa; }
.run-task-icon-wrap.status-pending { background: var(--bg-secondary); color: var(--text-muted); }
.run-task-icon-wrap.status-skipped { background: var(--bg-secondary); color: var(--text-muted); }
@keyframes spin-icon { to { transform: rotate(360deg); } }
.run-task-icon-wrap.status-in_progress .spin { display: inline-block; animation: spin-icon 1s linear infinite; }
.run-task-title { flex: 1; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
.run-task-item.run-task-completed .run-task-title { color: var(--text-muted); font-weight: 400; }
.run-task-item.run-task-skipped .run-task-title { color: var(--text-muted); font-weight: 400; }
.run-task-status-label { font-size: 9px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-muted); flex-shrink: 0; }
.run-task-item.run-task-in_progress .run-task-status-label { color: #a78bfa; }
.run-task-item.run-task-completed .run-task-status-label { color: #22c55e; }
.run-task-item.run-task-failed .run-task-status-label { color: #ef4444; }
.run-task-retry-btn { font-size: 10px; padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(239,68,68,0.4); background: none; color: #ef4444; cursor: pointer; flex-shrink: 0; }
.run-task-retry-btn:hover { background: rgba(239,68,68,0.08); }
.run-task-expand-btn { font-size: 10px; width: 18px; text-align: center; color: var(--text-muted); cursor: pointer; flex-shrink: 0; transition: transform 0.15s; user-select: none; }
.run-task-expand-btn.open { transform: rotate(90deg); }
.run-task-detail { padding: 10px 12px 12px 44px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 8px; }
.run-task-detail-section { }
.run-task-detail-label { font-size: 9px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 3px; }
.run-task-detail-text { line-height: 1.5; color: var(--text-secondary); white-space: pre-wrap; }
.run-task-detail-files { display: flex; flex-wrap: wrap; gap: 4px; }
.run-task-detail-file { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 3px; padding: 1px 6px; font-family: 'SF Mono', monospace; font-size: 9px; color: var(--text-muted); }
.run-task-detail-criteria { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 3px; }
.run-task-detail-criteria li { display: flex; gap: 6px; align-items: flex-start; }
.run-task-detail-criteria li::before { content: '\xB7'; color: #a78bfa; flex-shrink: 0; }
/* Live output terminal */
.run-task-live-output { background: #0a0a0f; border: 1px solid rgba(139,92,246,0.2); border-radius: 6px; padding: 8px 10px; max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; scroll-behavior: smooth; }
.run-task-live-line { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 10px; color: #c4c4d0; line-height: 1.4; word-break: break-all; white-space: pre-wrap; }
.run-task-live-line:last-child { color: #a78bfa; }
/* Question banner */
.run-question-banner { margin: 0 12px 8px; background: rgba(245,158,11,0.08); border: 1.5px solid rgba(245,158,11,0.5); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; animation: pulse-border 1.5s ease-in-out infinite; }
@keyframes pulse-border { 0%,100% { border-color: rgba(245,158,11,0.5); } 50% { border-color: rgba(245,158,11,0.95); box-shadow: 0 0 12px rgba(245,158,11,0.25); } }
.run-question-banner-header { display: flex; align-items: center; gap: 8px; }
.run-question-banner-icon { font-size: 16px; }
.run-question-banner-title { flex: 1; font-size: 12px; font-weight: 700; color: #f59e0b; }
.run-question-banner-timer { font-size: 11px; font-weight: 700; color: #f59e0b; background: rgba(245,158,11,0.15); border-radius: 10px; padding: 2px 8px; }
.run-question-banner-text { font-size: 12px; color: var(--text-primary); line-height: 1.5; }
.run-question-banner-options { display: flex; flex-wrap: wrap; gap: 6px; }
.run-question-option { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; padding: 5px 12px; font-size: 11px; color: var(--text-secondary); cursor: pointer; transition: all 0.15s; }
.run-question-option:hover { border-color: #f59e0b; color: #f59e0b; }
.run-question-option.selected { background: rgba(245,158,11,0.15); border-color: #f59e0b; color: #f59e0b; font-weight: 600; }
.run-question-input { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; padding: 7px 10px; font-size: 12px; color: var(--text-primary); outline: none; width: 100%; box-sizing: border-box; }
.run-question-input:focus { border-color: #f59e0b; }
.run-question-submit { align-self: flex-start; background: #f59e0b; color: #000; border: none; border-radius: 6px; padding: 6px 14px; font-size: 11px; font-weight: 700; cursor: pointer; }
.run-question-submit:hover { background: #fbbf24; }
/* Stuck task banner */
.run-stuck-banner { margin: 0 12px 8px; background: rgba(245,158,11,0.06); border: 1px solid rgba(245,158,11,0.3); border-radius: 8px; padding: 10px 14px; display: flex; align-items: center; gap: 10px; font-size: 11px; color: #f59e0b; }
.run-stuck-banner span { flex: 1; }
.run-stuck-reset-btn { background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.4); border-radius: 6px; padding: 4px 10px; font-size: 11px; color: #f59e0b; cursor: pointer; white-space: nowrap; }
.run-stuck-reset-btn:hover { background: rgba(245,158,11,0.25); }
.run-progress-footer { padding: 12px 16px; border-top: 1px solid var(--border); display: flex; gap: 8px; align-items: center; flex-shrink: 0; flex-wrap: wrap; }
@keyframes celebrate { 0% { transform: scale(0.8); opacity: 0; } 60% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }
.run-complete-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.3); border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 700; color: #22c55e; animation: celebrate 0.4s ease-out; }
.run-failed-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 700; color: #ef4444; }
/* Activity badge */
.activity-badge {
  display: flex; align-items: center; gap: 5px;
  padding: 3px 8px; border-radius: 10px; font-size: 10px;
  background: rgba(232,112,58,0.08); border: 1px solid rgba(232,112,58,0.2);
  color: var(--text-muted); white-space: nowrap; flex-shrink: 0;
}
.activity-badge.active {
  background: rgba(232,112,58,0.12); border-color: rgba(232,112,58,0.35); color: #e8703a;
}
.activity-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #e8703a; flex-shrink: 0;
  animation: traffic-pulse-fast 1s ease-in-out infinite;
}
.activity-text { font-weight: 600; }
.activity-sep { opacity: 0.4; }
.activity-stat { font-family: 'SF Mono', monospace; }
/* \u2500\u2500 Plan chat bubbles \u2500\u2500 */
.plan-chat-scroll { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.pcb-agent { max-width: 80%; align-self: flex-start; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px 12px 12px 2px; padding: 10px 14px; }
.pcb-user { max-width: 80%; align-self: flex-end; background: rgba(167,139,250,0.15); border: 1px solid rgba(167,139,250,0.3); border-radius: 12px 12px 2px 12px; padding: 10px 14px; }
.pcb-label { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
.pcb-log-lines { display: flex; flex-direction: column; gap: 2px; }
.pcb-log-line { font-size: 11px; font-family: monospace; color: var(--text-secondary); }
.pcb-log-line.warn { color: #fb923c; }
.pcb-q-text { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 10px; line-height: 1.5; }
.pcb-q-badge { font-size: 10px; font-weight: 700; color: #a78bfa; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 6px; }
.pcb-select-options { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.pcb-select-option { padding: 5px 12px; border-radius: 16px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font-size: 12px; cursor: pointer; font-family: inherit; transition: all 0.12s; }
.pcb-select-option:hover, .pcb-select-option.selected { border-color: #a78bfa; background: rgba(167,139,250,0.12); color: #a78bfa; }
.pcb-confirm-btns { display: flex; gap: 8px; margin-bottom: 10px; }
.pcb-q-textarea { width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); font-size: 12px; font-family: monospace; padding: 8px; resize: none; outline: none; margin-bottom: 10px; box-sizing: border-box; }
.pcb-q-textarea:focus { border-color: #a78bfa; }
.pcb-q-actions { display: flex; gap: 8px; }
.pcb-q-timeout { font-size: 10px; color: var(--text-muted); margin-top: 6px; }
.pcb-answered-text { font-size: 11px; color: var(--text-muted); font-style: italic; }
.pcb-summary-tasks { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
.pcb-summary-task { font-size: 11px; color: var(--text-secondary); display: flex; gap: 6px; align-items: flex-start; }
.pcb-error { color: #f87171; }
/* \u2500\u2500 Plan delivered badge \u2500\u2500 */
.plan-delivered-badge { display: inline-flex; align-items: center; gap: 4px; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.25); border-radius: 10px; padding: 1px 8px; font-size: 9px; font-weight: 700; color: #22c55e; font-family: 'SF Mono', monospace; }
/* \u2500\u2500 Active planning session cards \u2500\u2500 */
.plan-active-session-card { background: rgba(139,92,246,0.08); border: 1px solid rgba(139,92,246,0.3); border-radius: 8px; padding: 10px 12px; cursor: pointer; margin-bottom: 6px; }
.plan-active-session-card:hover { border-color: rgba(139,92,246,0.5); }
.plan-active-session-header { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
.plan-active-session-name { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.plan-active-session-meta { font-size: 10px; color: var(--text-muted); }
/* \u2500\u2500 Process switcher pills \u2500\u2500 */
.plan-process-switcher { display: flex; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--border); flex-shrink: 0; flex-wrap: wrap; background: var(--bg-secondary); }
.plan-process-pill { padding: 3px 10px; border-radius: 12px; font-size: 11px; cursor: pointer; border: 1px solid rgba(139,92,246,0.35); background: rgba(139,92,246,0.08); color: #a78bfa; white-space: nowrap; transition: all 0.1s; }
.plan-process-pill:hover { border-color: rgba(139,92,246,0.6); background: rgba(139,92,246,0.15); }
/* \u2500\u2500 Advanced run options \u2500\u2500 */
.run-advanced-options { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.run-advanced-toggle { padding: 8px 12px; font-size: 11px; color: var(--text-muted); cursor: pointer; list-style: none; display: block; }
.run-advanced-toggle::-webkit-details-marker { display: none; }
.run-advanced-body { padding: 8px 12px; display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--border); }
.run-advanced-row { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--text-secondary); cursor: pointer; }
.run-advanced-row input[type=number], .run-advanced-row select { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; font-size: 11px; color: var(--text-primary); }
`;function ua(){if(document.getElementById("daemon-styles"))return;let t=document.createElement("style");t.id="daemon-styles",t.textContent=pa,document.head.appendChild(t)}function ma({onClose:t,onRegistered:a}){let[r,d]=(0,o.useState)(""),[c,l]=(0,o.useState)(""),[i,u]=(0,o.useState)(""),[s,v]=(0,o.useState)(!1);function y(C){return C.trim().split("/").filter(Boolean).pop()??""}async function P(){let C=r.trim();if(!C){u("Enter a directory path.");return}let L=c.trim()||y(C),O=L.toLowerCase().replace(/[^a-z0-9]+/g,"-")+"-"+Date.now().toString(36);v(!0),u("");try{let W=await(await fetch("/api/projects/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:O,name:L,path:C})})).json();W.ok?(a(O),t()):u(W.error??"Registration failed")}catch{u("Network error")}v(!1)}return(0,e.jsx)("div",{className:"register-overlay",onClick:t,children:(0,e.jsxs)("div",{className:"register-dialog",onClick:C=>C.stopPropagation(),children:[(0,e.jsx)("div",{className:"register-dialog-title",children:"Register project"}),(0,e.jsxs)("div",{className:"register-dialog-sub",children:["Point cloudy at a local directory that has (or will have) a ",(0,e.jsx)("code",{children:".cloudy/"})," folder."]}),(0,e.jsx)("label",{className:"register-dialog-label",children:"Directory path"}),(0,e.jsx)("input",{className:"register-dialog-input",value:r,onChange:C=>{let L=C.target.value;d(L),c||l(y(L))},placeholder:"/Users/you/dev/my-project",autoFocus:!0,onKeyDown:C=>{C.key==="Enter"&&P(),C.key==="Escape"&&t()}}),(0,e.jsxs)("label",{className:"register-dialog-label",style:{marginTop:10},children:["Project name ",(0,e.jsx)("span",{style:{color:"var(--text-muted)",fontWeight:400},children:"(auto-detected)"})]}),(0,e.jsx)("input",{className:"register-dialog-input",value:c,onChange:C=>l(C.target.value),placeholder:y(r)||"my-project",onKeyDown:C=>{C.key==="Enter"&&P(),C.key==="Escape"&&t()}}),i&&(0,e.jsx)("div",{className:"register-dialog-error",children:i}),(0,e.jsxs)("div",{className:"register-dialog-actions",children:[(0,e.jsx)("button",{className:"daemon-btn",onClick:t,children:"Cancel"}),(0,e.jsx)("button",{className:"daemon-btn primary",onClick:P,disabled:s,children:s?"Registering\u2026":"+ Register"})]})]})})}function ga({projects:t,selectedId:a,onSelect:r}){let[d,c]=(0,o.useState)(!1);return(0,e.jsxs)(e.Fragment,{children:[d&&(0,e.jsx)(ma,{onClose:()=>c(!1),onRegistered:l=>{r(l)}}),(0,e.jsxs)("div",{className:"daemon-sidebar",children:[t.map(l=>(0,e.jsxs)("div",{className:`daemon-sidebar-project${a===l.id?" selected":""}`,onClick:()=>r(l.id),children:[(0,e.jsxs)("div",{className:"daemon-sidebar-project-name",children:[(0,e.jsx)("span",{className:l.status==="running"?"status-dot-running":"",style:{width:8,height:8,borderRadius:"50%",background:Mt(l.status),display:"inline-block",flexShrink:0}}),l.name]}),(0,e.jsxs)("div",{className:"daemon-sidebar-project-meta",children:[(0,e.jsx)("span",{className:"daemon-sidebar-project-pill",style:{background:l.activeProcess?"rgba(232,112,58,0.12)":l.status==="error"||l.status==="failed"?"rgba(239,68,68,0.1)":"var(--bg-card)",color:l.activeProcess?"#e8703a":l.status==="error"||l.status==="failed"?"#ef4444":"var(--text-muted)",border:`1px solid ${l.activeProcess?"rgba(232,112,58,0.25)":l.status==="error"||l.status==="failed"?"rgba(239,68,68,0.2)":"var(--border)"}`},children:l.activeProcess==="init"?"\u26A1 planning":l.activeProcess==="run"?"\u26A1 running":l.activeProcess==="pipeline"?"\u26A1 pipeline":l.status==="failed"?"\u2717 error":"\u25CB idle"}),l.lastRunAt&&(0,e.jsx)("span",{style:{fontSize:10,color:"var(--text-muted)"},children:ce(l.lastRunAt)}),l.costUsd?(0,e.jsx)("span",{style:{fontSize:10,color:"var(--text-muted)"},children:la(l.costUsd)}):null]})]},l.id)),(0,e.jsx)("div",{className:"daemon-sidebar-add",onClick:()=>c(!0),children:"+ register project"})]})]})}var ha=[{label:"\u{1F4CB} spec",q:"spec"},{label:"\u{1F5FA} roadmap",q:"roadmap"},{label:"\u2705 tasks",q:"tasks"},{label:"\u{1F3AF} goals",q:"goals"},{label:"\u{1F3D7} requirements",q:"requirements"},{label:"\u{1F516} vision",q:"vision"},{label:"\u{1F6E4} phase",q:"phase"},{label:"\u{1F680} launch",q:"launch"}];function fa({msg:t,isPending:a,onAnswer:r,onAiDecide:d}){let[c,l]=o.default.useState(""),[i,u]=o.default.useState([]);if(t.kind==="agent-log")return(0,e.jsxs)("div",{className:"pcb-agent",children:[(0,e.jsx)("div",{className:"pcb-label",children:"Agent"}),(0,e.jsx)("div",{className:"pcb-log-lines",children:(t.logs??[]).map((s,v)=>(0,e.jsxs)("div",{className:`pcb-log-line${s.level==="warn"?" warn":""}`,children:[s.level==="warn"?"\u26A0 ":"",s.msg]},v))})]});if(t.kind==="answer")return(0,e.jsxs)("div",{className:"pcb-user",children:[(0,e.jsx)("div",{className:"pcb-label",style:{textAlign:"right"},children:"You"}),(0,e.jsx)("div",{style:{fontSize:13,color:"var(--text-primary)"},children:t.answerText})]});if(t.kind==="error")return(0,e.jsxs)("div",{className:"pcb-agent pcb-error",children:[(0,e.jsx)("div",{className:"pcb-label",style:{color:"#f87171"},children:"Error"}),(0,e.jsx)("div",{style:{fontSize:13},children:t.errorText})]});if(t.kind==="summary"&&t.plan){let s=t.plan;return(0,e.jsxs)("div",{className:"pcb-agent",children:[(0,e.jsx)("div",{className:"pcb-label",style:{color:"#22c55e"},children:"Plan Ready"}),(0,e.jsxs)("div",{style:{display:"flex",alignItems:"baseline",gap:8,marginBottom:8},children:[(0,e.jsxs)("span",{style:{fontSize:20,fontWeight:800,color:"#22c55e"},children:[s.tasks.length," tasks"]}),(0,e.jsx)("span",{style:{fontSize:11,color:"var(--text-muted)"},children:s.goal})]}),(0,e.jsx)("div",{className:"pcb-summary-tasks",children:s.tasks.map((v,y)=>(0,e.jsxs)("div",{className:"pcb-summary-task",children:[(0,e.jsx)("span",{style:{color:"var(--text-muted)",minWidth:16},children:y+1}),(0,e.jsx)("span",{children:v.title})]},v.id))})]})}if(t.kind==="question"&&t.question){let s=t.question,v=t.answered!==void 0;return(0,e.jsxs)("div",{className:"pcb-agent",style:{maxWidth:"90%"},children:[(0,e.jsxs)("div",{className:"pcb-q-badge",children:["Question ",s.index," of ",s.total]}),(0,e.jsx)("div",{className:"pcb-q-text",children:s.text}),v?(0,e.jsxs)("div",{className:"pcb-answered-text",children:["Answered: ",Array.isArray(t.answered)?t.answered.join(", "):String(t.answered)]}):a?(0,e.jsxs)(e.Fragment,{children:[s.questionType==="select"&&s.options&&(0,e.jsx)("div",{className:"pcb-select-options",children:s.options.map(y=>(0,e.jsx)("button",{className:"pcb-select-option",onClick:()=>r(y,y),children:y},y))}),s.questionType==="multiselect"&&s.options&&(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("div",{className:"pcb-select-options",children:s.options.map(y=>(0,e.jsx)("button",{className:`pcb-select-option${i.includes(y)?" selected":""}`,onClick:()=>u(P=>P.includes(y)?P.filter(C=>C!==y):[...P,y]),children:y},y))}),(0,e.jsxs)("div",{className:"pcb-q-actions",children:[(0,e.jsx)("button",{className:"plan-action-btn",onClick:()=>r(i.join(", "),i.join(", ")),disabled:i.length===0,children:"Send"}),(0,e.jsx)("button",{className:"daemon-btn",onClick:d,children:"Let AI decide"})]})]}),s.questionType==="confirm"&&(0,e.jsxs)("div",{className:"pcb-confirm-btns",children:[(0,e.jsx)("button",{className:"plan-action-btn",onClick:()=>r("yes","Yes"),children:"Yes"}),(0,e.jsx)("button",{className:"daemon-btn",onClick:()=>r("no","No"),children:"No"})]}),(s.questionType==="text"||s.questionType!=="select"&&s.questionType!=="multiselect"&&s.questionType!=="confirm")&&(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("textarea",{className:"pcb-q-textarea",rows:3,placeholder:"Type your answer\u2026 (leave blank to let AI decide)",value:c,onChange:y=>l(y.target.value),onKeyDown:y=>{if(y.key==="Enter"&&!y.shiftKey){y.preventDefault();let P=c.trim();P?r(P,P):d()}},autoFocus:!0}),(0,e.jsxs)("div",{className:"pcb-q-actions",children:[(0,e.jsx)("button",{className:"plan-action-btn",onClick:()=>{let y=c.trim();y?r(y,y):d()},children:"Send"}),(0,e.jsx)("button",{className:"daemon-btn",onClick:d,children:"Let AI decide"})]})]}),(0,e.jsxs)("div",{className:"pcb-q-timeout",children:["Auto-answers in ",s.timeoutSec,"s if no response"]})]}):null]})}return null}function ba({project:t,onPlanSavedEvent:a}){let[r,d]=(0,o.useState)([]),[c,l]=(0,o.useState)(!0),[i,u]=(0,o.useState)(""),[s,v]=(0,o.useState)(""),[y,P]=(0,o.useState)([]),[C,L]=(0,o.useState)(!0),[O,I]=(0,o.useState)(new Set),[W,A]=(0,o.useState)(!1),[Q,j]=(0,o.useState)("sonnet"),[G,Z]=(0,o.useState)([]),[ae,B]=(0,o.useState)(null),K=(0,o.useRef)(null),S=t.activeProcess==="init",q=3e4,U=5e4,F=r.filter(b=>O.has(b.path)),D=F.filter(b=>b.sizeBytes>q),H=F.reduce((b,z)=>b+z.sizeBytes,0),ne=H>U,X=D.length>0?`"${D[0].title}" is ${Math.round(D[0].sizeBytes/1024)}KB \u2014 max is ${Math.round(q/1024)}KB per file.`:ne?`Combined selection is ${Math.round(H/1024)}KB \u2014 max is ${Math.round(U/1024)}KB.`:null,pe=i.trim()?r.filter(b=>{let z=i.toLowerCase();return b.title.toLowerCase().includes(z)||b.relativePath.toLowerCase().includes(z)||b.headings.some(h=>h.toLowerCase().includes(z))}):r;(0,o.useEffect)(()=>{l(!0),fetch(`/api/projects/${t.id}/specs`).then(b=>b.json()).then(b=>d(b)).catch(()=>d([])).finally(()=>l(!1))},[t.id]);let ee=(0,o.useCallback)(async()=>{L(!0);try{let b=await fetch(`/api/projects/${t.id}/plans`);if(b.ok){let z=await b.json();P(z)}}catch{}finally{L(!1)}},[t.id]);(0,o.useEffect)(()=>{ee()},[ee]),(0,o.useEffect)(()=>{a&&(P(b=>[a,...b.filter(z=>z.id!==a.id)]),B(null),Z(b=>[...b,{id:`summary-${Date.now()}`,kind:"summary",plan:a}]))},[a]),(0,o.useEffect)(()=>{let b=new EventSource("/api/live"),z={current:0};return b.onmessage=h=>{let k=null;try{k=JSON.parse(h.data)}catch{return}if(!(!k||k.projectId!==t.id))if(k.type==="plan_progress"){let m=Date.now(),se={level:k.level??"info",msg:k.msg??""};Z(J=>{let Y=J[J.length-1];if(Y&&Y.kind==="agent-log"&&m-z.current<3e3){let ge={...Y,logs:[...Y.logs??[],se]};return[...J.slice(0,-1),ge]}return z.current=m,[...J,{id:`log-${m}-${Math.random()}`,kind:"agent-log",logs:[se]}]}),z.current=m}else if(k.type==="plan_question"){let m={id:`q-${Date.now()}`,kind:"question",question:{questionType:k.questionType??"text",options:k.options,text:k.question??"",index:k.index??1,total:k.total??1,timeoutSec:k.timeoutSec??60}};Z(se=>[...se,m]),B(m)}else k.type==="plan_failed"?(B(null),Z(m=>[...m,{id:`err-${Date.now()}`,kind:"error",errorText:"Planning failed \u2014 check your spec or try again."}])):k.type==="plan_completed"&&!a&&B(null)},()=>b.close()},[t.id]),(0,o.useEffect)(()=>{S&&(A(!0),Z([]),B(null))},[S]),(0,o.useEffect)(()=>{K.current?.scrollIntoView({behavior:"smooth"})},[G]);function ke(b){I(z=>{let h=new Set(z);return h.has(b)?h.delete(b):h.add(b),h})}async function ue(){O.size===0||X||(A(!0),await ve(`/api/projects/${t.id}/plan`,{specPaths:Array.from(O),planName:s.trim()||void 0,model:Q}).catch(()=>{}))}async function we(b,z){if(!ae)return;let h=ae.id;Z(k=>k.map(m=>m.id===h?{...m,answered:b}:m)),Z(k=>[...k,{id:`ans-${Date.now()}`,kind:"answer",answerText:z}]),B(null),await ve(`/api/projects/${t.id}/plan-input`,{answer:b})}function oe(){A(!1)}async function V(b,z){z.stopPropagation(),await fetch(`/api/projects/${t.id}/plans/${b}`,{method:"DELETE"}),P(h=>h.filter(k=>k.id!==b))}if(W){let b=G.some(h=>h.kind==="error"),z=G.some(h=>h.kind==="summary");return(0,e.jsxs)("div",{className:"plan-split",children:[(0,e.jsxs)("div",{className:"plan-chat-view",children:[(0,e.jsxs)("div",{className:"plan-chat-header",children:[(0,e.jsx)("button",{className:"plan-chat-back",onClick:oe,children:"\u2190 Specs"}),(0,e.jsxs)("div",{style:{flex:1,display:"flex",flexDirection:"column",gap:3,minWidth:0},children:[(0,e.jsx)("div",{className:"plan-chat-title",children:S?(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("span",{className:"spinner",style:{width:12,height:12,flexShrink:0}}),"Planning\u2026"]}):b?"\u2717 Planning failed":z?"\u2713 Plan ready":"Planning"}),(()=>{let h=(t.processes??[]).filter(m=>m.type==="init"),k=F.length>0?F.map(m=>({key:m.path,label:m.title,hint:m.path})):h.map(m=>({key:m.id,label:m.specName??"spec",hint:m.startedAt}));return k.length>0?(0,e.jsxs)("div",{style:{display:"flex",flexWrap:"wrap",gap:4,alignItems:"center"},children:[k.map(m=>(0,e.jsxs)("span",{title:m.hint,className:"plan-spec-chip",children:["\u{1F4C4} ",m.label]},m.key)),(0,e.jsxs)("span",{style:{fontSize:10,color:"var(--text-muted)"},children:["\xB7 ",Q]})]}):null})()]}),S&&(0,e.jsx)("button",{className:"plan-stop-btn",style:{marginLeft:"auto",flexShrink:0},onClick:()=>fetch(`/api/projects/${t.id}/stop`,{method:"POST"}).catch(()=>{}),children:"\u2715 Stop"})]}),(t.processes??[]).filter(h=>h.type==="init").length>0&&(0,e.jsx)("div",{className:"plan-process-switcher",children:(t.processes??[]).filter(h=>h.type==="init").map((h,k)=>(0,e.jsxs)("span",{className:"plan-process-pill active",children:[(0,e.jsx)("span",{className:"spin",style:{fontSize:10},children:"\u26A1"}),h.specName??`Session ${k+1}`,(0,e.jsxs)("span",{style:{fontSize:9,opacity:.7,marginLeft:2},children:[Math.floor((Date.now()-new Date(h.startedAt).getTime())/1e3),"s"]})]},h.id))}),(0,e.jsxs)("div",{className:"plan-chat-scroll",children:[G.length===0&&S&&(0,e.jsxs)("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,gap:12,color:"var(--text-muted)",fontSize:12},children:[(0,e.jsx)("span",{className:"spinner",style:{width:28,height:28,borderWidth:3}}),(()=>{let h=(t.processes??[]).filter(m=>m.type==="init"),k=F.length>0?F.map(m=>({key:m.path,label:m.title,path:m.path})):h.map(m=>({key:m.id,label:m.specName??"spec",path:m.startedAt}));return(0,e.jsxs)(e.Fragment,{children:[(0,e.jsxs)("span",{children:["Claude is reading your spec",k.length>1?"s":"","\u2026"]}),k.length>0&&(0,e.jsxs)("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",gap:4},children:[k.map(m=>(0,e.jsxs)("span",{title:m.path,style:{fontSize:12,color:"#a78bfa",fontWeight:700},children:["\u{1F4C4} ",m.label]},m.key)),k[0]?.path&&(0,e.jsx)("span",{style:{fontSize:10,color:"var(--text-muted)",maxWidth:300,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:k[0].path})]})]})})(),(0,e.jsx)("span",{style:{fontSize:11,color:"var(--text-muted)"},children:"This takes 2\u20135 minutes. No input needed."})]}),G.map(h=>(0,e.jsx)(fa,{msg:h,isPending:ae?.id===h.id,onAnswer:(k,m)=>we(k,m),onAiDecide:()=>we("","AI decides\u2026")},h.id)),(0,e.jsx)("div",{ref:K})]})]}),(0,e.jsx)("div",{className:"plan-right",children:(()=>{let h=y.filter(m=>m.status!=="completed"),k=y.filter(m=>m.status==="completed");return(0,e.jsxs)(e.Fragment,{children:[(0,e.jsxs)("div",{className:"plan-right-header",children:[(0,e.jsx)(Fe,{size:12,color:"currentColor"}),"Ready to Deliver",h.length>0&&(0,e.jsx)("span",{style:{marginLeft:"auto",background:"rgba(167,139,250,0.15)",color:"#a78bfa",borderRadius:8,padding:"1px 6px",fontSize:10,fontWeight:700},children:h.length})]}),(0,e.jsxs)("div",{className:"plan-right-body",children:[(t.processes??[]).filter(m=>m.type==="init").map(m=>(0,e.jsxs)("div",{className:"plan-active-session-card",children:[(0,e.jsxs)("div",{className:"plan-active-session-header",children:[(0,e.jsx)("span",{style:{fontSize:12,animation:"spin 1s linear infinite",display:"inline-block"},children:"\u26A1"}),(0,e.jsx)("span",{className:"plan-active-session-name",children:m.specName??"Planning\u2026"})]}),(0,e.jsxs)("div",{className:"plan-active-session-meta",children:["Planning \xB7 ",m.startedAt?`${Math.floor((Date.now()-new Date(m.startedAt).getTime())/1e3)}s ago`:""]})]},m.id)),C&&(0,e.jsx)("div",{style:{display:"flex",flexDirection:"column",gap:6},children:[0,1].map(m=>(0,e.jsx)("div",{className:"skeleton skeleton-block",style:{height:72,opacity:1-m*.3}},m))}),!C&&h.length===0&&k.length===0&&(0,e.jsxs)("div",{className:"daemon-empty",style:{padding:"24px 12px",fontSize:11,textAlign:"center"},children:[(0,e.jsx)("div",{style:{color:"var(--text-muted)",marginBottom:6},children:"No plans yet"}),(0,e.jsx)("div",{style:{color:"var(--text-muted)",fontSize:10},children:"Select specs on the left and plan them"})]}),!C&&h.map(m=>(0,e.jsxs)("div",{className:"saved-plan-card",children:[(0,e.jsx)("button",{className:"saved-plan-delete",onClick:se=>V(m.id,se),title:"Delete plan",children:"\xD7"}),(0,e.jsx)("div",{className:"saved-plan-name",children:m.name}),m.goal&&m.goal!==m.name&&(0,e.jsx)("div",{className:"saved-plan-goal",title:m.goal,children:m.goal}),(0,e.jsxs)("div",{className:"saved-plan-footer",children:[(0,e.jsxs)("span",{className:"saved-plan-badge",children:[m.taskCount," tasks"]}),(0,e.jsx)("span",{className:`saved-plan-status ${m.status}`,children:m.status}),(0,e.jsx)("span",{className:"saved-plan-time",children:ce(m.createdAt)})]})]},m.id)),!C&&k.length>0&&(0,e.jsxs)("details",{className:"plan-delivered-section",style:{marginTop:h.length>0?8:0},children:[(0,e.jsxs)("summary",{style:{cursor:"pointer",fontSize:10,color:"var(--text-muted)",padding:"4px 8px",userSelect:"none"},children:["\u2713 Delivered (",k.length,")"]}),k.map(m=>(0,e.jsxs)("div",{className:"saved-plan-card",style:{opacity:.7},children:[(0,e.jsx)("button",{className:"saved-plan-delete",onClick:se=>V(m.id,se),title:"Delete plan",children:"\xD7"}),(0,e.jsx)("div",{className:"saved-plan-name",children:m.name}),m.deliveredAt&&(0,e.jsxs)("span",{className:"plan-delivered-badge",children:["\u2713 delivered ",m.specSha?`\xB7 #${m.specSha}`:""]}),(0,e.jsxs)("div",{className:"saved-plan-footer",children:[(0,e.jsxs)("span",{className:"saved-plan-badge",children:[m.taskCount," tasks"]}),(0,e.jsx)("span",{className:"saved-plan-time",children:ce(m.createdAt)})]})]},m.id))]})]})]})})()})]})}return(0,e.jsxs)("div",{className:"plan-split",children:[(0,e.jsxs)("div",{className:"plan-left",children:[(0,e.jsxs)("div",{className:"build-section-header",children:[(0,e.jsx)(We,{size:13,color:"currentColor"}),"Spec Files"]}),(0,e.jsxs)("div",{className:"build-left-body",children:[(0,e.jsxs)("div",{style:{marginBottom:8},children:[(0,e.jsxs)("div",{style:{position:"relative",marginBottom:6},children:[(0,e.jsx)("input",{className:"plan-search-input",type:"text",placeholder:"\u{1F50D} Search specs\u2026",value:i,onChange:b=>u(b.target.value)}),i&&(0,e.jsx)("button",{onClick:()=>u(""),style:{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"var(--text-muted)",cursor:"pointer",fontSize:14,lineHeight:1},children:"\xD7"})]}),(0,e.jsx)("div",{className:"plan-search-chips",children:ha.map(b=>(0,e.jsx)("button",{className:`plan-search-chip${i===b.q?" active":""}`,onClick:()=>u(i===b.q?"":b.q),children:b.label},b.q))})]}),(0,e.jsxs)("div",{className:"daemon-section-label",style:{marginBottom:6,display:"flex",alignItems:"center",gap:6},children:[(0,e.jsx)("span",{children:i?`${pe.length} of ${r.length}`:`${r.length} spec files`}),O.size>0&&(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("span",{style:{color:"var(--border)"},children:"\xB7"}),(0,e.jsxs)("span",{style:{color:"#22c55e",fontWeight:700},children:[O.size," selected"]}),(0,e.jsx)("button",{onClick:()=>I(new Set),style:{background:"none",border:"none",color:"var(--text-muted)",cursor:"pointer",fontSize:10,padding:0,textDecoration:"underline"},children:"clear"})]})]}),c&&[0,1,2,3].map(b=>(0,e.jsx)("div",{className:"skeleton skeleton-block",style:{height:44,opacity:1-b*.15,marginBottom:5}},b)),!c&&r.length===0&&(0,e.jsxs)("div",{className:"daemon-empty",style:{padding:"20px 0"},children:[(0,e.jsx)("div",{className:"daemon-empty-icon",children:(0,e.jsx)(We,{size:32,color:"#e8703a"})}),(0,e.jsx)("div",{className:"daemon-empty-title",style:{fontSize:12},children:"No spec files found"}),(0,e.jsx)("div",{className:"daemon-empty-sub",style:{fontSize:11},children:"Add .md files with Goals / Tasks sections"})]}),!c&&r.length>0&&pe.length===0&&(0,e.jsx)("div",{className:"daemon-empty",style:{padding:"16px 0"},children:(0,e.jsxs)("div",{className:"daemon-empty-title",style:{fontSize:12},children:['No matches for "',i,'"']})}),!c&&pe.map(b=>{let z=O.has(b.path),h=Math.round(b.sizeBytes/1024),k=b.sizeBytes>q;return(0,e.jsxs)("div",{className:`spec-drag-card${z?" in-chain":""}${k?" spec-card-oversized":""}`,onClick:()=>ke(b.path),title:k?`${h}KB \u2014 exceeds 30KB limit. Write a focused spec for one feature.`:"Click to select",children:[(0,e.jsx)("input",{type:"checkbox",checked:z,onChange:()=>ke(b.path),onClick:m=>m.stopPropagation(),style:{flexShrink:0,marginTop:2}}),(0,e.jsxs)("div",{style:{flex:1,minWidth:0},children:[(0,e.jsxs)("div",{className:"spec-card-title",children:[z&&(0,e.jsx)("span",{style:{color:"#22c55e",marginRight:4},children:"\u2713"}),k&&(0,e.jsx)("span",{style:{marginRight:4},title:"Too large",children:"\u26A0\uFE0F"}),b.title]}),(0,e.jsxs)("div",{className:"spec-card-path",style:{display:"flex",gap:6,alignItems:"center"},children:[(0,e.jsx)("span",{children:b.relativePath}),(0,e.jsxs)("span",{style:{color:k?"#f87171":"var(--text-muted)",fontWeight:k?600:400,fontSize:10},children:[h,"KB"]})]})]})]},b.path)})]}),O.size>0?(0,e.jsxs)("div",{className:"plan-action-footer",children:[X?(0,e.jsxs)("div",{className:"plan-size-error",children:[(0,e.jsxs)("span",{children:["\u26A0\uFE0F ",X]}),(0,e.jsx)("span",{style:{color:"var(--text-muted)",fontSize:10,marginTop:2},children:"Good specs are focused: one feature, 2\u201310KB. Large files like TASKS.md are reference docs \u2014 not specs."})]}):(0,e.jsx)("input",{className:"plan-action-name-input",type:"text",placeholder:"Plan name (optional)\u2026",value:s,onChange:b=>v(b.target.value),onKeyDown:b=>{b.key==="Enter"&&ue()}}),(0,e.jsxs)("div",{className:"plan-action-btn-row",children:[(0,e.jsxs)("button",{className:"plan-action-btn",onClick:ue,disabled:!!X,style:X?{opacity:.4,cursor:"not-allowed"}:void 0,children:["\u2726 Plan ",O.size," spec",O.size!==1?"s":""," \u2192"]}),(0,e.jsx)(ye,{value:Q,onChange:j,label:"Model"}),(0,e.jsx)("button",{className:"plan-stop-btn",style:{background:"rgba(167,139,250,0.1)",color:"#a78bfa",borderColor:"rgba(167,139,250,0.3)"},onClick:()=>{I(new Set),v("")},title:"Clear selection",children:"\u2715"})]})]}):(0,e.jsx)("div",{className:"plan-action-footer",children:(0,e.jsx)("div",{className:"plan-action-footer-idle",children:"\u261D Select specs above to create a plan"})})]}),(0,e.jsx)("div",{className:"plan-right",children:(()=>{let b=y.filter(h=>h.status!=="completed"),z=y.filter(h=>h.status==="completed");return(0,e.jsxs)(e.Fragment,{children:[(0,e.jsxs)("div",{className:"plan-right-header",children:[(0,e.jsx)(Fe,{size:12,color:"currentColor"}),"Ready to Deliver",b.length>0&&(0,e.jsx)("span",{style:{marginLeft:"auto",background:"rgba(167,139,250,0.15)",color:"#a78bfa",borderRadius:8,padding:"1px 6px",fontSize:10,fontWeight:700},children:b.length})]}),(0,e.jsxs)("div",{className:"plan-right-body",children:[(t.processes??[]).filter(h=>h.type==="init").map(h=>(0,e.jsxs)("div",{className:"plan-active-session-card",children:[(0,e.jsxs)("div",{className:"plan-active-session-header",children:[(0,e.jsx)("span",{style:{fontSize:12,animation:"spin 1s linear infinite",display:"inline-block"},children:"\u26A1"}),(0,e.jsx)("span",{className:"plan-active-session-name",children:h.specName??"Planning\u2026"})]}),(0,e.jsxs)("div",{className:"plan-active-session-meta",children:["Planning \xB7 ",h.startedAt?`${Math.floor((Date.now()-new Date(h.startedAt).getTime())/1e3)}s ago`:""]})]},h.id)),C&&[0,1].map(h=>(0,e.jsx)("div",{className:"skeleton skeleton-block",style:{height:72,opacity:1-h*.3}},h)),!C&&b.length===0&&z.length===0&&(0,e.jsxs)("div",{className:"daemon-empty",style:{padding:"24px 12px",fontSize:11,textAlign:"center"},children:[(0,e.jsx)("div",{style:{color:"var(--text-muted)",marginBottom:6},children:"No plans yet"}),(0,e.jsx)("div",{style:{color:"var(--text-muted)",fontSize:10},children:"Select specs on the left and plan them"})]}),!C&&b.map(h=>(0,e.jsxs)("div",{className:"saved-plan-card",children:[(0,e.jsx)("button",{className:"saved-plan-delete",onClick:k=>V(h.id,k),title:"Delete plan",children:"\xD7"}),(0,e.jsx)("div",{className:"saved-plan-name",children:h.name}),h.goal&&h.goal!==h.name&&(0,e.jsx)("div",{className:"saved-plan-goal",title:h.goal,children:h.goal}),(0,e.jsxs)("div",{className:"saved-plan-footer",children:[(0,e.jsxs)("span",{className:"saved-plan-badge",children:[h.taskCount," tasks"]}),(0,e.jsx)("span",{className:`saved-plan-status ${h.status}`,children:h.status}),(0,e.jsx)("span",{className:"saved-plan-time",children:ce(h.createdAt)})]})]},h.id)),!C&&z.length>0&&(0,e.jsxs)("details",{className:"plan-delivered-section",style:{marginTop:b.length>0?8:0},children:[(0,e.jsxs)("summary",{style:{cursor:"pointer",fontSize:10,color:"var(--text-muted)",padding:"4px 8px",userSelect:"none"},children:["\u2713 Delivered (",z.length,")"]}),z.map(h=>(0,e.jsxs)("div",{className:"saved-plan-card",style:{opacity:.7},children:[(0,e.jsx)("button",{className:"saved-plan-delete",onClick:k=>V(h.id,k),title:"Delete plan",children:"\xD7"}),(0,e.jsx)("div",{className:"saved-plan-name",children:h.name}),h.deliveredAt&&(0,e.jsxs)("span",{className:"plan-delivered-badge",children:["\u2713 delivered ",h.specSha?`\xB7 #${h.specSha}`:""]}),(0,e.jsxs)("div",{className:"saved-plan-footer",children:[(0,e.jsxs)("span",{className:"saved-plan-badge",children:[h.taskCount," tasks"]}),(0,e.jsx)("span",{className:"saved-plan-time",children:ce(h.createdAt)})]})]},h.id))]})]})]})})()})]})}var Ze={haiku:{dot:"#60a5fa",badge:"FAST",badgeColor:"rgba(96,165,250,0.15)",desc:"Claude Haiku \u2014 lightweight tasks, quick edits",speed:"\u26A1 fastest",cost:"$",effort:"low effort"},sonnet:{dot:"#a78bfa",badge:"BALANCED",badgeColor:"rgba(167,139,250,0.15)",desc:"Claude Sonnet \u2014 best for most coding tasks",speed:"\u25CE balanced",cost:"$$",effort:"medium effort"},opus:{dot:"#f97316",badge:"POWERFUL",badgeColor:"rgba(249,115,22,0.15)",desc:"Claude Opus \u2014 complex reasoning, architecture",speed:"\u25C9 deliberate",cost:"$$$",effort:"high effort"}};function ye({value:t,onChange:a,label:r}){let[d,c]=(0,o.useState)(!1),l=(0,o.useRef)(null),i=Ze[t]??Ze.sonnet;return(0,o.useEffect)(()=>{function u(s){l.current&&!l.current.contains(s.target)&&c(!1)}return d&&document.addEventListener("mousedown",u),()=>document.removeEventListener("mousedown",u)},[d]),(0,e.jsxs)("div",{className:"model-picker",ref:l,children:[(0,e.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:5},children:[(0,e.jsx)("span",{style:{color:"var(--text-muted)",fontSize:10,fontWeight:700,letterSpacing:"0.05em",textTransform:"uppercase"},children:r}),(0,e.jsxs)("button",{className:"model-picker-btn",onClick:()=>c(u=>!u),children:[(0,e.jsx)("span",{className:"mp-dot",style:{background:i.dot}}),(0,e.jsx)("span",{className:"mp-name",children:t}),(0,e.jsx)("span",{className:"mp-chevron",children:d?"\u25B2":"\u25BC"})]})]}),d&&(0,e.jsx)("div",{className:"model-picker-dropdown",children:Object.entries(Ze).map(([u,s])=>(0,e.jsxs)("div",{className:`model-picker-item${t===u?" selected":""}`,onClick:()=>{a(u),c(!1)},children:[(0,e.jsxs)("div",{className:"mp-item-header",children:[(0,e.jsx)("span",{className:"mp-item-dot",style:{background:s.dot}}),(0,e.jsx)("span",{className:"mp-item-name",children:u}),(0,e.jsx)("span",{className:"mp-item-badge",style:{background:s.badgeColor,color:s.dot},children:s.badge})]}),(0,e.jsx)("div",{className:"mp-item-desc",children:s.desc}),(0,e.jsxs)("div",{className:"mp-item-meta",children:[(0,e.jsx)("span",{className:"mp-item-meta-pill",children:s.speed}),(0,e.jsx)("span",{className:"mp-item-meta-pill",children:s.cost}),(0,e.jsx)("span",{className:"mp-item-meta-pill",children:s.effort})]})]},u))})]})}function va(){try{let t=new AudioContext,a=t.createOscillator(),r=t.createGain();a.connect(r),r.connect(t.destination),a.frequency.value=880,a.type="sine",r.gain.setValueAtTime(.3,t.currentTime),r.gain.exponentialRampToValueAtTime(.001,t.currentTime+.6),a.start(t.currentTime),a.stop(t.currentTime+.6)}catch{}}function xa({project:t}){let[a,r]=(0,o.useState)("sonnet"),[d,c]=(0,o.useState)("haiku"),[l,i]=(0,o.useState)("sonnet"),[u,s]=(0,o.useState)(!1),[v,y]=(0,o.useState)(3),[P,C]=(0,o.useState)(!1),[L,O]=(0,o.useState)(3),[I,W]=(0,o.useState)(""),[A,Q]=(0,o.useState)([]),[j,G]=(0,o.useState)([]),[Z,ae]=(0,o.useState)(""),[B,K]=(0,o.useState)(null),[S,q]=(0,o.useState)(!1),[U,F]=(0,o.useState)(null),[D,H]=(0,o.useState)([]),[ne,X]=(0,o.useState)(0),[pe,ee]=(0,o.useState)("config"),[ke,ue]=(0,o.useState)(new Set),we=(0,o.useRef)(!1),[oe,V]=(0,o.useState)([]),b=(0,o.useRef)(null),[z,h]=(0,o.useState)(null),[k,m]=(0,o.useState)(""),[se,J]=(0,o.useState)(0),Y=t.activeProcess==="run"||t.status==="running";(0,o.useEffect)(()=>{let p=new EventSource("/api/live");return p.onmessage=M=>{let T=null;try{T=JSON.parse(M.data)}catch{return}if(!(!T||T.projectId!==t.id))if(T.type==="run_output_daemon"&&T.line){let x=T.line.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g,"").trim();x&&V(de=>{let re=[...de,x];return re.length>20?re.slice(-20):re})}else if(T.type==="plan_question"){let x={text:T.question??"",questionType:T.questionType??"text",options:T.options,index:T.index??1,total:T.total??1,timeoutSec:T.timeoutSec??60,arrivedAt:Date.now()};h(x),J(x.timeoutSec),m(x.options?.[0]??""),va()}else(T.type==="run_output_daemon"||T.type==="run_completed_daemon"||T.type==="run_failed_daemon")&&T.type!=="run_output_daemon"&&h(null)},()=>p.close()},[t.id]),(0,o.useEffect)(()=>{let M=D.find(T=>T.status==="in_progress")?.id??null;M!==b.current&&(b.current=M,V([]))},[D]),(0,o.useEffect)(()=>{if(!z)return;J(z.timeoutSec);let p=setInterval(()=>{J(M=>M<=1?(clearInterval(p),h(null),0):M-1)},1e3);return()=>clearInterval(p)},[z?.arrivedAt]),(0,o.useEffect)(()=>{fetch(`/api/projects/${t.id}/plans`).then(p=>p.json()).then(p=>Q(p)).catch(()=>{})},[t.id]);async function ge(){try{let M=await(await fetch(`/api/projects/${t.id}/state`)).json(),T=M?.plan?.tasks??[];T.length>0&&(H(T),X(M?.costSummary?.totalEstimatedUsd??0))}catch{}}(0,o.useEffect)(()=>{ge().then(()=>{H(p=>(p.length>0&&ee("progress"),p))})},[t.id]),(0,o.useEffect)(()=>{if(!Y)return;ee("progress"),ge();let p=setInterval(ge,3e3);return()=>clearInterval(p)},[Y,t.id]),(0,o.useEffect)(()=>{we.current&&!Y&&setTimeout(ge,600),we.current=Y},[Y]);async function De(p){_||(ee("progress"),await ve(`/api/projects/${t.id}/retry`,{taskId:p,executionModel:a,taskReviewModel:d,runReviewModel:l}).catch(()=>{}))}async function $e(){_||(ee("progress"),await ve(`/api/projects/${t.id}/retry`,{executionModel:a,taskReviewModel:d,runReviewModel:l}).catch(()=>{}))}let ze=new Set(j.map(p=>p.planId));function He(p,M){p.dataTransfer.setData("planId",M.id),p.dataTransfer.setData("planName",M.name),p.dataTransfer.setData("drag-type","from-plans"),p.dataTransfer.effectAllowed="copy"}function he(p,M){F(M),p.dataTransfer.setData("drag-type","chain-step"),p.dataTransfer.setData("step-id",M),p.dataTransfer.effectAllowed="move"}function Pe(p){p.preventDefault(),p.dataTransfer.dropEffect="copy"}function Me(p){if(p.preventDefault(),p.dataTransfer.getData("drag-type")==="from-plans"){let T=p.dataTransfer.getData("planId"),x=p.dataTransfer.getData("planName");if(!T||ze.has(T))return;let de=A.find(ie=>ie.id===T),re={id:`${T}-${Date.now()}`,planId:T,planName:x,taskCount:de?.taskCount??0};G(ie=>[...ie,re])}q(!1)}function Ie(p,M){p.preventDefault(),p.stopPropagation();let T=p.dataTransfer.getData("drag-type");if(T==="from-plans"){let x=p.dataTransfer.getData("planId"),de=p.dataTransfer.getData("planName");if(!x||ze.has(x))return;let re=A.find(fe=>fe.id===x),ie={id:`${x}-${Date.now()}`,planId:x,planName:de,taskCount:re?.taskCount??0};G(fe=>{let be=[...fe];return be.splice(M,0,ie),be})}else if(T==="chain-step"){let x=p.dataTransfer.getData("step-id");G(de=>{let re=de.findIndex(Ue=>Ue.id===x);if(re===-1)return de;let ie=[...de],[fe]=ie.splice(re,1),be=re<M?M-1:M;return ie.splice(be,0,fe),ie})}K(null),F(null)}function me(p){G(M=>M.filter(T=>T.id!==p))}async function n(){!z||!k.trim()||(await ve(`/api/projects/${t.id}/plan-input`,{answer:k.trim()}).catch(()=>{}),h(null),m(""))}async function g(){j.length===0||Y||(ee("progress"),await ve(`/api/projects/${t.id}/run`,{planIds:j.map(p=>p.planId),executionModel:a,taskReviewModel:d,runReviewModel:l,parallel:u||void 0,maxParallel:u?v:void 0,noValidate:P||void 0,maxRetries:L!==3?L:void 0,effort:I||void 0}).catch(()=>{}))}let f=Y?"running":t.status==="failed"?"error":j.length>0?"completed":"idle",w=D.filter(p=>p.status==="failed"),$=D.filter(p=>p.status==="completed"||p.status==="skipped"),N=D.length>0?$.length/D.length*100:0,E=D.some(p=>p.status==="in_progress"||p.status==="pending"),_=Y||E,Aa=_?"running":w.length>0?"error":D.length>0?"completed":"idle",[tt,at]=o.default.useState(0),Ee=o.default.useRef(null);o.default.useEffect(()=>{if(Y){Ee.current||(Ee.current=Date.now());let p=setInterval(()=>at(Math.floor((Date.now()-(Ee.current??Date.now()))/1e3)),500);return()=>clearInterval(p)}else Ee.current=null},[Y]);function At(p){return p<60?`${p}s`:`${Math.floor(p/60)}m ${p%60}s`}let Ge=40,nt=2*Math.PI*Ge,Rt=!Y&&E;if(pe==="progress"&&(Y||D.length>0)){let p=!_&&w.length>0?"failed":!_&&N===100?"complete":"",M=!_&&w.length>0?"failed":!_&&N===100?"complete":"running",T=D.find(x=>x.status==="in_progress");return(0,e.jsxs)("div",{className:"run-progress-view",children:[(0,e.jsxs)("div",{className:"run-progress-hero",children:[(0,e.jsxs)("div",{className:"run-progress-ring-wrap",children:[(0,e.jsxs)("svg",{width:"100",height:"100",viewBox:"0 0 100 100",children:[(0,e.jsx)("circle",{className:"run-progress-ring-bg",cx:"50",cy:"50",r:Ge}),(0,e.jsx)("circle",{className:`run-progress-ring-fill${p?` ${p}`:""}`,cx:"50",cy:"50",r:Ge,strokeDasharray:nt,strokeDashoffset:nt*(1-N/100)})]}),(0,e.jsxs)("div",{className:"run-progress-ring-pct",children:[Math.round(N),"%"]})]}),(0,e.jsxs)("div",{className:"run-progress-info",children:[(0,e.jsx)("div",{className:"run-progress-headline",children:_?(0,e.jsx)(e.Fragment,{children:"\u26A1 Running"}):w.length>0?(0,e.jsx)("span",{className:"run-failed-badge",children:"\u2717 Run failed"}):(0,e.jsx)("span",{className:"run-complete-badge",children:"\u2713 Complete"})}),(0,e.jsxs)("div",{className:"run-progress-subline",children:[$.length," of ",D.length," tasks done",ne>0&&` \xB7 $${ne.toFixed(3)}`,_&&tt>0&&` \xB7 ${At(tt)}`]}),T&&(0,e.jsxs)("div",{style:{fontSize:11,color:"#a78bfa",marginTop:4,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:["\u26A1 ",T.title]}),(0,e.jsx)("div",{className:"run-progress-bar-wrap",style:{marginTop:10},children:(0,e.jsx)("div",{className:`run-progress-bar ${M}`,style:{width:`${N}%`}})})]})]}),z&&(0,e.jsxs)("div",{className:"run-question-banner",children:[(0,e.jsxs)("div",{className:"run-question-banner-header",children:[(0,e.jsx)("span",{className:"run-question-banner-icon",children:"\u2753"}),(0,e.jsxs)("span",{className:"run-question-banner-title",children:["Question ",z.index,"/",z.total," \u2014 needs your answer"]}),(0,e.jsxs)("span",{className:"run-question-banner-timer",children:[se,"s"]})]}),(0,e.jsx)("div",{className:"run-question-banner-text",children:z.text}),z.options?(0,e.jsx)("div",{className:"run-question-banner-options",children:z.options.map(x=>(0,e.jsx)("button",{className:`run-question-option${k===x?" selected":""}`,onClick:()=>m(x),children:x},x))}):(0,e.jsx)("input",{className:"run-question-input",value:k,onChange:x=>m(x.target.value),onKeyDown:x=>{x.key==="Enter"&&n()},placeholder:"Type your answer\u2026",autoFocus:!0}),(0,e.jsx)("button",{className:"run-question-submit",onClick:n,children:"Send answer \u21B5"})]}),Rt&&(0,e.jsxs)("div",{className:"run-stuck-banner",children:[(0,e.jsx)("span",{children:"\u26A0 Process ended with tasks still in progress \u2014 server will auto-reset on next connect."}),(0,e.jsx)("button",{className:"run-stuck-reset-btn",onClick:async()=>{await ve(`/api/projects/${t.id}/retry`,{executionModel:a,taskReviewModel:d,runReviewModel:l}).catch(()=>{}),ee("progress")},children:"\u21BA Retry now"})]}),(0,e.jsxs)("div",{className:"run-task-list",children:[D.map(x=>{let de={completed:"\u2713",failed:"\u2717",in_progress:"\u26A1",skipped:"\u2298",pending:"\u25CB",retrying:"\u21A9"},re={completed:"done",failed:"failed",in_progress:"running",skipped:"skipped",pending:"waiting",retrying:"retrying"},ie=ke.has(x.id),fe=x.status==="in_progress",be=x.description||x.resultSummary||(x.filesWritten?.length??0)>0||(x.acceptanceCriteria?.length??0)>0||fe,Ue=()=>ue(le=>{let xe=new Set(le);return xe.has(x.id)?xe.delete(x.id):xe.add(x.id),xe});return(0,e.jsxs)("div",{className:`run-task-item run-task-${x.status}`,style:{flexDirection:"column",alignItems:"stretch",padding:0,cursor:be?"pointer":"default"},onClick:be?Ue:void 0,children:[(0,e.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:10,padding:"10px 12px"},children:[(0,e.jsx)("div",{className:`run-task-icon-wrap status-${x.status}`,children:x.status==="in_progress"?(0,e.jsx)("span",{className:"spin",children:"\u26A1"}):de[x.status]??"\u25CB"}),(0,e.jsx)("span",{className:"run-task-title",children:x.title}),x.durationMs&&x.durationMs>0&&(0,e.jsx)("span",{style:{fontSize:10,color:"var(--text-muted)",flexShrink:0},children:x.durationMs>6e4?`${Math.floor(x.durationMs/6e4)}m`:`${Math.round(x.durationMs/1e3)}s`}),(x.retries??0)>0&&(0,e.jsxs)("span",{style:{fontSize:9,color:"#f59e0b",background:"rgba(245,158,11,0.12)",border:"1px solid rgba(245,158,11,0.25)",borderRadius:4,padding:"1px 5px",flexShrink:0},children:["\u21BA",x.retries]}),(0,e.jsx)("span",{className:"run-task-status-label",children:re[x.status]??x.status}),x.status==="failed"&&!_&&(0,e.jsx)("button",{className:"run-task-retry-btn",onClick:le=>{le.stopPropagation(),De(x.id)},children:"\u21BA"}),be&&(0,e.jsx)("span",{className:`run-task-expand-btn${ie?" open":""}`,children:"\u25B6"})]}),ie&&be&&(0,e.jsxs)("div",{className:"run-task-detail",onClick:le=>le.stopPropagation(),children:[fe&&oe.length>0&&(0,e.jsxs)("div",{className:"run-task-detail-section",children:[(0,e.jsx)("div",{className:"run-task-detail-label",children:"Live output"}),(0,e.jsx)("div",{className:"run-task-live-output",children:oe.map((le,xe)=>(0,e.jsx)("div",{className:"run-task-live-line",children:le},xe))})]}),fe&&oe.length===0&&(0,e.jsxs)("div",{className:"run-task-detail-section",children:[(0,e.jsx)("div",{className:"run-task-detail-label",children:"Live output"}),(0,e.jsx)("div",{style:{color:"var(--text-muted)",fontSize:11,fontStyle:"italic"},children:"Waiting for output\u2026"})]}),x.description&&(0,e.jsxs)("div",{className:"run-task-detail-section",children:[(0,e.jsx)("div",{className:"run-task-detail-label",children:"Description"}),(0,e.jsx)("div",{className:"run-task-detail-text",children:x.description})]}),x.resultSummary&&(0,e.jsxs)("div",{className:"run-task-detail-section",children:[(0,e.jsx)("div",{className:"run-task-detail-label",children:"Result"}),(0,e.jsx)("div",{className:"run-task-detail-text",children:x.resultSummary})]}),(x.acceptanceCriteria?.length??0)>0&&(0,e.jsxs)("div",{className:"run-task-detail-section",children:[(0,e.jsx)("div",{className:"run-task-detail-label",children:"Acceptance Criteria"}),(0,e.jsx)("ul",{className:"run-task-detail-criteria",children:x.acceptanceCriteria.map((le,xe)=>(0,e.jsx)("li",{children:le},xe))})]}),(x.filesWritten?.length??0)>0&&(0,e.jsxs)("div",{className:"run-task-detail-section",children:[(0,e.jsx)("div",{className:"run-task-detail-label",children:"Files written"}),(0,e.jsx)("div",{className:"run-task-detail-files",children:x.filesWritten.map(le=>(0,e.jsx)("span",{className:"run-task-detail-file",children:le.replace(/^.*\/([^/]+)$/,"$1")},le))})]})]})]},x.id)}),D.length===0&&_&&(0,e.jsxs)("div",{style:{color:"var(--text-muted)",fontSize:11,padding:"40px 8px",textAlign:"center"},children:[(0,e.jsx)("div",{className:"spinner",style:{width:20,height:20,margin:"0 auto 8px"}}),"Spinning up tasks\u2026"]})]}),(0,e.jsxs)("div",{className:"run-progress-footer",children:[_&&(0,e.jsx)("button",{className:"daemon-btn",onClick:()=>fetch(`/api/projects/${t.id}/stop`,{method:"POST"}).catch(()=>{}),style:{color:"#ef4444",borderColor:"rgba(239,68,68,0.4)"},children:"\u2715 Stop"}),!_&&w.length>0&&(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)(ye,{value:a,onChange:r,label:"Execution"}),(0,e.jsx)(ye,{value:d,onChange:c,label:"Task Review"}),(0,e.jsx)(ye,{value:l,onChange:i,label:"Run Review"}),(0,e.jsxs)("button",{className:"daemon-btn primary",onClick:$e,children:["\u21BA Retry failed (",w.length,")"]})]}),!_&&(0,e.jsx)("button",{className:"daemon-btn",onClick:()=>{H([]),at(0),ee("config")},style:{fontSize:11},children:"\u2190 New chain"})]})]})}return(0,e.jsxs)("div",{className:"run-split",children:[(0,e.jsxs)("div",{className:"run-left",children:[(0,e.jsx)("div",{className:"run-left-header",children:"Ready to Deliver"}),(0,e.jsx)("div",{className:"run-left-body",children:(()=>{let p=A.filter(M=>M.status!=="completed");return p.length===0?(0,e.jsxs)("div",{style:{padding:"16px 8px",color:"var(--text-muted)",fontSize:11,textAlign:"center"},children:["No ready plans.",(0,e.jsx)("br",{}),"Create them in the Plan tab."]}):p.map(M=>{let T=ze.has(M.id);return(0,e.jsxs)("div",{className:`run-plan-card${T?" in-chain":""}`,draggable:!0,onDragStart:x=>He(x,M),title:T?"Already in chain":"Drag to chain",children:[(0,e.jsx)("span",{className:"run-plan-drag-handle",children:"\u283F"}),(0,e.jsxs)("div",{className:"run-plan-info",children:[(0,e.jsxs)("div",{className:"run-plan-name",children:[T&&(0,e.jsx)("span",{style:{color:"#22c55e",marginRight:4},children:"\u2713"}),M.name]}),(0,e.jsxs)("div",{className:"run-plan-tasks",children:[M.taskCount," tasks \xB7 ",ce(M.createdAt)]})]})]},M.id)})})()})]}),(0,e.jsxs)("div",{className:"run-right",children:[(0,e.jsxs)("div",{className:"run-traffic-light",children:[(0,e.jsx)(ca,{status:f}),(0,e.jsxs)("div",{className:"run-traffic-status-text",children:[(0,e.jsx)("div",{className:"run-traffic-title",children:j.length===0?"No chain":"Ready"}),(0,e.jsx)("div",{className:"run-traffic-sub",children:j.length===0?"Drag plans from the left to build a chain":`${j.length} plan${j.length!==1?"s":""} queued`})]})]}),(0,e.jsx)("div",{className:"chain-name-row",children:(0,e.jsx)("input",{className:"chain-name-input",placeholder:"Name this chain\u2026",value:Z,onChange:p=>ae(p.target.value)})}),(0,e.jsx)("div",{className:"chain-canvas",onDragOver:Pe,onDrop:Me,children:j.length===0?(0,e.jsxs)("div",{className:`chain-empty-drop${S?" drag-over":""}`,onDragOver:p=>{p.preventDefault(),q(!0)},onDragLeave:()=>q(!1),onDrop:p=>{p.stopPropagation(),q(!1),Me(p)},children:[(0,e.jsx)("div",{style:{fontSize:24,marginBottom:8,opacity:.5},children:"\u283F\u283F"}),(0,e.jsx)("div",{style:{fontWeight:600,marginBottom:4},children:"Drag plans here to build your chain"}),(0,e.jsx)("div",{style:{fontSize:11},children:"Drop plan cards from the left panel to add steps"})]}):(0,e.jsxs)("div",{style:{width:"100%",maxWidth:340},children:[(0,e.jsx)("div",{className:`chain-drop-zone${B===0?" drag-over":""}`,onDragOver:p=>{p.preventDefault(),K(0)},onDragLeave:()=>K(null),onDrop:p=>Ie(p,0)}),j.map((p,M)=>(0,e.jsxs)("div",{className:"chain-step-wrapper",children:[(0,e.jsxs)("div",{className:`chain-step-card${U===p.id?" dragging":""}`,draggable:!0,onDragStart:T=>he(T,p.id),onDragEnd:()=>{F(null),K(null)},children:[(0,e.jsx)("span",{className:"chain-step-drag",children:"\u283F\u283F"}),(0,e.jsx)("div",{className:"chain-step-num",children:M+1}),(0,e.jsxs)("div",{className:"chain-step-info",children:[(0,e.jsx)("div",{className:"chain-step-title",children:p.planName}),(0,e.jsxs)("div",{className:"chain-step-type",children:[p.taskCount," tasks \xB7 Run"]})]}),(0,e.jsx)("button",{className:"chain-step-delete",onClick:()=>me(p.id),title:"Remove step",children:"\xD7"})]}),M<j.length-1&&(0,e.jsxs)("div",{className:"chain-connector",children:[(0,e.jsx)("div",{className:"chain-connector-line"}),(0,e.jsx)("div",{className:"chain-connector-arrow",children:"\u25BC"}),(0,e.jsx)("div",{className:"chain-connector-line"})]}),(0,e.jsx)("div",{className:`chain-drop-zone${B===M+1?" drag-over":""}`,onDragOver:T=>{T.preventDefault(),K(M+1)},onDragLeave:()=>K(null),onDrop:T=>Ie(T,M+1)})]},p.id))]})}),(0,e.jsxs)("div",{className:"chain-footer",style:{flexDirection:"column",gap:8},children:[(0,e.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"},children:[(0,e.jsx)(ye,{value:a,onChange:r,label:"Execution"}),(0,e.jsx)(ye,{value:d,onChange:c,label:"Task Review"}),(0,e.jsx)(ye,{value:l,onChange:i,label:"Run Review"}),(0,e.jsx)("button",{className:"daemon-btn primary",disabled:j.length===0,onClick:g,children:`\u25B6 Run Chain (${j.length})`}),j.length>0&&(0,e.jsx)("button",{className:"daemon-btn",onClick:()=>G([]),style:{fontSize:11},children:"Clear"})]}),(0,e.jsxs)("details",{className:"run-advanced-options",children:[(0,e.jsx)("summary",{className:"run-advanced-toggle",children:"Advanced options"}),(0,e.jsxs)("div",{className:"run-advanced-body",children:[(0,e.jsxs)("label",{className:"run-advanced-row",children:[(0,e.jsx)("input",{type:"checkbox",checked:u,onChange:p=>s(p.target.checked)}),(0,e.jsx)("span",{children:"Parallel task execution"}),u&&(0,e.jsx)("input",{type:"number",min:1,max:8,value:v,onChange:p=>y(Number(p.target.value)),style:{width:48}})]}),(0,e.jsxs)("label",{className:"run-advanced-row",children:[(0,e.jsx)("input",{type:"checkbox",checked:P,onChange:p=>C(p.target.checked)}),(0,e.jsx)("span",{children:"Skip validation"})]}),(0,e.jsxs)("label",{className:"run-advanced-row",children:[(0,e.jsx)("span",{children:"Max retries"}),(0,e.jsx)("input",{type:"number",min:1,max:5,value:L,onChange:p=>O(Number(p.target.value)),style:{width:48}})]}),(0,e.jsxs)("label",{className:"run-advanced-row",children:[(0,e.jsx)("span",{children:"Thinking effort"}),(0,e.jsxs)("select",{value:I,onChange:p=>W(p.target.value),children:[(0,e.jsx)("option",{value:"",children:"default"}),(0,e.jsx)("option",{value:"low",children:"low"}),(0,e.jsx)("option",{value:"medium",children:"medium"}),(0,e.jsx)("option",{value:"high",children:"high (extended)"}),(0,e.jsx)("option",{value:"max",children:"max (opus only)"})]})]})]})]})]})]})]})}var ya={Bash:"\u2328",Read:"\u{1F4D6}",Write:"\u270F\uFE0F",Edit:"\u270F\uFE0F",Grep:"\u{1F50D}",Glob:"\u{1F5C2}",Agent:"\u{1F916}",WebFetch:"\u{1F310}",WebSearch:"\u{1F310}",TodoWrite:"\u{1F4DD}",TodoRead:"\u{1F4DD}"};function Tt({block:t,role:a}){let[r,d]=(0,o.useState)(!1);if(t.type==="tool_use"){let c=ya[t.toolName??""]??"\u{1F527}",l=t.toolName??"",i=t.toolInput??{},u=wa(l,i),s="",v="";return l==="Bash"?(s=String(i.command??""),v="bash"):l==="Write"?(s=String(i.content??"").slice(0,6e3),v=String(i.file_path??"").split(".").pop()??""):l==="Edit"?(s=`old:
${String(i.old_string??"").slice(0,2e3)}

new:
${String(i.new_string??"").slice(0,2e3)}`,v=""):s=JSON.stringify(i,null,2),(0,e.jsxs)("div",{className:"tool-block tool-call",onClick:()=>d(y=>!y),children:[(0,e.jsxs)("div",{className:"tool-block-header",children:[(0,e.jsx)("span",{className:"tool-block-icon",children:c}),(0,e.jsx)("span",{className:"tool-block-name",children:l}),u&&(0,e.jsx)("span",{className:"tool-block-preview",children:u}),(0,e.jsx)("span",{className:"tool-block-toggle",children:r?"\u25BE":"\u25B8"})]}),r&&s&&(0,e.jsx)("div",{className:"tool-block-expanded",children:v==="bash"?(0,e.jsx)("pre",{className:"tool-block-code bash",children:(0,e.jsx)("code",{children:s})}):(0,e.jsx)("pre",{className:"tool-block-code",children:(0,e.jsx)("code",{children:s})})})]})}if(t.type==="tool_result"){let c=t.resultContent??"",l=c.split(`
`),i=l[0]?.slice(0,140)??"",u=l.length>1||c.length>140;return(0,e.jsxs)("div",{className:`tool-block tool-result${t.isError?" error":""}`,onClick:()=>u?d(s=>!s):void 0,children:[(0,e.jsxs)("div",{className:"tool-block-header",children:[(0,e.jsx)("span",{className:"tool-block-icon",style:{color:t.isError?"#ef4444":"rgba(148,163,184,0.7)"},children:t.isError?"\u2717":"\u2713"}),(0,e.jsxs)("span",{className:"tool-block-preview",style:{flex:1,fontFamily:"'SF Mono', monospace",fontSize:10},children:[r?"":i,!r&&u&&(0,e.jsx)("span",{style:{opacity:.5},children:" \u2026"})]}),u&&(0,e.jsx)("span",{className:"tool-block-toggle",children:r?"\u25BE":"\u25B8"})]}),r&&(0,e.jsx)("pre",{className:"tool-block-code",style:{color:t.isError?"#fca5a5":void 0},children:(0,e.jsx)("code",{children:c})})]})}return null}function wa(t,a){return t==="Bash"?String(a.command??"").slice(0,60):t==="Read"?String(a.file_path??"").replace(/^.*\//,""):t==="Write"||t==="Edit"?String(a.file_path??"").replace(/^.*\//,""):t==="Grep"?`"${String(a.pattern??"").slice(0,30)}"`:t==="Glob"?String(a.pattern??""):t==="Agent"?String(a.description??"").slice(0,50):t==="WebSearch"?String(a.query??"").slice(0,50):t==="WebFetch"?String(a.url??"").slice(0,50):""}function Xe(t,a){let r=t.split(/(``[^`]+``|`[^`\n]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g);return(0,e.jsx)(o.default.Fragment,{children:r.map((d,c)=>{if(d.startsWith("``")&&d.endsWith("``")||d.startsWith("`")&&d.endsWith("`")){let l=d.startsWith("``")?d.slice(2,-2):d.slice(1,-1);return(0,e.jsx)("code",{style:{background:"var(--bg-card)",padding:"1px 5px",borderRadius:3,fontSize:"0.9em",fontFamily:"'SF Mono', monospace",color:"#e8703a"},children:l},c)}return d.startsWith("**")&&d.endsWith("**")?(0,e.jsx)("strong",{children:d.slice(2,-2)},c):d.startsWith("*")&&d.endsWith("*")?(0,e.jsx)("em",{children:d.slice(1,-1)},c):(0,e.jsx)(o.default.Fragment,{children:d},c)})},a)}function Nt({text:t}){let a=t.split(/(```[\s\S]*?```)/g);return(0,e.jsx)(e.Fragment,{children:a.map((r,d)=>{if(r.startsWith("```")){let l=r.slice(3).split(`
`),i=l[0].trim(),u=l.slice(1).join(`
`).replace(/```\s*$/,"").trimEnd();return(0,e.jsxs)("div",{style:{margin:"8px 0",borderRadius:6,overflow:"hidden",border:"1px solid var(--border)"},children:[i&&(0,e.jsx)("div",{style:{background:"var(--bg-card)",padding:"3px 10px",fontSize:10,color:"var(--text-muted)",fontFamily:"inherit",borderBottom:"1px solid var(--border)"},children:i}),(0,e.jsx)("pre",{style:{margin:0,padding:"10px",background:"var(--bg-primary)",fontSize:11,lineHeight:1.6,overflowX:"auto",fontFamily:"'SF Mono', 'Fira Code', monospace",color:"var(--text-secondary)",whiteSpace:"pre"},children:(0,e.jsx)("code",{children:u})})]},d)}let c=r.split(`
`);return(0,e.jsx)("div",{children:c.map((l,i)=>{let u=l.match(/^(#{1,3})\s+(.*)/);if(u){let v=[18,15,13][u[1].length-1];return(0,e.jsx)("div",{style:{fontWeight:700,fontSize:v,margin:"8px 0 3px",color:"var(--text-primary)",lineHeight:1.3},children:Xe(u[2])},i)}let s=l.match(/^(\s*)([-*+]|\d+\.)\s+(.*)/);if(s){let v=s[1].length;return(0,e.jsxs)("div",{style:{display:"flex",gap:6,paddingLeft:v*8,lineHeight:1.5},children:[(0,e.jsx)("span",{style:{opacity:.5,flexShrink:0,marginTop:1},children:"\u2022"}),(0,e.jsx)("span",{children:Xe(s[3])})]},i)}return l.trim()===""?(0,e.jsx)("div",{style:{height:6}},i):(0,e.jsx)("div",{style:{lineHeight:1.5},children:Xe(l)},i)})},d)})})}function zt({msg:t,isStreaming:a}){let r=t.blocks&&t.blocks.length>0,d=t.role==="user";if(d&&r&&t.blocks.every(u=>u.type==="tool_result")&&!t.content.trim())return(0,e.jsx)("div",{className:"chat-tool-cycle",children:t.blocks.map((u,s)=>(0,e.jsx)(Tt,{block:u,role:t.role},s))});let l=!r||t.blocks.every(u=>u.type==="text"),i=t.ts&&t.ts!=="__streaming__"?new Date(t.ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"}):"";return(0,e.jsxs)("div",{className:`chat-msg ${t.role}`,children:[(0,e.jsxs)("div",{className:"chat-msg-role",children:[(0,e.jsx)("span",{children:d?"\u{1F464} you":"\u{1F916} claude"}),i&&(0,e.jsx)("span",{className:"chat-msg-ts",children:i})]}),l?(0,e.jsxs)("div",{children:[d?(0,e.jsx)("span",{style:{whiteSpace:"pre-wrap"},children:t.content}):(0,e.jsx)(Nt,{text:t.content}),a&&(0,e.jsx)("span",{className:"chat-cursor"})]}):(0,e.jsx)("div",{className:"chat-msg-blocks",children:t.blocks.map((u,s)=>u.type==="text"?(0,e.jsxs)("div",{style:{marginBottom:4},children:[d?(0,e.jsx)("span",{style:{whiteSpace:"pre-wrap"},children:u.text}):(0,e.jsx)(Nt,{text:u.text??""}),a&&s===t.blocks.length-1&&(0,e.jsx)("span",{className:"chat-cursor"})]},s):(0,e.jsx)(Tt,{block:u,role:t.role},s))})]})}function ka({stats:t,isActive:a}){let[r,d]=(0,o.useState)("");(0,o.useEffect)(()=>{function u(){if(!t.firstTs){d("");return}let v=Date.now()-new Date(t.firstTs).getTime(),y=Math.floor(v/36e5),P=Math.floor(v%36e5/6e4),C=Math.floor(v%6e4/1e3);d(y>0?`${y}h ${P}m`:P>0?`${P}m ${C}s`:`${C}s`)}u();let s=setInterval(u,1e3);return()=>clearInterval(s)},[t.firstTs]);let c=t.inputTokens+t.outputTokens+t.cacheWriteTokens+t.cacheReadTokens,l=c>=1e6?`${(c/1e6).toFixed(1)}M`:c>=1e3?`${(c/1e3).toFixed(1)}k`:String(c),i=a?t.lastTool?t.lastTool:"Working":"idle";return(0,e.jsxs)("div",{className:`cc-status-bar${a?" active":""}`,children:[a&&(0,e.jsx)("span",{className:"cc-status-asterisk",children:"*"}),(0,e.jsx)("span",{style:{fontWeight:600},children:i}),r&&(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("span",{style:{opacity:.4},children:"\xB7"}),(0,e.jsxs)("span",{children:["\u23F1 ",r]})]}),c>0&&(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("span",{style:{opacity:.4},children:"\xB7"}),(0,e.jsxs)("span",{children:["\u2193 ",l," tok"]})]}),t.costUsd>0&&(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("span",{style:{opacity:.4},children:"\xB7"}),(0,e.jsxs)("span",{children:["\u2248 $",t.costUsd.toFixed(4)]})]}),t.model&&(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("span",{style:{opacity:.4},children:"\xB7"}),(0,e.jsx)("span",{style:{opacity:.6},children:t.model.replace("claude-","").replace(/-\d{8}$/,"")})]})]})}function Sa({project:t,onSwitchTab:a}){let[r,d]=(0,o.useState)(null);(0,o.useEffect)(()=>{async function i(){let[u,s]=await Promise.all([fetch(`/api/projects/${t.id}/chats`).catch(()=>null),fetch(`/api/projects/${t.id}/plan`).catch(()=>null)]),v=u?.ok?await u.json():[],y=s?.ok?await s.json():{specs:[]},P=v.filter(L=>L.source==="claude-code"),C=v.filter(L=>L.source==="cloudy");d({totalChats:v.length,ccChats:P.length,cloudyChats:C.length,totalMessages:v.reduce((L,O)=>L+O.messageCount,0),activeCC:P.some(L=>L.locked),specFiles:(y.specs??[]).length,lastActive:v[0]?.updatedAt??null})}i()},[t.id]);let c=t.status==="running"?"#22c55e":t.status==="error"?"#ef4444":"#6b7280",l=t.status==="running"?"\u25CF Running":t.status==="error"?"\u25CF Error":"\u25CB Idle";return(0,e.jsxs)("div",{className:"dashboard-tab",children:[(0,e.jsxs)("div",{className:"dashboard-hero",children:[(0,e.jsx)("div",{className:"dashboard-hero-name",children:t.name}),(0,e.jsx)("div",{className:"dashboard-hero-path",children:t.path}),(0,e.jsx)("div",{className:"dashboard-hero-status",style:{color:c},children:l})]}),(0,e.jsxs)("div",{className:"dashboard-cards",children:[(0,e.jsxs)("div",{className:"dashboard-card",onClick:()=>a("chat"),title:"Go to Chat",children:[(0,e.jsx)("div",{className:"dashboard-card-icon",children:(0,e.jsx)(et,{size:20,color:"#a78bfa"})}),(0,e.jsx)("div",{className:"dashboard-card-value",children:r?.totalChats??"\u2014"}),(0,e.jsx)("div",{className:"dashboard-card-label",children:"conversations"}),(0,e.jsx)("div",{className:"dashboard-card-sub",children:r?`${r.ccChats} CC \xB7 ${r.cloudyChats} Cloudy`:""})]}),(0,e.jsxs)("div",{className:"dashboard-card",children:[(0,e.jsx)("div",{className:"dashboard-card-icon",children:(0,e.jsx)(It,{size:20,color:"#e8703a"})}),(0,e.jsx)("div",{className:"dashboard-card-value",children:r?.totalMessages??"\u2014"}),(0,e.jsx)("div",{className:"dashboard-card-label",children:"messages"}),(0,e.jsx)("div",{className:"dashboard-card-sub",children:r?.lastActive?`last ${ce(r.lastActive)}`:""})]}),(0,e.jsxs)("div",{className:"dashboard-card",onClick:()=>a("plan"),title:"Go to Build",children:[(0,e.jsx)("div",{className:"dashboard-card-icon",children:(0,e.jsx)(We,{size:20,color:"#38bdf8"})}),(0,e.jsx)("div",{className:"dashboard-card-value",children:r?.specFiles??"\u2014"}),(0,e.jsx)("div",{className:"dashboard-card-label",children:"spec files"}),(0,e.jsx)("div",{className:"dashboard-card-sub",children:"in plan"})]}),(0,e.jsxs)("div",{className:"dashboard-card",onClick:()=>a("run"),title:"Go to Run",children:[(0,e.jsx)("div",{className:"dashboard-card-icon",children:(0,e.jsx)(Ne,{size:20,color:"#fb923c"})}),(0,e.jsx)("div",{className:"dashboard-card-value",children:t.runCount??0}),(0,e.jsx)("div",{className:"dashboard-card-label",children:"runs"}),(0,e.jsx)("div",{className:"dashboard-card-sub",children:t.lastRunAt?`last ${ce(t.lastRunAt)}`:"never run"})]})]}),r?.activeCC&&(0,e.jsxs)("div",{className:"dashboard-live-banner",onClick:()=>a("chat"),children:[(0,e.jsx)("span",{style:{color:"#ef4444"},children:"\u25CF"}),(0,e.jsxs)("span",{children:["Claude Code CLI session active \u2014 ",(0,e.jsx)("u",{children:"watch live"})]})]}),(0,e.jsxs)("div",{className:"dashboard-actions",children:[(0,e.jsxs)("button",{className:"daemon-btn",onClick:()=>a("chat"),children:[(0,e.jsx)(et,{size:13,color:"currentColor"})," New Chat"]}),(0,e.jsxs)("button",{className:"daemon-btn",onClick:()=>a("plan"),children:[(0,e.jsx)(We,{size:13,color:"currentColor"})," Build"]}),(0,e.jsxs)("button",{className:"daemon-btn",onClick:()=>a("run"),children:[(0,e.jsx)(Ne,{size:13,color:"currentColor"})," Run"]})]})]})}var Ca=[{name:"help",description:"Show available commands",usage:"/help"},{name:"clear",description:"Start a new chat session",usage:"/clear"},{name:"cost",description:"Show token usage and cost for session",usage:"/cost"},{name:"model",description:"Switch model (haiku/sonnet/opus)",usage:"/model <model>"},{name:"status",description:"Show project status",usage:"/status"},{name:"memory",description:"Open project memory / CLAUDE.md",usage:"/memory"},{name:"plan",description:"Add a spec file to the Plan tab",usage:"/plan <file>"},{name:"compact",description:"Compact context (CLI only)",usage:"/compact"}];function Ta({project:t,onSwitchTab:a,initialSessionId:r,onSessionSelect:d}){let[c,l]=(0,o.useState)([]),[i,u]=(0,o.useState)(r??null),[s,v]=(0,o.useState)(null),[y,P]=(0,o.useState)([]),[C,L]=(0,o.useState)(0),[O,I]=(0,o.useState)([]),[W,A]=(0,o.useState)(!1),[Q,j]=(0,o.useState)(""),[G,Z]=(0,o.useState)(!1),[ae,B]=(0,o.useState)(!0),[K,S]=(0,o.useState)(""),[q,U]=(0,o.useState)(!1),[F,D]=(0,o.useState)(!1),[H,ne]=(0,o.useState)(null),[X,pe]=(0,o.useState)(null),[ee,ke]=(0,o.useState)(()=>{let n=localStorage.getItem("chat-effort");return n==="low"||n==="medium"||n==="high"?n:"medium"}),[ue,we]=(0,o.useState)(()=>parseFloat(localStorage.getItem("chat-budget")??"0")||0),[oe,V]=(0,o.useState)({open:!1,items:[],idx:0}),[b,z]=(0,o.useState)("all"),h=(0,o.useRef)(null),k=(0,o.useRef)(null),m=(0,o.useRef)(null);(0,o.useEffect)(()=>{localStorage.setItem("chat-effort",ee)},[ee]),(0,o.useEffect)(()=>{localStorage.setItem("chat-budget",String(ue))},[ue]);let se=s?.model??"sonnet",J=(0,o.useCallback)(async()=>{let n=await fetch(`/api/projects/${t.id}/chats`).catch(()=>null);if(n?.ok){let g=await n.json();l(g)}},[t.id]);(0,o.useEffect)(()=>{J()},[J]);let Y=(0,o.useRef)(!1);(0,o.useEffect)(()=>{if(Y.current||!r||c.length===0)return;let n=c.find(g=>g.id===r);n&&(Y.current=!0,De(n))},[c,r]),(0,o.useEffect)(()=>{if(!i){v(null);return}fetch(`/api/projects/${t.id}/chats/${i}`).then(n=>n.json()).then(n=>v(n)).catch(()=>{})},[i,t.id]),(0,o.useEffect)(()=>{if(m.current&&(clearInterval(m.current),m.current=null),!(!i||!F||!ae))return m.current=setInterval(async()=>{let n=await fetch(`/api/projects/${t.id}/chats/${i}`).catch(()=>null);if(!n?.ok)return;let g=await n.json();if(v(f=>f&&f.messages.length===g.messages.length?f:g),J(),i?.startsWith("cc:")){let f=await fetch(`/api/projects/${t.id}/chats/${i}/stats`).catch(()=>null);if(f?.ok){let w=await f.json();ne(w)}if(y.length>0){let w=[i,...y.map(E=>E.id)],N=(await Promise.all(w.map(E=>fetch(`/api/projects/${t.id}/chats/${E}/stats`).then(_=>_.ok?_.json():null).catch(()=>null)))).filter(Boolean);if(N.length>0){let E={inputTokens:0,outputTokens:0,cacheWriteTokens:0,cacheReadTokens:0,costUsd:0,durationMs:0,messageCount:0,lastTool:N[0].lastTool,firstTs:null,lastTs:null,model:N[0].model};for(let _ of N)E.inputTokens+=_.inputTokens,E.outputTokens+=_.outputTokens,E.cacheWriteTokens+=_.cacheWriteTokens,E.cacheReadTokens+=_.cacheReadTokens,E.costUsd+=_.costUsd,E.messageCount+=_.messageCount,_.firstTs&&(!E.firstTs||_.firstTs<E.firstTs)&&(E.firstTs=_.firstTs),_.lastTs&&(!E.lastTs||_.lastTs>E.lastTs)&&(E.lastTs=_.lastTs);E.firstTs&&E.lastTs&&(E.durationMs=new Date(E.lastTs).getTime()-new Date(E.firstTs).getTime()),pe(E)}}}},2e3),()=>{m.current&&clearInterval(m.current)}},[i,F,ae,t.id,J]),(0,o.useEffect)(()=>{if(!i?.startsWith("cc:")){ne(null),pe(null);return}fetch(`/api/projects/${t.id}/chats/${i}/stats`).then(n=>n.json()).then(n=>ne(n)).catch(()=>{})},[i,t.id]),(0,o.useEffect)(()=>{if(!i?.startsWith("cc:")||y.length===0){pe(null);return}let n=[i,...y.map(g=>g.id)];Promise.all(n.map(g=>fetch(`/api/projects/${t.id}/chats/${g}/stats`).then(f=>f.ok?f.json():null).catch(()=>null))).then(g=>{let f=g.filter(Boolean);if(f.length===0)return;let w={inputTokens:0,outputTokens:0,cacheWriteTokens:0,cacheReadTokens:0,costUsd:0,durationMs:0,messageCount:0,lastTool:f[0].lastTool,firstTs:null,lastTs:null,model:f[0].model};for(let $ of f)w.inputTokens+=$.inputTokens,w.outputTokens+=$.outputTokens,w.cacheWriteTokens+=$.cacheWriteTokens,w.cacheReadTokens+=$.cacheReadTokens,w.costUsd+=$.costUsd,w.messageCount+=$.messageCount,$.firstTs&&(!w.firstTs||$.firstTs<w.firstTs)&&(w.firstTs=$.firstTs),$.lastTs&&(!w.lastTs||$.lastTs>w.lastTs)&&(w.lastTs=$.lastTs);w.firstTs&&w.lastTs&&(w.durationMs=new Date(w.lastTs).getTime()-new Date(w.firstTs).getTime()),pe(w)})},[i,y,t.id]),(0,o.useEffect)(()=>{h.current?.scrollIntoView({behavior:"smooth"})},[s?.messages.length,G]),(0,o.useEffect)(()=>{let n=new EventSource("/api/live");return n.onmessage=g=>{let f;try{f=JSON.parse(g.data)}catch{return}if(f.type==="chat_token"&&f.sessionId===i){let w=kt(f.token);v($=>{if(!$)return $;let N=[...$.messages],E=N[N.length-1];return E?.role==="assistant"&&E.ts==="__streaming__"?N[N.length-1]={...E,content:E.content+w}:N.push({role:"assistant",content:w,ts:"__streaming__"}),{...$,messages:N}})}else f.type==="chat_done"&&f.sessionId===i?(Z(!1),v(w=>w&&{...w,messages:w.messages.map($=>$.ts==="__streaming__"?{...$,ts:new Date().toISOString()}:$)}),J()):f.type==="chat_session_created"?J():f.type==="cc_session_locked"&&f.sessionId===i&&(Z(!1),D(!0),v(w=>{if(!w)return w;let $=w.messages.map(N=>N.ts==="__streaming__"?{...N,ts:new Date().toISOString()}:N);return{...w,messages:[...$,{role:"assistant",content:"\u{1F512} Claude Code CLI opened this session \u2014 control returned to terminal.",ts:new Date().toISOString()}]}}),J())},()=>n.close()},[i,J]);async function ge(){let n=await fetch(`/api/projects/${t.id}/chats`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"sonnet"})});if(n.ok){let g=await n.json();l(f=>[{id:g.id,name:g.name,model:g.model,source:"cloudy",locked:!1,messageCount:0,updatedAt:g.updatedAt,preview:""},...f]),u(g.id),v(g),D(!1),d?.(g.id)}}function De(n){if(I([]),L(0),P([]),D(n.locked),u(n.id),d?.(n.id),n.source==="claude-code"){let g=c.filter(w=>w.source==="claude-code"),f=g.findIndex(w=>w.id===n.id);f>=0&&P(g.slice(f+1))}}async function $e(){if(W||C>=y.length)return;A(!0);let n=y[C];try{let g=await fetch(`/api/projects/${t.id}/chats/${n.id}`);if(g.ok){let f=await g.json();I(w=>[...f.messages,...w]),L(w=>w+1)}}finally{A(!1)}}function ze(n){n.currentTarget.scrollTop<80&&$e()}async function He(n,g){g.stopPropagation(),await fetch(`/api/projects/${t.id}/chats/${n}`,{method:"DELETE"}),l(f=>f.filter(w=>w.id!==n)),i===n&&(u(null),v(null))}function he(n,g){v(f=>f&&{...f,messages:[...f.messages,{role:"user",content:n,ts:new Date().toISOString()},{role:"assistant",content:g,ts:new Date().toISOString()}]})}async function Pe(){let n=Q.trim();if(!n||G)return;if(V({open:!1,items:[],idx:0}),n==="/help"){he("/help",["**Available slash commands**","","`/help` \u2014 show this help","`/clear` \u2014 start a new chat session","`/cost` \u2014 show token usage and cost","`/model <haiku|sonnet|opus>` \u2014 switch model","`/status` \u2014 show project status","`/memory` \u2014 open project memory / CLAUDE.md tab","`/plan <file>` \u2014 add a spec to the Plan tab","`/compact` \u2014 compact context (CLI-only)","","**CLI commands**","`cloudy plan` \u2014 create a plan from a spec","`cloudy run` \u2014 execute the current plan","`cloudy pipeline` \u2014 chain multiple specs into one run","`cloudy daemon` \u2014 manage the daemon"].join(`
`)),j("");return}if(n==="/clear"){j(""),await ge();return}if(n==="/cost"){let f=X??H,w=f?["**Token usage & cost**","",`\u2022 Input tokens: ${f.inputTokens.toLocaleString()}`,`\u2022 Output tokens: ${f.outputTokens.toLocaleString()}`,`\u2022 Cache write: ${f.cacheWriteTokens.toLocaleString()}`,`\u2022 Cache read: ${f.cacheReadTokens.toLocaleString()}`,`\u2022 **Total cost: $${f.costUsd.toFixed(6)}**`,`\u2022 Model: \`${f.model??"unknown"}\``].join(`
`):"No stats available for this session.";he("/cost",w),j("");return}if(n.startsWith("/model ")||n==="/model"){let f=n.slice(7).trim();["haiku","sonnet","opus"].includes(f)?(await Ie(f),he(n,`Switched to \`${f}\``)):he(n,`Unknown model: \`${f||"(none)"}\`. Available: \`haiku\`, \`sonnet\`, \`opus\``),j("");return}if(n==="/status"){let f=[`**Project: ${t.name}**`,"",`\u2022 Path: \`${t.path}\``,`\u2022 Status: ${t.status}`,`\u2022 Last run: ${ce(t.lastRunAt)||"never"}`];t.taskProgress&&f.push(`\u2022 Tasks: ${t.taskProgress.done}/${t.taskProgress.total}`),t.costUsd&&f.push(`\u2022 Cost: $${t.costUsd.toFixed(4)}`),he("/status",f.join(`
`)),j("");return}if(n==="/memory"){j(""),a("memory");return}if(n==="/compact"){he("/compact","`/compact` is a CLI-only command. Run it in your terminal:\n```\ncloudy compact\n```\nor use Claude Code directly."),j("");return}if(n.startsWith("/plan ")||n.startsWith("/scope ")){let f=n.slice(n.indexOf(" ")+1).trim();await ve(`/api/projects/${t.id}/plan`,{specPaths:f?[f]:[]}),a("plan"),j("");return}if(n.startsWith("/")){let f=n.split(" ")[0];he(n,`Unknown command: \`${f}\`. Type \`/help\` for available commands.`),j("");return}j(""),Z(!0),v(f=>f&&{...f,messages:[...f.messages,{role:"user",content:n,ts:new Date().toISOString()}]});let g=await ve(`/api/projects/${t.id}/chat`,{sessionId:i,message:n,effort:ee,...ue>0?{maxBudgetUsd:ue}:{}});if(!g.ok){Z(!1);let f=await g.json().catch(()=>({error:"Unknown error"}));g.status===423?D(!0):alert(`Error: ${f.error}`)}}async function Me(){if(!i||!K.trim()){U(!1);return}if(i?.startsWith("cc:")){await fetch(`/api/projects/${t.id}/chats/${i}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:K})}),l(n=>n.map(g=>g.id===i?{...g,name:K}:g)),U(!1);return}await fetch(`/api/projects/${t.id}/chats/${i}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:K.trim()})}),l(n=>n.map(g=>g.id===i?{...g,name:K.trim()}:g)),v(n=>n&&{...n,name:K.trim()}),U(!1)}async function Ie(n){i&&(await fetch(`/api/projects/${t.id}/chats/${i}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:n})}),v(g=>g&&{...g,model:n}))}let me=c.find(n=>n.id===i);return(0,e.jsxs)("div",{className:"chat-layout",children:[(0,e.jsxs)("div",{className:"chat-sidebar",children:[(0,e.jsxs)("div",{className:"chat-sidebar-header",children:[(0,e.jsx)("span",{children:"\u{1F4AC} chats"}),(0,e.jsx)("button",{className:"chat-new-btn",onClick:ge,title:"New chat",children:"\uFF0B"})]}),(0,e.jsxs)("div",{className:"chat-sidebar-list",children:[c.length===0&&(0,e.jsxs)("div",{style:{padding:"16px 10px",color:"var(--text-muted)",fontSize:11,textAlign:"center"},children:["No chats yet.",(0,e.jsx)("br",{}),"Start a new one \u2191"]}),(()=>{let n=c.filter(N=>N.source==="cloudy"),g=c.filter(N=>N.source==="claude-code"),[f,...w]=g,$=(N,E=0)=>(0,e.jsxs)("div",{className:`chat-session-item${i===N.id?" active":""}${N.locked?" locked":""}`,onClick:()=>De(N),title:N.locked?"\u{1F512} Active in Claude Code CLI \u2014 click to watch live":N.preview,children:[(0,e.jsxs)("div",{className:"chat-session-item-top",children:[(0,e.jsx)("span",{className:`session-badge ${N.source==="claude-code"?"cc":"cw"}`,children:N.source==="claude-code"?"CC":"\u2601"}),N.locked&&(0,e.jsx)(St,{size:11,color:"#ef4444"}),(0,e.jsx)("span",{className:"chat-session-name",children:N.name}),!N.locked&&N.source==="cloudy"&&(0,e.jsx)("button",{className:"chat-session-delete",onClick:_=>He(N.id,_),title:"Delete",children:"\xD7"})]}),(0,e.jsxs)("div",{className:"chat-session-meta",children:[N.messageCount," msgs \xB7 ",ce(N.updatedAt),E>0&&(0,e.jsxs)("span",{className:"chat-compaction-badge",title:"Claude Code compacted context to free space. Scroll up in chat to load earlier messages.",children:[" \xB7 ",E,"\u2702"]})]})]},N.id);return(0,e.jsxs)(e.Fragment,{children:[n.length>0&&(0,e.jsxs)("div",{children:[(0,e.jsx)("div",{className:"chat-group-label",children:"Cloudy"}),n.map(N=>$(N))]}),f&&(0,e.jsx)("div",{children:$(f,w.length)})]})})()]})]}),(0,e.jsx)("div",{className:"chat-main",children:i?(0,e.jsxs)(e.Fragment,{children:[F&&(0,e.jsxs)("div",{className:"locked-banner",children:[(0,e.jsx)(St,{size:14,color:me?.locked?"#ef4444":"#a78bfa"}),(0,e.jsx)("span",{style:{color:me?.locked?"#ef4444":"#a78bfa"},children:me?.locked?"Active in Claude Code CLI \u2014 live stream":"Claude Code session \u2014 read-only \xB7 resume in terminal to continue"})]}),(0,e.jsxs)("div",{className:"chat-header",children:[q?(0,e.jsx)("input",{className:"chat-title-input",value:K,onChange:n=>S(n.target.value),onBlur:Me,onKeyDown:n=>{n.key==="Enter"&&Me(),n.key==="Escape"&&U(!1)},autoFocus:!0}):(0,e.jsx)("input",{className:"chat-title-input",value:s?.name??me?.name??"",readOnly:!1,onFocus:()=>{S(s?.name??me?.name??""),U(!0)},title:"Click to rename"}),me?.source==="cloudy"&&!F&&(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)(ye,{value:se,onChange:Ie,label:"Model"}),(0,e.jsxs)("select",{className:"daemon-model-select",value:ee,onChange:n=>ke(n.target.value),style:{fontSize:11},title:"Effort level",children:[(0,e.jsx)("option",{value:"low",children:"\u{1FAB6} low"}),(0,e.jsx)("option",{value:"medium",children:"\u2696 medium"}),(0,e.jsx)("option",{value:"high",children:"\u{1F525} high"})]}),(0,e.jsx)("input",{type:"number",className:"daemon-model-select",value:ue||"",onChange:n=>we(parseFloat(n.target.value)||0),placeholder:"$ cap",min:0,step:.1,style:{fontSize:11,width:64},title:"Max spend per response (USD, 0 = unlimited)"})]}),me?.source==="claude-code"&&(0,e.jsx)("span",{className:"session-badge cc",style:{fontSize:10,padding:"2px 7px"},children:"Claude Code"})]}),(0,e.jsx)("div",{className:"chat-filter-bar",children:["all","mine","claude","tools"].map(n=>(0,e.jsx)("button",{className:`chat-filter-chip${b===n?" active":""}`,onClick:()=>z(n),children:n==="all"?"All":n==="mine"?"\u{1F535} Mine":n==="claude"?"\u{1F7E0} Claude":"\u2699\uFE0F Tools"},n))}),(0,e.jsxs)("div",{className:"chat-messages",ref:k,onScroll:ze,children:[y.length>0&&C<y.length&&(0,e.jsxs)("div",{className:"chat-load-earlier",onClick:$e,children:[W?(0,e.jsx)("span",{className:"spinner",style:{width:12,height:12}}):"\u2191"," ",W?"Loading\u2026":`Load earlier (${y.length-C} compaction${y.length-C!==1?"s":""} remaining)`]}),O.filter(n=>b==="all"?!0:b==="mine"?n.role==="user"&&(n.content.trim()||n.blocks?.some(g=>g.type!=="tool_result")):b==="claude"?n.role==="assistant":b==="tools"?n.blocks?.some(g=>g.type==="tool_use"||g.type==="tool_result"):!0).map((n,g)=>(0,e.jsx)(zt,{msg:n},`pre-${g}`)),O.length>0&&(0,e.jsx)("div",{className:"chat-segment-divider",children:(0,e.jsx)("span",{title:"Claude Code compacted context here \u2014 new segment started",children:"\u2702 compaction"})}),(s?.messages??[]).filter(n=>b==="all"?!0:b==="mine"?n.role==="user"&&(n.content.trim()||n.blocks?.some(g=>g.type!=="tool_result")):b==="claude"?n.role==="assistant":b==="tools"?n.blocks?.some(g=>g.type==="tool_use"||g.type==="tool_result"):!0).map((n,g)=>(0,e.jsx)(zt,{msg:n,isStreaming:n.ts==="__streaming__"},g)),(0,e.jsx)("div",{ref:h})]}),me?.source==="claude-code"&&(X??H)&&(0,e.jsx)(ka,{stats:X??H,isActive:!!F&&ae}),F?(0,e.jsxs)("div",{className:"chat-hint",style:{display:"flex",alignItems:"center",justifyContent:"center",gap:10},children:[(0,e.jsx)("span",{children:"\u{1F512} Claude Code CLI is active \xB7 switch to terminal to send"}),(0,e.jsx)("button",{className:"daemon-btn",style:{fontSize:10,padding:"2px 8px"},onClick:()=>B(n=>!n),title:ae?"Pause live updates":"Resume live updates",children:ae?"\u23F8 pause":"\u25B6 watch live"})]}):(0,e.jsxs)(e.Fragment,{children:[(0,e.jsxs)("div",{style:{position:"relative"},children:[oe.open&&oe.items.length>0&&(0,e.jsx)("div",{className:"slash-menu",children:oe.items.map((n,g)=>(0,e.jsxs)("div",{className:`slash-menu-item${g===oe.idx?" active":""}`,onMouseDown:f=>{f.preventDefault();let w=n.usage.includes("<");j(w?`/${n.name} `:`/${n.name}`),V({open:!1,items:[],idx:0})},children:[(0,e.jsxs)("span",{className:"slash-menu-cmd",children:["/",n.name]}),(0,e.jsx)("span",{className:"slash-menu-usage",children:n.usage}),(0,e.jsx)("span",{className:"slash-menu-desc",children:n.description})]},n.name))}),(0,e.jsxs)("div",{className:"chat-input-row",children:[(0,e.jsx)("textarea",{className:"chat-input",rows:2,placeholder:G?"\u23F3 Claude is thinking...":"\u{1F4AC} Message or /command (Enter to send, Shift+Enter for newline)",value:Q,onChange:n=>{let g=n.target.value;if(j(g),g.startsWith("/")&&!g.includes(`
`)){let f=g.slice(1).split(" ")[0].toLowerCase();if(g.includes(" "))V({open:!1,items:[],idx:0});else{let $=Ca.filter(N=>N.name.startsWith(f));V({open:$.length>0,items:$,idx:0})}}else V({open:!1,items:[],idx:0})},disabled:G,onKeyDown:n=>{if(oe.open){if(n.key==="ArrowDown"){n.preventDefault(),V(g=>({...g,idx:Math.min(g.idx+1,g.items.length-1)}));return}if(n.key==="ArrowUp"){n.preventDefault(),V(g=>({...g,idx:Math.max(g.idx-1,0)}));return}if(n.key==="Tab"||n.key==="Enter"){n.preventDefault();let g=oe.items[oe.idx];if(g){let f=g.usage.includes("<");j(f?`/${g.name} `:`/${g.name}`),V({open:!1,items:[],idx:0}),f||setTimeout(()=>Pe(),0)}return}if(n.key==="Escape"){V({open:!1,items:[],idx:0});return}}n.key==="Enter"&&!n.shiftKey&&(n.preventDefault(),Pe())}}),(0,e.jsx)("button",{className:"daemon-btn primary",onClick:Pe,disabled:G||!Q.trim(),children:G?"\u23F3":"\u2191 Send"})]})]}),(0,e.jsxs)("div",{className:"chat-hint",children:["\u{1F4A1} type ",(0,e.jsx)("kbd",{children:"/"})," for commands \xA0\xB7\xA0 Shift+Enter for newline"]})]})]}):(0,e.jsxs)("div",{className:"daemon-empty",style:{flex:1},children:[(0,e.jsx)("div",{className:"daemon-empty-icon",children:(0,e.jsx)(It,{size:40,color:"#a78bfa"})}),(0,e.jsx)("div",{className:"daemon-empty-title",children:"\u{1F4AC} Chat with Claude"}),(0,e.jsx)("div",{className:"daemon-empty-sub",children:"Select a session or start a new one \u2191"}),(0,e.jsx)("div",{style:{marginTop:8,fontSize:11,color:"var(--text-muted)"},children:"CC = Claude Code CLI sessions \xB7 \u2601 = Cloudy sessions"})]})})]})}function Na({project:t}){let[a,r]=(0,o.useState)([]),[d,c]=(0,o.useState)(!0),[l,i]=(0,o.useState)(null);(0,o.useEffect)(()=>{c(!0),fetch(`/api/projects/${t.id}/memory`).then(s=>s.ok?s.json():Promise.reject(s.status)).then(s=>{r(s.files),s.files.length>0&&i(s.files[0].path),c(!1)}).catch(()=>{c(!1)})},[t.id]);let u=a.find(s=>s.path===l);return(0,e.jsxs)("div",{className:"memory-tab",children:[(0,e.jsxs)("div",{className:"memory-header",children:[(0,e.jsx)("span",{style:{fontWeight:600,fontSize:13},children:"\u{1F4CB} Project Memory"}),(0,e.jsx)("div",{style:{display:"flex",gap:4},children:a.map(s=>(0,e.jsx)("button",{className:`daemon-btn${l===s.path?" primary":""}`,style:{fontSize:11},onClick:()=>i(s.path),children:s.path.split("/").pop()},s.path))})]}),d?(0,e.jsx)("div",{style:{padding:20,color:"var(--text-secondary)"},children:"Loading memory files\u2026"}):a.length===0?(0,e.jsxs)("div",{style:{padding:20,color:"var(--text-secondary)"},children:["No memory files found.",(0,e.jsx)("br",{}),(0,e.jsxs)("span",{style:{fontSize:11,opacity:.6},children:["Create ",(0,e.jsx)("code",{children:"CLAUDE.md"})," or ",(0,e.jsx)("code",{children:".claude/MEMORY.md"})," in your project."]})]}):(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("div",{style:{fontSize:11,color:"var(--text-secondary)",padding:"2px 12px 6px",opacity:.6},children:u?.path}),(0,e.jsx)("pre",{className:"memory-content",children:u?.content??""})]})]})}var za=["\u2601\uFE0F  Cloudy: AI that codes while you sleep","\u26A1  Parallel tasks run simultaneously across git worktrees \u2014 zero conflicts guaranteed","\u{1F680}  Cloudy can plan, code, validate, and review \u2014 all while you grab a snack","\u{1F3AF}  Confidence threshold: 0.85 \u2014 if the AI isn't sure, it asks. Refreshingly honest.","\u{1F52E}  Pipeline mode: chain multiple specs together. Watch your whole product build itself.","\u{1F4A1}  Tip: Use cloudy.local for a clean URL. No port numbers, no fuss.","\u{1F319}  Running overnight? Use --heartbeat-interval to track progress while you dream.","\u{1F510}  All AI decisions are logged. Every token, every cost, every choice. Full audit trail.","\u{1F9E9}  Spec files are just markdown. Write naturally, Cloudy does the rest.","\u{1F41B}  Cloudy retries failed tasks automatically. Persistent like a senior dev at 11pm.","\u{1F3A8}  Dark mode, light mode, system mode. We care about your eyes at 2am.","\u{1F3C6}  Three AI tiers: fast (Mistral), mid (DeepSeek), top (Gemini 2.5 Pro). Best model wins.","\u{1F9E0}  Claude thinks in tokens. One token \u2248 \xBE of a word. Your whole codebase? Probably fits.","\u{1F4CB}  Planning Q&A: Cloudy asks clarifying questions before touching a single line of code.","\u{1F504}  Re-run recovery: interrupted tasks reset to pending automatically. No lost work.","\u{1F4B0}  Cost tracking per task, per run, per model. Know exactly what your AI bill is doing.","\u{1F310}  Daemon serves all your projects at once. One port, infinite projects.","\u2699\uFE0F  Config lives in .cloudy/config.json \u2014 version-controllable, team-shareable.","\u{1F6E1}\uFE0F  Validation gate: TypeScript, lint, build, tests, AI review. Six layers of confidence.","\u{1F4E1}  SSE streaming: watch output in real time without polling. The dashboard just knows.","\u{1F5C2}\uFE0F  Saved plans persist across sessions. Build a library of reusable specs.","\u{1F517}  Pipeline chains are drag-and-drop. Orchestrate your entire product in one screen.","\u23F8\uFE0F  Stop button kills the active process cleanly. SIGTERM, then clean up. No orphans.","\u{1F30D}  Multi-project: fitkind, univiirse, goala \u2014 all in the sidebar, all in one daemon.","\u{1F501}  cloudy run --retry-failed resets only failed tasks. Resume from exactly where it broke.","\u{1F4DD}  Memory tab stores persistent context that shapes every future AI decision.","\u{1F91D}  Approval mode: review each task before it runs. You stay in control.","\u{1F9EA}  --dry-run previews the plan without executing. Inspect before you commit.","\u26A1  Fast model handles 75% of tasks. Cheap, quick, surprisingly smart.","\u{1F9EC}  Mid model escalates complex tasks. DeepSeek V3 at $0.14/M \u2014 criminally good value.","\u{1F451}  Top model (Gemini 2.5 Pro) for the hard stuff. Worth every cent.","\u{1F4E6}  All three tiers configurable per project. Rotate models without touching code.","\u{1F50D}  Task dependency graph: Cloudy figures out what can run in parallel automatically.","\u{1F331}  Start small: one spec file, one goal. Scale when you're ready.","\u{1F3D7}\uFE0F  Worktrees give each parallel task its own git branch. Merge when done.","\u{1F4AC}  Chat tab: talk to Claude about your project while it's running. Multitasking genius.","\u{1F4CA}  History tab: every run, every task, every outcome. Searchable, filterable.","\u{1F3AA}  Engines: claude-code (default), pi-mono, goose. Each has its strengths.","\u{1F512}  Locked sessions: protect important chat history from accidental deletion.","\u{1F3F7}\uFE0F  Project tags auto-filter your spec library. Find anything in milliseconds.","\u{1F6A6}  Status indicator goes green on success, red on failure, orange on active. Always visible.","\u{1F4C8}  Cost per run displayed in History. Watch your AI spend go down as prompts improve.","\u{1F300}  Spec search is fuzzy. Type anything, find everything.","\u{1F3AD}  The daemon badge means it's always-on. Background server, always ready.","\u{1F6E0}\uFE0F  cloudy setup runs an interactive wizard. Never guess a config option again.","\u{1F30A}  Output ring buffer: reload the page, all recent output replays instantly.","\u{1F9F2}  Drag specs into the pipeline chain. Order matters. Cloudy respects it.","\u{1F3AC}  Run tab shows live output line by line as Claude codes. Like watching magic.","\u{1F9BE}  AI model routing: auto mode picks the cheapest model that can handle each task.","\u{1F4EE}  Register a project once, access it forever. The daemon never forgets.","\u{1F527}  Pre-commit hooks, lint, typecheck \u2014 all run inside the validation gate.","\u{1F31F}  Daily driver: open cloudy.local in the morning. Your AI dev team is already at work.","\u{1F9EF}  Max cost limits: set a ceiling per task and per run. The AI won't overspend.","\u{1F5FA}\uFE0F  Topological sort ensures tasks run in the right order. Dependency-aware by default.","\u{1F50A}  Notifications: get pinged when runs complete. Never stare at a progress bar again.","\u{1FA84}  cloudy init <goal> turns a description into a full task plan in seconds.","\u{1F3B0}  Random model fallbacks: if the primary is down, a backup kicks in automatically.","\u{1F9F2}  MCP server: Claude Code and OpenClaw can drive Cloudy autonomously.","\u2697\uFE0F  Validation commands are customisable. Add any shell command to the gate.","\u{1F393}  Planning model is separate from execution. Use a cheaper model to plan, smarter to build.","\u{1F308}  The ticker cycles through 500 items. You're reading number 64 right now.","\u2615  Fun fact: 83% of developers admit to coding better after coffee. The other 17% are lying.",'\u{1F980}  "It works on my machine" \u2014 famous last words before Cloudy existed',"\u{1F4CA}  The average developer context-switches 400 times per day. Cloudy doesn't have that problem.","\u{1F605}  There are only 10 types of people: those who understand binary and those who don't.","\u{1F525}  A QA engineer walks into a bar. Orders 0 beers. Orders 999999999 beers. Orders -1 beers.",`\u{1F480}  "It's not a bug, it's an undocumented feature." \u2014 every developer, always`,"\u{1F926}  99 little bugs in the code. Take one down, patch it around. 127 little bugs in the code.","\u{1F9DF}  Legacy code: code written by someone who is no longer available to explain it.","\u{1F3AF}  Why do programmers prefer dark mode? Because light attracts bugs.",`\u{1F319}  A programmer's wife says "Go to the store, get a gallon of milk, and if they have eggs, get 12." He returns with 12 gallons of milk.`,"\u{1F4AC}  Documentation is like a love letter to your future self. Most devs never write love letters.",'\u{1F916}  A programmer is told "you have a problem. Use regex." Now they have two problems.','\u{1F52E}  "Talk is cheap. Show me the code." \u2014 Linus Torvalds',"\u{1F624}  Hours of debugging can save you minutes of reading documentation.","\u{1F570}\uFE0F  The best way to predict the future is to implement it.","\u{1F4A1}  A clean codebase is a loved codebase. Cloudy keeps it clean.","\u{1F3B2}  Rubber duck debugging: explain your code to a duck. The duck judges silently.","\u{1F3C3}  Move fast and break things. Cloudy moves fast and validates things.","\u{1F937}  Undefined is not a function. Neither is undefined is not a function.","\u{1F631}  HTTPS everywhere. Except that one internal dashboard running on HTTP on port 3000.","\u{1F9E9}  Spaghetti code: when your codebase looks like someone threw the architecture at a wall.","\u{1F30A}  Imposter syndrome: feeling like a fraud while shipping features faster than anyone else.","\u{1F3AA}  Senior developer: one who has made all the mistakes already.","\u26A1  If debugging is the process of removing bugs, then programming is the process of adding them.","\u{1F300}  The first rule of optimisation: don't. The second: don't yet.","\u{1F511}  Any code of your own that you haven't looked at for 6 months might as well have been written by someone else.","\u{1F3AF}  Premature optimisation is the root of all evil. Premature pessimisation is just sad.","\u{1F921}  There are two hard things in computer science: cache invalidation, naming things, and off-by-one errors.","\u{1F9E0}  Measuring programming progress by lines of code is like measuring aircraft building by weight.","\u{1F3B8}  If you can't explain it simply, you don't understand it well enough. \u2014 Einstein (about your architecture)","\u{1F3C6}  The best code is no code at all.","\u{1F30D}  Programs must be written for people to read, and only incidentally for machines to execute.","\u{1F680}  First, solve the problem. Then, write the code.","\u{1F480}  Technical debt is like a loan. It has interest. Eventually it forecloses.","\u{1F52D}  Every great developer you know got there by solving problems they were unqualified to solve.","\u{1F91D}  The best way to get a project done faster is to start sooner.","\u{1F3AD}  Software is like entropy: it always increases.",`\u{1F9EF}  The most dangerous phrase: "We've always done it this way."`,"\u{1F98B}  A small change in requirements can cause a large change in implementation.","\u{1F3A8}  Code is read more than it is written. Write for the reader.","\u{1F331}  Junior devs: make it work. Mid devs: make it right. Senior devs: make it maintainable.","\u{1F510}  Security is not a feature. It's a foundation.",'\u{1F3AC}  "First, make it work. Then make it right. Then make it fast." \u2014 Kent Beck',"\u{1F9EA}  TDD: write the test, watch it fail, write the code, watch it pass. Repeat forever.","\u{1F30A}  The best documentation is code so clear it doesn't need documentation.","\u2699\uFE0F  Automate the boring stuff. That's why Cloudy exists.","\u{1F9BE}  AI doesn't replace developers. It gives developers superpowers.","\u{1F3AF}  A bug is just a feature you haven't appreciated yet.","\u{1F4AC}  Code review: where ego goes to die and software goes to live.","\u{1F319}  Night owls: the most dangerous species in software engineering.","\u{1F525}  Hot take: the real 10x developer is the one who writes 10x less code.","\u{1F914}  Abstraction is good. Premature abstraction is the root of all evil's cousin.",'\u{1F3AA}  "Make it work, make it right, make it fast" \u2014 in that order. Not the other way.',"\u{1F3D7}\uFE0F  Architecture astronauts: developers who over-engineer everything.","\u{1F31F}  The best feature is a deleted feature.","\u{1F52E}  Hindsight is always 20/20. Foresight is why we have version control.","\u{1F9EC}  Refactoring: changing the internals without changing the externals. Like surgery.","\u26A1  Fast feedback loops are the secret to good software. Cloudy closes the loop instantly.","\u{1F393}  The best developers are the best at admitting they don't know something.",'\u{1F308}  Diversity in tech: we need more people who ask "why not?" instead of "why?"',"\u{1F6F8}  The cloud is just someone else's computer. Cloudy is your AI on your computer.","\u{1F913}  There are 10 types of developers: full-stack, front-end, back-end, and devops. That's already 4.","\u{1F3B0}  Random seed: the most reproducible way to get non-reproducible results.","\u{1F300}  Recursion: see recursion.",'\u{1F50A}  "Weeks of coding can save hours of planning." \u2014 unknown, ironic',"\u{1F3AD}  The hardest part of programming is thinking. The rest is typing.","\u{1F98A}  Clever code is the enemy of maintainable code.","\u{1F4AB}  Comments lie. Code doesn't. Trust the code.","\u{1F33A}  Beautiful code is code that makes you smile when you read it.","\u{1F52C}  Profiling before optimisation is like doing an autopsy before the patient is dead.","\u{1F3C4}  Shipping is a feature. The most important feature.",'\u{1F3B8}  "Walking on water and developing software from a spec are easy if both are frozen." \u2014 Edward Berard',"\u{1F30A}  Waterfall is dead. Long live\u2026 whatever we're calling it this week.",'\u{1F9F2}  The best code review comment: "This is clever. Delete it."',"\u{1F3AF}  Ship early, ship often, ship when it's ready. Pick two.","\u{1F52D}  Open source: standing on the shoulders of giants who are also standing on shoulders.","\u{1F984}  Unicorn features: so complex they seem magical. Usually just nested callbacks.","\u{1F30D}  The internet runs on Linux. Linux runs on coffee. QED.",'\u{1F3AA}  Every codebase has a "here be dragons" comment somewhere.',"\u{1F6A6}  Green tests give false confidence. Red tests give true information.","\u{1F92F}  The more I learn, the more I realise how much I don't know. \u2014 every developer after year 5","\u{1F331}  Greenfield project: the one time developers are actually excited.","\u{1F480}  Brownfield project: the reason they weren't excited last time.","\u{1F3A8}  UX tip: if you need a tooltip to explain a button, redesign the button.","\u{1F9EF}  Error messages should help users fix the problem, not describe the programmer's confusion.","\u{1F511}  Authentication is hard. That's why we have Auth.js, Passport, and Stack Overflow.",`\u{1F319}  "The cloud is just someone else's computer" \u2014 that's not what we mean by Cloudy.`,"\u23F0  Deadlines: the most effective compiler optimisation ever invented.","\u{1F3AC}  Demo-driven development: it works perfectly until someone touches the keyboard.","\u{1F91D}  Pair programming: two heads are better than one, especially when one is Claude.","\u{1F504}  CI/CD: continuous integration, continuous delivery, continuous anxiety.","\u{1F31F}  Production is the best test environment. Highly recommended by no one.",`\u{1F3B0}  "It's probably a race condition." \u2014 said before every race condition was found.`,"\u{1F98B}  Butterfly effect: changing a variable name in a utility causes a prod outage 3 months later.","\u{1F9EA}  Unit tests: tiny assertions that your code does what you think it does.","\u{1F30A}  Integration tests: discovering that your code doesn't do what you think it does.","\u26A1  E2E tests: proving that the user can do what you think the user wants to do.","\u{1F3AD}  Manual testing: closing your eyes and hoping.","\u{1F3C6}  100% test coverage: an achievement that means nothing and costs everything.","\u{1F52E}  The best test is no test in an environment so stable it never breaks. (Impossible.)","\u{1F4A1}  Good variable names: months of maintenance time saved per year.","\u{1F921}  Variable names: x, y, temp, temp2, tempFinal, tempFinalActual, tempFinalActual2.",'\u{1F3AF}  "Always code as if the person who ends up maintaining your code will be a violent psychopath who knows where you live." \u2014 John Woods',"\u{1F30D}  Internationalisation: i18n. Because typing 18 letters between i and n was too hard.","\u{1F310}  Localisation: l10n. Making your app work everywhere except IE11.","\u{1F6E1}\uFE0F  CORS: the security feature that makes you feel like the bad guy.","\u{1F525}  Hot reload: the greatest developer experience improvement since syntax highlighting.","\u{1F3B8}  Stack traces: the treasure maps of debugging.","\u{1F308}  Rainbow table: a hacker's best friend, a developer's worst nightmare.","\u{1F9EC}  DNA of good software: readable, testable, maintainable, deletable.",'\u{1F9BE}  "The best tool is the one you actually use." \u2014 probably someone with an IDE preference.',"\u{1F3D7}\uFE0F  Microservices: solving the monolith problem by creating 47 smaller problems.","\u{1F680}  Serverless: someone else's server, your problem.","\u{1F300}  Kubernetes: solving the Docker problem by adding 1000 YAML files.","\u2601\uFE0F  Cloud native: we'll figure out what it means after we bill for it.","\u{1F52D}  Observability: knowing what your system is doing instead of guessing.","\u{1F4CA}  Metrics lie. Logs mislead. Traces tell the truth.","\u{1F916}  Machine learning: making computers bad at things they were good at, so they can be great.","\u{1F3AF}  A/B testing: scientific method, but for button colours.","\u{1F4AC}  Dark patterns: designing against the user. Cloudy is designed for the developer.","\u{1F3A8}  Good design is invisible. Bad design is a customer support ticket.",'\u{1F4DA}  "Any fool can write code that a computer can understand. Good programmers write code that humans can understand." \u2014 Martin Fowler','\u{1F30D}  "Programs must be written for people to read, and only incidentally for machines to execute." \u2014 Abelson & Sussman','\u{1F511}  "Talk is cheap. Show me the code." \u2014 Linus Torvalds',`\u{1F9E0}  "The most damaging phrase in the language is: we've always done it this way." \u2014 Grace Hopper`,'\u{1F680}  "Move fast and break things. Unless you are breaking stuff, you are not moving fast enough." \u2014 Mark Zuckerberg','\u{1F331}  "Make it work, make it right, make it fast." \u2014 Kent Beck','\u26A1  "First, solve the problem. Then, write the code." \u2014 John Johnson','\u{1F3AF}  "Simplicity is the soul of efficiency." \u2014 Austin Freeman','\u{1F3C6}  "Programming is the art of telling another human what one wants the computer to do." \u2014 Donald Knuth','\u{1F52E}  "The best way to predict the future is to invent it." \u2014 Alan Kay','\u{1F30A}  "Software is a great combination between artistry and engineering." \u2014 Bill Gates','\u{1F3B8}  "The function of good software is to make the complex appear simple." \u2014 Grady Booch','\u{1F9EC}  "Software is eating the world." \u2014 Marc Andreessen','\u{1F4A1}  "Innovation distinguishes between a leader and a follower." \u2014 Steve Jobs','\u{1F31F}  "If you think good architecture is expensive, try bad architecture." \u2014 Brian Foote','\u{1F3AD}  "In theory, theory and practice are the same. In practice, they are not." \u2014 Yogi Berra','\u{1F98A}  "Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away." \u2014 Antoine de Saint-Exup\xE9ry','\u{1F308}  "To iterate is human, to recurse divine." \u2014 L. Peter Deutsch',`\u{1F525}  "It always takes longer than you expect, even when you take into account Hofstadter's Law." \u2014 Hofstadter's Law`,'\u{1F3AA}  "There are two ways to write error-free programs. Only the third one works." \u2014 Alan J. Perlis','\u{1F9E9}  "Measuring programming progress by lines of code is like measuring aircraft building progress by weight." \u2014 Bill Gates','\u2699\uFE0F  "The most important property of a program is whether it accomplishes the intention of its user." \u2014 C.A.R. Hoare','\u{1F393}  "Everyone knows that debugging is twice as hard as writing a program in the first place." \u2014 Brian Kernighan','\u{1F319}  "Debugging is like being the detective in a crime movie where you are also the murderer." \u2014 Filipe Fortes',`\u{1F52D}  "The Internet is the world's largest library. It's just that all the books are on the floor." \u2014 John Allen Paulos`,'\u{1F916}  "Artificial intelligence is no match for natural stupidity." \u2014 Albert Einstein (probably not)','\u{1F4AC}  "Weeks of coding can save you hours of planning." \u2014 unknown wise person','\u{1F9BE}  "The best thing about a boolean is that even if you are wrong, you are only off by a bit." \u2014 unknown','\u{1F3B0}  "In software, the only constant is change." \u2014 paraphrased Heraclitus','\u{1F33A}  "A computer once beat me at chess, but it was no match for me at kick boxing." \u2014 Emo Philips',`\u{1F6F8}  "The cloud is not a place, it's a practice." \u2014 unknown cloud marketer`,'\u{1F52C}  "Clean code always looks like it was written by someone who cares." \u2014 Robert C. Martin','\u{1F3C4}  "The best error message is the one that never shows up." \u2014 Thomas Fuchs','\u23F0  "One of the best programming skills you can have is knowing when to walk away for a while." \u2014 Oscar Godson','\u{1F3AC}  "The purpose of software engineering is to control complexity, not to create it." \u2014 Pamela Zave',`\u{1F914}  "Code is like humor. When you have to explain it, it's bad." \u2014 Cory House`,'\u{1F30A}  "Programs are meant to be read by humans and only incidentally for computers to execute." \u2014 Donald Knuth',`\u{1F510}  "Security is always excessive until it's not enough." \u2014 Robbie Sinclair`,'\u{1F3AF}  "Software comes from heaven when you have good architecture." \u2014 unknown architect',`\u{1F30D}  "Real programmers don't read documentation. Real programmers ignore documentation." \u2014 unknown`,`\u{1F480}  "It's not a bug \u2013 it's an undocumented feature." \u2014 used on Stack Overflow, daily`,'\u{1F92F}  "Any sufficiently advanced technology is indistinguishable from magic." \u2014 Arthur C. Clarke','\u{1F3A8}  "Design is not just what it looks like and feels like. Design is how it works." \u2014 Steve Jobs','\u{1F9EA}  "Testing leads to failure, and failure leads to understanding." \u2014 Burt Rutan','\u{1F31F}  "Optimism is an occupational hazard of programming; feedback is the treatment." \u2014 Kent Beck',`\u{1F3D7}\uFE0F  "The goal of Computer Science is to build something that will last at least until we've finished building it." \u2014 unknown`,'\u{1F6A6}  "Software testing proves the existence of bugs, not their absence." \u2014 Edsger Dijkstra','\u{1F4AB}  "Walking on water and developing software from a spec are easy if both are frozen." \u2014 Edward Berard','\u{1F300}  "The most dangerous kind of waste is the waste we do not recognize." \u2014 Shigeo Shingo',`\u{1F3B8}  "You can't have great software without a great team, and most software teams behave like dysfunctional families." \u2014 Jim McCarthy`,`\u{1F98B}  "In programming, the hard part isn't solving problems, but deciding what problems to solve." \u2014 Paul Graham`,`\u{1F50A}  "A language that doesn't affect the way you think about programming is not worth knowing." \u2014 Alan Perlis`,'\u{1F3AD}  "The art of programming is the art of organising complexity." \u2014 Edsger Dijkstra','\u{1F331}  "Every great developer you know got there by solving problems they were unqualified to solve." \u2014 Patrick McKenzie',"\u{1F916}  The first computer bug was an actual moth found in a Harvard relay in 1947.","\u{1F4E1}  The internet backbone moves ~400 terabits per second. That's 50,000 HD movies per second.","\u{1F522}  There are more possible chess games than atoms in the observable universe.","\u{1F9E0}  Your brain runs at roughly 1 exaFLOP. Current fastest supercomputers: ~1 exaFLOP.","\u{1F4BE}  The Apollo 11 guidance computer had 4KB of RAM. Your phone has 8,000,000KB.","\u{1F310}  There are ~1.9 billion websites. About 200 million are actively maintained.","\u{1F4F1}  More people on Earth have a mobile phone than have a toothbrush.","\u{1F50C}  The world's first hard drive (1956) stored 5MB and was the size of two refrigerators.","\u{1F5A5}\uFE0F  The first commercial computer, UNIVAC I (1951), weighed 8 tonnes and cost $1M ($11M today).","\u{1F50A}  The original iPhone had no App Store, no copy-paste, and no 3G. It still changed everything.","\u{1F30D}  Google processes ~8.5 billion searches per day. That's ~100,000 searches per second.","\u{1F9EC}  The human genome contains ~3 billion base pairs. That's ~750MB of data.","\u{1F6F8}  There are ~4,000 active satellites orbiting Earth. SpaceX plans 42,000 more for Starlink.","\u2601\uFE0F  Amazon Web Services was launched in 2006. It now generates ~$100B/year in revenue.","\u{1F916}  GPT-4 was trained on an estimated 1 trillion tokens. That's about 750 billion words.",'\u{1F4A1}  The first email was sent in 1971 by Ray Tomlinson. The message: "QWERTYUIOP".',"\u{1F510}  The RSA encryption algorithm was published in 1977. It still protects most internet traffic.","\u{1F30A}  Every 2 days, we create as much information as was created from the dawn of civilisation until 2003.","\u{1F680}  Moore's Law: chip transistor count doubles roughly every 2 years. It's held since 1965.","\u{1F4CA}  Stack Overflow was founded in 2008. It now has 50M questions and answers.","\u{1F3AF}  Linux powers 96.4% of the world's top 1 million web servers.","\u{1F310}  The World Wide Web was invented by Tim Berners-Lee in 1989. He didn't patent it.","\u{1F52D}  The James Webb Space Telescope generates ~57GB of data per day, processed in real time.","\u{1F9EA}  CRISPR gene editing was discovered in 2012. It won a Nobel Prize 8 years later.","\u{1F3C6}  Python became the world's most popular programming language in 2022, overtaking JavaScript.","\u{1F3B8}  Git was created by Linus Torvalds in 2005 in 10 days. To version-control Linux itself.","\u{1F319}  The Moon is 384,400 km away. Light takes 1.28 seconds to travel there.","\u26A1  Electricity travels through copper wire at about 2/3 the speed of light.","\u{1F52E}  The first version of JavaScript was written in 10 days by Brendan Eich in 1995.","\u{1F3A8}  Photoshop 1.0 was 179KB. The current version is ~1.8GB. That's 10,000x the growth.","\u{1F9BE}  GPT models are trained using Reinforcement Learning from Human Feedback (RLHF).",'\u{1F33A}  The term "artificial intelligence" was coined by John McCarthy at a Dartmouth conference in 1956.',"\u{1F4AC}  Claude is trained by Anthropic, founded by former OpenAI researchers in 2021.","\u{1F511}  Public-key cryptography was invented in 1976 by Diffie and Hellman.","\u{1F308}  QR codes were invented in 1994 by Masahiro Hara for Toyota's vehicle parts tracking.","\u{1F3AA}  Bluetooth is named after Harald Bluetooth, a 10th-century Danish king.",`\u{1F9E9}  Wi-Fi doesn't stand for "Wireless Fidelity". It's just a brand name by the Wi-Fi Alliance.`,"\u{1F30A}  The first commercial SSD was released in 1991 for $1,000 and stored 20MB.","\u{1F92F}  TCP/IP \u2014 the foundation of the internet \u2014 was designed to survive nuclear war.","\u{1F52C}  The transistor was invented at Bell Labs in 1947. Three people shared the Nobel Prize for it.","\u{1F3C4}  USB was invented in 1996 to replace the 27 different connectors on a PC. It added 2 more.","\u{1F3AC}  JPEG compression was standardised in 1992. It's still the most used image format.","\u23F0  The Y2K bug cost an estimated $300\u2013600 billion to fix globally. And it worked.","\u{1F9F2}  NFC (Near Field Communication) operates at 13.56 MHz, the same frequency as library security gates.","\u{1F4F1}  The App Store launched in July 2008 with 500 apps. It now has 1.8 million.","\u{1F30D}  Wikipedia has 6.7 million articles in English alone. 99.9% written by volunteers.","\u{1F3B0}  Random number generators in computers aren't truly random. They're deterministic with good seeds.",`\u{1F98A}  Firefox's old name was "Phoenix", then "Firebird". Mozilla kept getting name conflicts.`,"\u{1F331}  Node.js was created by Ryan Dahl in 2009. The runtime is now downloaded 3 billion times/month.","\u{1F480}  Internet Explorer is officially dead (June 2022). Moment of silence.","\u{1F525}  WebAssembly runs at near-native speed in the browser. The web is now a runtime.","\u{1F3AD}  The dark web is ~4-5% of the total internet. The rest is just poorly indexed.","\u{1F6A6}  HTTP/3 uses UDP instead of TCP. Faster, but the jokes are less reliable.","\u{1F3AF}  GraphQL was created internally at Facebook in 2012, open-sourced in 2015.","\u{1F4AB}  Docker was released in 2013. It changed deployment forever in about 18 months.","\u{1F319}  Kubernetes (k8s) was released by Google in 2014, based on their internal Borg system.","\u{1F98B}  React was open-sourced by Facebook in 2013. It now powers a third of the web.",'\u2699\uFE0F  Rust has been voted "most loved programming language" on Stack Overflow every year since 2016.',"\u{1F393}  MIT's OpenCourseWare has made university education free since 2001. 350M+ learners served.","\u{1F310}  IPv4 has 4.3 billion addresses. We ran out in 2011. IPv6 has 340 undecillion addresses.",'\u{1F50A}  The first tweet was sent by Jack Dorsey on March 21, 2006: "just setting up my twttr".',"\u{1F3D7}\uFE0F  GitHub was founded in 2008. Microsoft acquired it in 2018 for $7.5 billion.","\u{1F510}  SHA-256 (used in Bitcoin) has 2^256 possible outputs. That's more than atoms in the universe.",'\u{1F3B8}  The first video uploaded to YouTube (April 23, 2005): "Me at the zoo" by co-founder Jawed Karim.',"\u{1F33A}  Amazon started as an online bookstore in a garage in Bellevue, Washington, in 1994.",'\u{1F9E0}  The term "debugging" was popularised after Grace Hopper found that actual moth in 1947.',"\u{1F916}  AlphaGo beat world Go champion Lee Sedol 4-1 in 2016. Sedol retired in 2019.","\u{1F30A}  DeepMind's AlphaFold solved protein folding \u2014 a 50-year science challenge \u2014 in 2020.","\u{1F52D}  The first photograph of a black hole was captured in 2019, 55 million light-years away.","\u{1F680}  Falcon 9's first stage booster has been reflown over 20 times. Rockets are now reusable.","\u26A1  Starship is the largest rocket ever built: 120m tall, 9M lbs thrust. More than the Moon rockets.","\u{1F4A1}  The Li-Fi technology uses light (not radio waves) to transmit data at 224 Gbps.","\u{1F3AF}  5G can theoretically reach 20 Gbps. Your average 5G phone gets about 300 Mbps.","\u{1F30D}  The Bitcoin network uses more electricity than Argentina. Ethereum reduced its usage 99.95%.",'\u{1F3A8}  Pantone selects a "Color of the Year" every year since 2000. It affects global design trends.',"\u{1F9EC}  CRISPR was adapted from a bacterial immune system. Nature invented gene editing first.",'\u{1F308}  The first computer animation appeared in a movie in 1973: "Westworld".','\u{1F52E}  The first video game ever created was "Nim" in 1951, running on the Nimrod computer.',"\u{1F3AA}  Pong was the first commercially successful video game (1972). Revenue: $40M.","\u{1F3C6}  The PlayStation 2 is the best-selling console ever: 155 million units (2000\u20132013).","\u{1F9E9}  Tetris was created in 1984 by Alexey Pajitnov, a Soviet software engineer.","\u{1F30A}  The longest-running software bug was in the Therac-25 radiation machine. It killed people.","\u{1F4AC}  The first spam email was sent in 1978 by Gary Thuerk. He got a great response rate.",'\u{1F511}  PGP (Pretty Good Privacy) encryption was released in 1991. "Pretty good" undersells it.','\u{1F319}  The first SMS was sent on December 3, 1992: "Merry Christmas".',"\u23F1\uFE0F  Unix time started at 00:00:00 UTC on January 1, 1970. The 2038 problem is coming.","\u{1F92F}  The 2038 bug: 32-bit systems will overflow their Unix timestamp on January 19, 2038.",'\u{1F3AC}  CGI first replaced all live action in a movie with "Final Fantasy: The Spirits Within" (2001).',"\u{1F30D}  Wikipedia is the 13th most visited website globally. It runs on a surprisingly modest server cluster.",'\u{1F9BE}  Transformer architecture (the "T" in GPT) was published by Google Brain in 2017: "Attention Is All You Need".','\u{1F525}  "Attention Is All You Need" is the most cited ML paper ever. Over 100,000 citations.',"\u{1F9EA}  Anthropic was founded in 2021. Claude first launched in 2023.","\u{1F4E1}  Starlink has over 5,500 satellites in orbit. You can see them pass overhead on a clear night.","\u{1F3C4}  WebGL brings 3D graphics to browsers using OpenGL ES. No plugins needed since 2011.","\u{1F4AB}  The Web Audio API lets browsers do real-time audio synthesis. Your DAW could run in Chrome.","\u2699\uFE0F  V8, the JavaScript engine in Chrome and Node.js, was written in C++. Open sourced in 2008.","\u{1F33A}  LLVM was started as a university research project. It now compiles Swift, Rust, Clang, and more.","\u{1F3B8}  GCC (GNU Compiler Collection) has compiled the world's code since 1987.","\u{1F6E1}\uFE0F  Let's Encrypt has issued over 3 billion certificates. Free HTTPS for everyone.","\u{1F310}  The `.com` TLD was created in 1985. The first registered domain: symbolics.com (still live!).","\u{1F52C}  Quantum computers use qubits. A 50-qubit quantum computer can simultaneously represent 2^50 states.","\u{1F300}  IBM's quantum computers are available via cloud API. You can program one right now.",`\u{1F3AD}  Google's quantum chip "Willow" solved in 5 minutes what would take a classical computer 10^25 years.`,"\u{1F9F2}  Superconducting qubits operate at -273.14\xB0C \u2014 colder than outer space.","\u{1F3B0}  The RSA algorithm: if you could factor a 2048-bit number, you'd break most internet security.","\u{1F50A}  Sound travels at 343 m/s. Data through fibre travels at ~200,000 km/s. Not comparable.","\u{1F331}  The first GPS satellite was launched in 1978. Full GPS constellation: 1995.","\u{1F3AF}  Your GPS accuracy: ~3 metres. Military GPS: ~30 cm. DGPS: ~10 cm.","\u{1F30A}  Undersea cables carry 99% of international internet traffic. Satellites carry the rest.","\u{1F6A6}  The first computer mouse was invented by Douglas Engelbart in 1964. It was made of wood.","\u{1F3D7}\uFE0F  The QWERTY keyboard layout was designed in 1873 to slow typists down and prevent typewriter jams.","\u{1F4A1}  The first touchscreen was developed at CERN in 1973. For nuclear physics, not iPhones.",`\u{1F52D}  The first computer virus ("Creeper") appeared in 1971 on ARPANET. It displayed "I'm the creeper, catch me if you can!"`,"\u{1F916}  The Turing Test was proposed by Alan Turing in 1950. Most people think AI passed it in 2023.","\u{1F30D}  Alan Turing, the father of computer science, cracked the Enigma code and saved millions of lives.","\u{1F393}  Ada Lovelace wrote the first algorithm in 1843. For a machine that didn't exist yet.",'\u{1F319}  Margaret Hamilton coined the term "software engineering" and led the Apollo 11 software team.',"\u26A1  The fastest computers operate at ~1 exaFLOP. Human brain: same. Coincidence?","\u{1F9EC}  DNA is a 4-letter code (A, T, G, C). Computer binary is a 2-letter code (0, 1). Nature was first.","\u{1F52E}  The halting problem: Alan Turing proved in 1936 you can never write a program that detects if any program will halt.","\u{1F3AA}  G\xF6del's incompleteness theorem: any consistent mathematical system has true statements it cannot prove.","\u{1F3AF}  P vs NP: the most famous unsolved problem in computer science. $1M prize if you solve it.","\u{1F30A}  Quantum supremacy means a quantum computer can do something a classical computer practically cannot.","\u{1F510}  Zero-knowledge proofs: prove you know something without revealing what you know. Used in ZK-rollups.","\u{1F98B}  Chaos theory: tiny changes in initial conditions cause wildly different outcomes. Like production deployments.",`\u{1F33A}  The butterfly effect was named after a 1972 paper: "Does the Flap of a Butterfly's Wings in Brazil set off a Tornado in Texas?"`,"\u{1F3AC}  The simulation hypothesis: we might be living in a computer simulation. Elon Musk thinks there's a 1-in-a-billion chance we're not.","\u{1F92F}  If the universe is a simulation, whoever wrote it used floating-point arithmetic. Planck length is the pixel size.","\u{1F9E9}  Conway's Game of Life is Turing complete. You can run a computer inside a cellular automaton.","\u2699\uFE0F  APL (1966) is the most concise programming language. One line can sort an array: \u234B\u2375.","\u{1F308}  Brainfuck is a Turing-complete language with only 8 commands. Hello World is 106 chars.","\u{1F3B8}  Whitespace is a programming language where only spaces, tabs, and newlines are significant.","\u{1F300}  LOLCODE is a real programming language. `HAI` starts a program. `KTHXBYE` ends it.",'\u{1F3AD}  Rockstar is a programming language where programs are valid rock lyrics. "Tommy was a rebel" declares a variable.',"\u{1F3C4}  Malbolge is intentionally the hardest language ever created. The first working program took 2 years.","\u{1F680}  Scratch (MIT) has 100M+ registered users. Most are under 16. The next generation is already coding.","\u{1F30D}  COBOL was written in 1959 and still processes $3 trillion in daily financial transactions.","\u{1F4AC}  FORTRAN (1957) is the oldest high-level language still in active use. Scientists love it.","\u{1F511}  SQL was invented at IBM in 1970. It's still the dominant query language 54 years later.","\u{1F9E0}  Lisp was invented in 1958. AI researchers have been saying it will have its moment for 66 years.",'\u{1F331}  Ruby on Rails launched in 2004 and defined "convention over configuration".',"\u{1F525}  npm (Node Package Manager) has 2.1 million packages. Most are used by 1 project.","\u{1F3AF}  is-even on npm: 300K weekly downloads. It checks if a number is even. One line of math.","\u{1F926}  left-pad incident (2016): removing an 11-line npm package broke thousands of builds worldwide.",'\u{1F4AB}  The npm package "chalk" is downloaded 600 million times per week. It colours terminal text.',`\u26A1  "The real npm stands for Not a Package Manager." \u2014 true, it's recursive: npm isn't package manager.`,"\u{1F30A}  Dependency hell: when your 5-line project has 500MB of node_modules.","\u{1F3A8}  node_modules is the heaviest object in the universe. Confirmed by JavaScript developers.",'\u{1F52D}  The first open-source project was DECUS in 1975. It predates the term "open source" by 23 years.',"\u{1F310}  Apache HTTP Server (1995) still powers ~23% of all websites. 29-year-old software, still thriving.","\u{1F9BE}  The Linux kernel has ~30 million lines of code and 4,300+ contributors. Open, forever.","\u{1F6F8}  Android is based on Linux. So is ChromeOS. And most web servers. Linus Torvalds: quietly dominating.","\u{1F52C}  Apple's M-series chips use TSMC's 3nm process. Transistors are 3nm wide. DNA is 2nm wide.","\u{1F3C6}  The M3 Ultra chip has 192GB unified memory and 192 billion transistors. In a desktop computer.","\u{1F319}  RISC-V: an open-source CPU architecture that anyone can use. The Linux of hardware.","\u23F0  Arm Holdings chips are in ~95% of smartphones. They design the architecture, others manufacture.","\u{1F3B0}  NVIDIA's H100 GPU: $30,000. Trains AI models. Demand still outstrips supply by 10x.","\u{1F3B8}  CUDA, NVIDIA's GPU programming platform, was released in 2007. It accidentally became the AI standard.","\u{1F33A}  AMD's comeback: Zen architecture (2017) made Intel competitive again. Competition is healthy.","\u{1F4A1}  RAM speeds have gone from 100MHz (1996) to 7200MHz (2024). 72x faster in 28 years.","\u{1F50A}  PCIe 5.0 NVMe SSDs read at 14,000 MB/s. In 1990, a HDD managed 5 MB/s.","\u{1F3AD}  USB-C: one connector to rule them all. Except it comes in 47 incompatible standards.","\u{1F9EC}  Thunderbolt 5 pushes 120 Gbps. That's 15 GB/s \u2014 a 4K movie in under a second.","\u{1F30A}  Wi-Fi 7 (802.11be) reaches 46 Gbps. Faster than most wired connections.","\u{1F6A6}  6G research is already underway. Target: 1 Tbps. Launch: ~2030.","\u{1F3AF}  The average age of a startup founder at exit is 47. Not 22.","\u{1F30D}  Y Combinator has funded 4,000+ companies including Airbnb, Dropbox, Stripe, Reddit.","\u{1F3D7}\uFE0F  Stripe processed $1 trillion in payments in 2023. Founded 2010. Two brothers from Ireland.","\u{1F916}  OpenAI was founded as a non-profit in 2015. It's now valued at $157 billion.","\u{1F52E}  Anthropic raised $7.3 billion from Google and Amazon. Claude is well-funded.","\u{1F308}  Notion was almost killed in 2018 when it had $4K in the bank. Now valued at $10 billion.","\u{1F3AA}  Figma was acquired by Adobe for $20B in 2022. The deal was blocked. Figma stayed independent.","\u{1F4AC}  Linear was built by 4 engineers. It became the default issue tracker for thousands of startups.","\u{1F98A}  Vercel deploys Next.js in ~45 seconds. Next.js was built by Vercel. Convenient.","\u{1F9E9}  Supabase is Firebase but open source. They might eat Firebase's lunch.","\u{1F331}  PlanetScale was built on Vitess, the same database tech that powers YouTube.","\u{1F510}  1Password, Bitwarden, and Dashlane all store your passwords\u2026 somewhere.","\u26A1  Cloudflare handles ~20% of global internet traffic. Invisible infrastructure, everywhere.","\u{1F310}  Fastly, Akamai, CloudFront: your content is probably cached 50ms from wherever you are.","\u{1F4E1}  Twilio started with one API: send an SMS. Now it's a $10B communications platform.","\u{1F3AC}  Segment was acquired by Twilio for $3.2B. Started as a Harvard class project.","\u{1F3C4}  Mixpanel, Amplitude, PostHog: analytics tools so you know if anyone actually uses your product.",`\u{1F300}  "If you're not embarrassed by the first version of your product, you've launched too late." \u2014 Reid Hoffman`,`\u{1F393}  "The best startups aren't necessarily the ones that look the best on paper." \u2014 Paul Graham`,`\u{1F31F}  "Make something people want." \u2014 Y Combinator's core thesis, in four words.`,`\u{1F50A}  "Do things that don't scale." \u2014 Paul Graham. Cloudy scales. Start unscaled.`,'\u{1F4A1}  "The way to get startup ideas is to look for problems, preferably problems you have yourself." \u2014 Paul Graham',`\u{1F3C6}  "Build for yourself first. If you're not your own target user, you're guessing." \u2014 common founder wisdom`,'\u{1F680}  "Default alive vs default dead: can you reach profitability before running out of money?" \u2014 Paul Graham',"\u{1F3AF}  Ramen profitable: making just enough to survive. The minimum viable revenue.",`\u{1F30A}  "If you can't explain it simply, you don't understand it well enough." \u2014 Albert Einstein`,'\u{1F9E0}  "The definition of insanity is doing the same thing over and over and expecting different results." \u2014 commonly misattributed to Einstein','\u{1F92F}  "The best minds of my generation are thinking about how to make people click ads." \u2014 Jeff Hammerbacher, Facebook engineer','\u{1F52D}  "The Internet is the most important single development in the history of human communication since the invention of call waiting." \u2014 Dave Barry','\u{1F30D}  "Computers are incredibly fast, accurate, and stupid. Human beings are incredibly slow, inaccurate, and brilliant." \u2014 Einstein again (probably not)','\u2699\uFE0F  "The question of whether a computer can think is no more interesting than the question of whether a submarine can swim." \u2014 Edsger Dijkstra','\u{1F3B8}  "It is practically impossible to teach good programming to students that have had a prior exposure to BASIC." \u2014 Edsger Dijkstra','\u{1F33A}  "Object-oriented programming is an exceptionally bad idea which could only have originated in California." \u2014 Edsger Dijkstra','\u{1F9BE}  "Beware of bugs in the above code; I have only proved it correct, not tried it." \u2014 Donald Knuth','\u{1F9EA}  "If debugging is the process of removing bugs, then programming must be the process of putting them in." \u2014 Edsger Dijkstra','\u{1F3AA}  "Inside every large program is a small program struggling to get out." \u2014 C.A.R. Hoare','\u{1F319}  "The competent programmer is fully aware of the limited size of his own skull." \u2014 Edsger Dijkstra','\u{1F480}  "Controlling complexity is the essence of computer programming." \u2014 Brian Kernighan','\u{1F300}  "There are only two hard things in Computer Science: cache invalidation and naming things." \u2014 Phil Karlton',`\u{1F511}  "You can't have a bug-free program if you haven't thought about what you want it to do." \u2014 Steve McConnell`,'\u{1F3AD}  "Good code is its own best documentation." \u2014 Steve McConnell','\u{1F4AB}  "An idiot admires complexity, a genius admires simplicity." \u2014 Terry Davis','\u{1F3D7}\uFE0F  "Simplicity is prerequisite for reliability." \u2014 Edsger Dijkstra',`\u{1F310}  "The software isn't finished until the last user is dead." \u2014 Sidney Markowitz`,'\u{1F525}  "All problems in computer science can be solved by another level of indirection." \u2014 David Wheeler','\u26A1  "...except for the problem of too many layers of indirection." \u2014 Kevlin Henney (addendum)','\u{1F393}  "A clever person solves a problem. A wise person avoids it." \u2014 Einstein (again, probably not)','\u{1F3AF}  "The most effective debugging tool is still careful thought, coupled with judiciously placed print statements." \u2014 Brian Kernighan','\u{1F30A}  "A program is never finished until the programmer dies." \u2014 unknown wise developer','\u{1F52E}  "Most software today is very much like an Egyptian pyramid with millions of bricks piled on top of each other, with no structural integrity, but just done by brute force." \u2014 Alan Kay','\u{1F30D}  "The most important thing in the programming language is the name. A language will not succeed without a good name." \u2014 Larry Wall (creator of Perl)','\u{1F3B8}  "Perl is another example of filling a tiny need expertly, and then being used for everything." \u2014 unknown','\u{1F331}  "PHP is a minor evil perpetrated and created by incompetent amateurs." \u2014 Rasmus Lerdorf, creator of PHP','\u{1F98A}  "Java is to JavaScript as car is to carpet." \u2014 Chris Heilmann','\u{1F9EC}  "TypeScript: JavaScript for people who know what a type is." \u2014 oversimplified but accurate',`\u{1F3A8}  "CSS is a programming language. It's just not Turing complete. Yet." \u2014 disputed`,'\u{1F308}  "HTML is not a programming language." \u2014 said confidently, started a thousand wars.','\u{1F916}  "Regex is a write-only language." \u2014 every developer who has to read regex they wrote 6 months ago','\u{1F3B0}  "There are two kinds of languages: the ones people complain about and the ones nobody uses." \u2014 Bjarne Stroustrup','\u{1F50A}  "C makes it easy to shoot yourself in the foot. C++ makes it harder, but when you do, it blows away your whole leg." \u2014 Bjarne Stroustrup','\u{1F300}  "Rust makes you feel like a responsible adult." \u2014 every Rust convert','\u{1F3C4}  "Go is the language that made concurrency boring. In the best way." \u2014 Go developers','\u{1F9E9}  "Haskell is a language in which everything is possible, nothing is practical, and the type system is sentient." \u2014 functional programmers','\u2699\uFE0F  "Erlang was designed for fault tolerance. WhatsApp uses it for 2 billion users. QED." \u2014 distributed systems fans','\u{1F4A1}  "Elixir is Erlang for people who want nice syntax and a happy community." \u2014 Elixir community','\u{1F3AC}  "Kotlin is Java if Java were written today." \u2014 JetBrains marketing, essentially','\u{1F30A}  "Swift is Objective-C if Objective-C had been written by someone who liked developers." \u2014 Apple ecosystem',`\u{1F680}  "Dart was Google's answer to JavaScript. Flutter was the question nobody knew to ask." \u2014 mobile devs`,'\u{1F3C6}  "The best programming language is the one that gets the job done." \u2014 pragmatists everywhere',"\u{1F319}  You've been staring at this ticker for a while. Your code isn't going to run itself. Wait \u2014 actually it is.","\u{1F3AF}  The best time to start automating was yesterday. The second best time is right now.","\u2601\uFE0F  Cloudy is waiting. Your specs are loaded. What are we building next?","\u{1F52E}  Tomorrow's developers will describe their intent. AI will handle the implementation. Welcome to tomorrow.","\u{1F31F}  The next big thing is a small team with a big idea and an AI that codes faster than they can think.","\u26A1  You're a founder. You don't need a team of 50. You need Cloudy and a great spec.","\u{1F680}  Solo founders used to max out at simple SaaS. Now the ceiling is infinite.","\u{1F9E0}  The bottleneck isn't talent anymore. It's clarity of thought. Write the spec. Cloudy does the rest.",`\u{1F30A}  "Move fast and don't break things" \u2014 what Cloudy's validation gate is for.`,"\u{1F3AA}  Every great product started as a markdown file describing the problem. Write yours.","\u{1F4AC}  The best spec is the one that's clear enough for an AI to execute and a human to review.","\u{1F52D}  Ten years ago, this required a team of ten. Today, it requires you and Cloudy.","\u{1F33A}  Build something you'd use every day. That's how you know it's worth building.","\u{1F3D7}\uFE0F  The only question that matters: does it solve a real problem for a real person?","\u{1F3B8}  Ship it. Iterate. Ship again. The loop is the product.","\u{1F30D}  Somewhere right now, a solo founder is shipping a product that will change an industry.","\u{1F92F}  The gap between idea and implementation is closing fast. Cloudy is part of why.","\u{1F510}  Good software is secure by default, not as an afterthought. Build it right the first time.","\u{1F308}  You're building with the most powerful developer tools ever created. Don't waste the opportunity.","\u{1F3AF}  Clarity beats cleverness. Every time. Write clear specs, get clear code.","\u23F0  Every hour Cloudy runs autonomously is an hour you spend on what actually matters.","\u{1F331}  Start with the simplest version that solves the problem. Complexity is earned, not assumed.","\u{1F4AB}  The best feature you can build is the one your users are begging for.","\u{1F50A}  Listen to your users more than your competitors. They know what they need.","\u{1F9EA}  Ship, measure, learn, repeat. The fastest feedback loop wins.","\u{1F300}  Every product is a hypothesis. Cloudy helps you test them faster.","\u{1F3AD}  Done is better than perfect. Perfect is better than never shipped.","\u{1F9BE}  Your unfair advantage: you can ship faster than any team of the same size.","\u{1F310}  The internet gives you access to every customer on Earth. Cloudy helps you serve them.","\u{1F52C}  Great products feel inevitable in hindsight. They're anything but in the building.","\u{1F3C4}  The best business is one that solves a painful problem for a defined group of people.",'\u26A1  "I would have written a shorter letter, but I did not have the time." \u2014 Pascal. Write short specs.',"\u{1F393}  You don't need permission to build. You just need a spec and a cloudy daemon.","\u{1F319}  3am ideas are either genius or terrible. Write them in a spec. Let Cloudy decide.","\u{1F3AF}  Cloudy doesn't get tired. Doesn't get distracted. Doesn't context-switch. It just builds.","\u2601\uFE0F  This is the way."];function Pt(){let t=[...za];for(let a=t.length-1;a>0;a--){let r=Math.floor(Math.random()*(a+1));[t[a],t[r]]=[t[r],t[a]]}return t}function Pa(){let t=o.default.useRef(Pt()),a=o.default.useRef(Math.floor(Math.random()*t.current.length)),[r,d]=o.default.useState(t.current[a.current]),[c,l]=o.default.useState(0);return o.default.useEffect(()=>{let i=setInterval(()=>{a.current+=1,a.current>=t.current.length&&(t.current=Pt(),a.current=0),d(t.current[a.current]),l(u=>u+1)},1e4);return()=>clearInterval(i)},[]),(0,e.jsx)("div",{style:{flex:1,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",padding:"0 24px"},children:(0,e.jsx)("div",{style:{overflow:"hidden",maxWidth:"100%"},children:(0,e.jsx)("span",{className:"ticker-text",children:r},c)})})}function Ma(t){let a=t.toLowerCase(),r=a.startsWith("pipeline-"),d=a.startsWith("scope-"),c=t.match(/(\d{4}-\d{2}-\d{2})-(\d{4})/),l="",i="";if(c){let[u,s,v]=c,y=v.slice(0,2),P=v.slice(2);l=`${s} ${y}:${P}`;let C=t.indexOf(u)+u.length;i=t.slice(C).replace(/^[-_]/,"").replace(/-/g," ").trim(),i||(i=t.replace(/^(pipeline-|scope-|run-)/i,"").replace(u,"").replace(/^[-_]/,"").replace(/-/g," ").trim()||(d?"planning run":"build run"))}else i=t.replace(/^(pipeline-|scope-|run-)/i,"").replace(/-/g," ").trim()||t;return{name:t,date:l,spec:i,isPipeline:r}}function Ia({project:t}){let[a,r]=(0,o.useState)([]),[d,c]=(0,o.useState)(new Set),[l,i]=(0,o.useState)({}),[u,s]=(0,o.useState)(!0);(0,o.useEffect)(()=>{s(!0),fetch(`/api/projects/${t.id}/runs`).then(I=>I.json()).then(I=>r(I)).catch(()=>r([])).finally(()=>s(!1))},[t.id]);async function v(I){if(c(W=>{let A=new Set(W);return A.has(I)?(A.delete(I),A):(A.add(I),A)}),!l[I]){let W=await fetch(`/api/projects/${t.id}/run-log/${encodeURIComponent(I)}`).catch(()=>null);if(W?.ok){let A=await W.text();i(Q=>({...Q,[I]:A}))}else i(A=>({...A,[I]:"(log not available)"}))}}let y=new Date().toISOString().slice(0,10),P=new Date(Date.now()-864e5).toISOString().slice(0,10),C=a.map(Ma),L={};for(let I of C){let W=I.date.slice(0,10)||y;L[W]||(L[W]=[]),L[W].push(I)}function O(I){return I===y?"Today":I===P?"Yesterday":I}return(0,e.jsxs)("div",{className:"history-tab",children:[(0,e.jsxs)("div",{className:"history-header",children:[(0,e.jsx)(Ne,{size:16,color:"#e8703a"}),(0,e.jsxs)("span",{children:[a.length," runs"]})]}),u&&(0,e.jsx)("div",{style:{display:"flex",flexDirection:"column",gap:6,padding:16},children:[1,2,3].map(I=>(0,e.jsx)("div",{className:"skeleton skeleton-block",style:{height:60,opacity:1-(I-1)*.2}},I))}),!u&&a.length===0&&(0,e.jsxs)("div",{className:"daemon-empty",children:[(0,e.jsx)("div",{className:"daemon-empty-icon",children:(0,e.jsx)(Ne,{size:40,color:"#e8703a"})}),(0,e.jsx)("div",{className:"daemon-empty-title",children:"No runs yet"}),(0,e.jsx)("div",{className:"daemon-empty-sub",children:"Run a plan from the Run tab to see history here"})]}),Object.entries(L).map(([I,W])=>(0,e.jsxs)("div",{className:"history-group",children:[(0,e.jsx)("div",{className:"history-group-label",children:O(I)}),W.map(A=>{let Q=d.has(A.name);return(0,e.jsxs)("div",{className:"history-run-card",children:[(0,e.jsxs)("div",{className:"history-run-header",onClick:()=>v(A.name),children:[(0,e.jsx)("div",{className:"history-run-icon",children:A.isPipeline?(0,e.jsx)(Fe,{size:16,color:"#a78bfa"}):A.name.toLowerCase().startsWith("scope-")?(0,e.jsx)("span",{style:{fontSize:14},children:"\u{1F4D0}"}):(0,e.jsx)(Ne,{size:16,color:"#e8703a"})}),(0,e.jsxs)("div",{className:"history-run-info",children:[(0,e.jsx)("div",{className:"history-run-name",children:A.spec||A.name}),(0,e.jsxs)("div",{className:"history-run-meta",children:[A.isPipeline&&(0,e.jsx)("span",{className:"history-run-badge pipeline",children:"chain"}),A.name.toLowerCase().startsWith("scope-")&&(0,e.jsx)("span",{className:"history-run-badge",style:{background:"rgba(251,191,36,0.15)",color:"#fbbf24",border:"1px solid rgba(251,191,36,0.25)"},children:"plan"}),A.date.slice(11)&&(0,e.jsx)("span",{children:A.date.slice(11)})]})]}),(0,e.jsx)("span",{className:"history-run-toggle",children:Q?"\u25BE":"\u25B8"})]}),Q&&(0,e.jsx)("div",{className:"history-run-log",children:l[A.name]??(0,e.jsx)("span",{className:"spinner",style:{width:12,height:12}})})]},A.name)})]},I))]})}function Fa(){ua();let{theme:t,setTheme:a}=wt(),[r,d]=(0,o.useState)([]),[c,l]=(0,o.useState)(!1),i=["dashboard","chat","plan","run","history","memory"];function u(){let q=window.location.hash.slice(1).split("/").filter(Boolean),U=q[0]?decodeURIComponent(q[0]):null,F=i.includes(q[1])?q[1]:"dashboard",D=q.slice(2).length>0?decodeURIComponent(q.slice(2).join("/")):null;return{id:U,tab:F,sessionId:D}}let s=u(),[v,y]=(0,o.useState)(s.id),[P,C]=(0,o.useState)(s.tab),[L,O]=(0,o.useState)(s.sessionId);(0,o.useEffect)(()=>{function S(){let{id:q,tab:U,sessionId:F}=u();y(q),C(U),O(F)}return window.addEventListener("hashchange",S),()=>window.removeEventListener("hashchange",S)},[]);function I(S,q,U){let F=S?`#/${S}/${q}`:"#/";U&&q==="chat"&&(F+=`/${encodeURIComponent(U)}`),window.location.hash!==F&&(window.location.hash=F)}function W(S){let q=S!==v?"dashboard":P;y(S),C(q),O(null),I(S,q,null)}function A(S){C(S),S!=="chat"&&O(null),I(v,S,S==="chat"?L:null)}function Q(S){O(S),I(v,"chat",S)}let[j,G]=(0,o.useState)(!1),[Z,ae]=(0,o.useState)(null),B=r.find(S=>S.id===v)??null;(0,o.useEffect)(()=>{fetch("/api/projects").then(S=>S.ok?S.json():null).then(S=>{S?.length&&(d(S),l(!0))}).catch(()=>{})},[]),(0,o.useEffect)(()=>{let S=null,q=null;function U(){S=new EventSource("/api/live"),S.onopen=()=>G(!0),S.onmessage=D=>{let H;try{H=JSON.parse(D.data)}catch{return}if(H.type==="project_status")d(H.projects??[]),l(!0);else if(H.type==="plan_saved")ae(H.plan);else if(H.type==="project_registered"||H.type==="project_removed")fetch("/api/projects").then(ne=>ne.json()).then(ne=>d(ne)).catch(()=>{});else if(H.type==="plan_completed"||H.type==="plan_failed"||H.type==="run_completed_daemon"||H.type==="run_failed_daemon"){let ne=H.projectId;fetch("/api/projects").then(X=>X.json()).then(X=>d(X)).catch(()=>{})}},S.onerror=()=>{G(!1),S?.close(),q=setTimeout(U,3e3)}}fetch("/api/projects").then(D=>D.json()).then(D=>{d(D)}).catch(()=>{}),U();let F=setInterval(()=>{fetch("/api/projects").then(D=>D.json()).then(D=>d(D)).catch(()=>{})},3e4);return()=>{S?.close(),q&&clearTimeout(q),clearInterval(F)}},[]),(0,o.useEffect)(()=>{!v&&r.length>0&&y(r[0].id)},[r,v]);let K=[{id:"dashboard",label:"Dashboard",icon:(0,e.jsx)(da,{size:14,color:"currentColor"})},{id:"chat",label:"Chat",icon:(0,e.jsx)(et,{size:14,color:"currentColor"})},{id:"plan",label:"Plan",icon:(0,e.jsx)(Fe,{size:14,color:"currentColor"})},{id:"run",label:"Run",icon:(0,e.jsx)(Ne,{size:14,color:"currentColor"})},{id:"history",label:"History",icon:(0,e.jsx)(Ct,{size:14,color:"currentColor"})},{id:"memory",label:"Memory",icon:(0,e.jsx)("span",{style:{fontSize:12},children:"\u{1F4CB}"})}];return(0,e.jsxs)("div",{className:"daemon-root",children:[(0,e.jsxs)("div",{className:"daemon-header",children:[(0,e.jsx)("div",{className:"daemon-header-title",children:"\u2601\uFE0F Cloudy Dashboard \u26A1"}),(0,e.jsx)(Pa,{}),(0,e.jsx)("button",{onClick:()=>a(t==="dark"?"light":t==="light"?"system":"dark"),title:`Theme: ${t} (click to cycle dark \u2192 light \u2192 system)`,style:{marginLeft:"auto",background:"none",border:"1px solid var(--border)",color:"var(--text-secondary)",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:13,fontFamily:"inherit"},children:t==="dark"?"\u{1F311}":t==="light"?"\u2600\uFE0F":"\u{1F4BB}"})]}),(0,e.jsxs)("div",{className:"daemon-body",children:[c?(0,e.jsx)(ga,{projects:r,selectedId:v,onSelect:W}):(0,e.jsx)("div",{className:"daemon-sidebar",style:{padding:"10px 12px",gap:10,display:"flex",flexDirection:"column"},children:[1,2,3].map(S=>(0,e.jsxs)("div",{style:{opacity:1-(S-1)*.25},children:[(0,e.jsx)("div",{className:"skeleton skeleton-text wide",style:{marginBottom:5}}),(0,e.jsx)("div",{className:"skeleton skeleton-text narrow"})]},S))}),(0,e.jsx)("div",{className:"daemon-main",children:B?(0,e.jsxs)(e.Fragment,{children:[(0,e.jsxs)("div",{className:"daemon-tabs",children:[K.map(S=>(0,e.jsxs)("div",{className:`daemon-tab${P===S.id?" active":""}`,onClick:()=>A(S.id),children:[(0,e.jsx)("span",{className:"tab-icon",children:S.icon}),S.label]},S.id)),(0,e.jsx)("div",{style:{flex:1}}),(0,e.jsxs)("div",{className:"tab-info-pill",tabIndex:0,children:[(0,e.jsx)("span",{style:{width:6,height:6,borderRadius:"50%",background:Mt(B.status),display:"inline-block",flexShrink:0}}),(0,e.jsx)("span",{className:"tab-info-pill-name",children:B.name}),(0,e.jsxs)("div",{className:"tab-info-popover",children:[(0,e.jsxs)("div",{className:"tab-info-row",children:[(0,e.jsx)("span",{children:"Project"}),(0,e.jsx)("span",{children:B.name})]}),B.lastRunAt&&(0,e.jsxs)("div",{className:"tab-info-row",children:[(0,e.jsx)("span",{children:"Last run"}),(0,e.jsx)("span",{children:ce(B.lastRunAt)})]}),(0,e.jsxs)("div",{className:"tab-info-row",children:[(0,e.jsx)("span",{children:"Host"}),(0,e.jsx)("span",{children:window.location.host})]}),(0,e.jsxs)("div",{className:"tab-info-row",children:[(0,e.jsx)("span",{children:"Path"}),(0,e.jsx)("span",{style:{fontFamily:"monospace",fontSize:10},children:B.path})]})]})]})]}),(0,e.jsxs)("div",{className:`daemon-content${["chat","plan","run","history","memory"].includes(P)?" chat-content":""}`,children:[P==="dashboard"&&(0,e.jsx)(Sa,{project:B,onSwitchTab:A},B.id),P==="plan"&&(0,e.jsx)(ba,{project:B,onPlanSavedEvent:Z},B.id),P==="run"&&(0,e.jsx)(xa,{project:B},B.id),P==="chat"&&(0,e.jsx)(Ta,{project:B,onSwitchTab:A,initialSessionId:L,onSessionSelect:Q},B.id),P==="history"&&(0,e.jsx)(Ia,{project:B},B.id),P==="memory"&&(0,e.jsx)(Na,{project:B},B.id)]})]}):(0,e.jsxs)("div",{className:"daemon-empty",children:[(0,e.jsx)("div",{className:"daemon-empty-icon",children:(0,e.jsx)(Ct,{size:48,color:"#e8703a"})}),(0,e.jsx)("div",{className:"daemon-empty-title",children:"Select a project"}),(0,e.jsx)("div",{className:"daemon-empty-sub",children:"\u2190 Choose from the sidebar to get started"})]})})]})]})}export{Fa as DaemonApp};
/*! Bundled license information:

react/cjs/react.production.min.js:
  (**
   * @license React
   * react.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react-jsx-runtime.production.min.js:
  (**
   * @license React
   * react-jsx-runtime.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
