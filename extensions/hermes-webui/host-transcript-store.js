/* Vulpy Hermes transcript projection seam.
 * Inserted into ui.js by patch-ui.js.py so this is the only code outside the
 * native host that reads the private S / INFLIGHT state.
 */
(function installHermesTranscriptStore(){
  if(window.HermesTranscriptStore) { return; }

  const listeners=new Set();
  let timer=0;
  let signature='';
  let version=0;
  let snapshot=Object.freeze({version:0,sessionId:null,messages:Object.freeze([])});

  const text=(value)=>{
    if(value===null||value===undefined) { return ''; }
    if(typeof value==='string') { return value; }
    try{return JSON.stringify(value);}catch(_){return String(value);}
  };
  const callId=(call,fallback)=>String(call&&(call.tid||call.id||call.tool_call_id||call.tool_use_id||call.call_id)||fallback);
  const callName=(call)=>String(call&&(call.name||(call.function?.name))||'tool');
  const callArgs=(call)=>{
    const raw=call&&(call.args===undefined?(call.input===undefined?(call.arguments===undefined?(call.function?.arguments):call.arguments):call.input):call.args);
    if(typeof raw==='string'){
      try{return JSON.parse(raw);}catch(_){return raw;}
    }
    return raw===undefined?{}:raw;
  };
  const toolStatus=(call)=>{
    const raw=String(call&&(call.status||call.state)||'').toLowerCase();
    if(call&&(call.approval||call.requires_approval||raw.includes('approval')||raw==='pending_approval')) { return 'approval'; }
    if(call&&(call.cancelled||raw.includes('cancel'))) { return 'cancelled'; }
    if(call&&(call.error||call.isError||call.is_error||raw==='error'||raw==='failed')) { return 'error'; }
    if(call&&(call.malformed||raw==='malformed')) { return 'malformed'; }
    if(call&&(call.done||call.complete||call.completed||call.result!==undefined||call.output!==undefined||raw==='complete'||raw==='completed'||raw==='success')) { return 'complete'; }
    return 'running';
  };
  const toolResult=(call)=>call&&(call.result===undefined?(call.output===undefined?(call.error===undefined?(call.content===undefined?undefined:call.content):call.error):call.output):call.result);
  const freezePart=(part)=>Object.freeze(part);

  function messageText(message){
    const content=message?.content;
    if(typeof content==='string') { return content; }
    if(!Array.isArray(content)) { return text(content); }
    return content
      .filter((part)=>part&&(part.type==='text'||part.type==='output_text'||part.type==='input_text'))
      .map((part)=>text(part.text===undefined?part.content:part.text))
      .join('');
  }
  function reasoningText(message){
    const direct=message&&(message.reasoning_content||message.reasoning||message.thinking||message._reasoning);
    if(text(direct).trim()) { return text(direct); }
    if(!Array.isArray(message?.content)) { return ''; }
    return message.content
      .filter((part)=>part&&(part.type==='thinking'||part.type==='reasoning'))
      .map((part)=>text(part.text===undefined?part.content:part.text))
      .join('\n');
  }
  function messageCalls(message){
    const calls=[];
    if(Array.isArray(message?.tool_calls)) { calls.push(...message.tool_calls); }
    if(Array.isArray(message?._partial_tool_calls)) { calls.push(...message._partial_tool_calls); }
    if(Array.isArray(message?.content)) { calls.push(...message.content.filter((part)=>part&&part.type==='tool_use')); }
    return calls;
  }
  function projectTool(call,fallback,burstId){
    const status=toolStatus(call);
    return freezePart({
      type:'tool',
      id:callId(call,fallback),
      name:callName(call),
      arguments:callArgs(call),
      result:toolResult(call),
      status,
      activityBurstId:Number(call?.activityBurstId) || burstId,
      approvalId:status==='approval'?String(call&&(call.approval_id||call.approvalId||callId(call,fallback))):undefined,
    });
  }
  function project(){
    const sessionId=S.session?.session_id?String(S.session.session_id):null;
    const inflight=sessionId&&INFLIGHT[sessionId]&&typeof INFLIGHT[sessionId]==='object'?INFLIGHT[sessionId]:null;
    const sourceMessages=Array.isArray(inflight?.messages)&&inflight.messages.length
      ? inflight.messages
      : (Array.isArray(S.messages)?S.messages:[]);
    const liveTools=Array.isArray(inflight?.toolCalls)?inflight.toolCalls:(Array.isArray(S.toolCalls)?S.toolCalls:[]);
    const resultByCall=new Map();
    for(const raw of sourceMessages){
      if(raw&&raw.role==='tool'){
        const id=String(raw.tool_call_id||raw.tool_use_id||raw.call_id||raw.id||'');
        if(id) { resultByCall.set(id,raw.content===undefined?(raw.result===undefined?raw.output:raw.result):raw.content); }
      }
    }
    const projected=[];
    let lastAssistant=-1;
    for(let index=0;index<sourceMessages.length;index++){
      const raw=sourceMessages[index];
      if(!raw||raw.role==='tool') { continue; }
      const role=raw.role==='assistant'?'assistant':(raw.role==='system'?'system':'user');
      const id=String(raw.id||raw.message_id||raw.uuid||`${sessionId||'session'}-${index}`);
      const parts=[];
      const burstId=Number(raw._activityBurstId||raw.activityBurstId||raw.activity_burst_id)||index+1;
      if(role==='assistant'){
        const reasoning=reasoningText(raw);
        if(reasoning) { parts.push(freezePart({type:'reasoning',id:`${id}-reasoning`,text:reasoning,activityBurstId:burstId})); }
        const calls=messageCalls(raw);
        calls.forEach((call,callIndex)=>{
          const projectedCall=projectTool(call,`${id}-tool-${callIndex}`,burstId);
          const settled=resultByCall.get(projectedCall.id);
          parts.push(settled===undefined?projectedCall:freezePart({...projectedCall,result:settled,status:'complete'}));
        });
      }
      const content=messageText(raw);
      if(content) { parts.push(freezePart({type:'text',id:`${id}-text`,text:content})); }
      if(parts.length||role==='assistant'){
        projected.push(Object.freeze({id,role,parts:Object.freeze(parts),isLive:!!raw._live}));
        if(role==='assistant') { lastAssistant=projected.length-1; }
      }
    }
    const seen=new Set();
    for(const message of projected) { for(const part of message.parts) { if(part.type==='tool') { seen.add(part.id); } } }
    for(let index=0;index<liveTools.length;index++){
      const call=liveTools[index];
      const id=callId(call,`live-tool-${index}`);
      if(seen.has(id)){
        for(let messageIndex=0;messageIndex<projected.length;messageIndex++){
          const message=projected[messageIndex];
          const partIndex=message.parts.findIndex((part)=>part.type==='tool'&&part.id===id);
          if(partIndex<0) { continue; }
          const parts=[...message.parts];
          const previous=parts[partIndex];
          parts[partIndex]=projectTool(call,id,previous.activityBurstId);
          projected[messageIndex]=Object.freeze({...message,isLive:true,parts:Object.freeze(parts)});
          break;
        }
        continue;
      }
      if(lastAssistant<0){
        projected.push(Object.freeze({id:`${sessionId||'session'}-live-assistant`,role:'assistant',parts:Object.freeze([]),isLive:true}));
        lastAssistant=projected.length-1;
      }
      const message=projected[lastAssistant];
      projected[lastAssistant]=Object.freeze({...message,isLive:true,parts:Object.freeze([...message.parts,projectTool(call,id,Number(call?.activityBurstId)||sourceMessages.length+1)])});
    }
    if(inflight&&lastAssistant>=0){
      const message=projected[lastAssistant];
      projected[lastAssistant]=Object.freeze({...message,isLive:true});
    }
    const state={sessionId,messages:projected};
    const nextSignature=JSON.stringify(state);
    if(nextSignature===signature) { return null; }
    signature=nextSignature;
    return Object.freeze({version:++version,sessionId,messages:Object.freeze(projected)});
  }
  function refresh(){
    const next=project();
    if(next){snapshot=next;for(const listener of Array.from(listeners)) { listener(); }}
  }
  function schedule(){
    if(timer||listeners.size===0) { return; }
    timer=window.setTimeout(()=>{timer=0;refresh();schedule();},32);
  }
  function subscribe(listener){
    listeners.add(listener);
    refresh();
    schedule();
    return ()=>{
      listeners.delete(listener);
      if(listeners.size===0&&timer){window.clearTimeout(timer);timer=0;}
    };
  }
  refresh();
  Object.defineProperty(window,'HermesTranscriptStore',{configurable:true,value:Object.freeze({
    getSnapshot:()=>snapshot,
    subscribe,
    refresh,
  })});
})();
