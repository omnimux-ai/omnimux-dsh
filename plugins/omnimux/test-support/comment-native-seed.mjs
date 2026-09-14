import { deflateSync } from 'node:zlib';

// Self-contained PNG fixture: avoids dependencies on ignored QA evidence files.
export function commentFixturePng() {
  const crc32 = buffer => {
    let crc = 0xffffffff;
    for (const byte of buffer) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (name, data) => {
    const type = Buffer.from(name);
    const header = Buffer.alloc(4); header.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
    return Buffer.concat([header, type, data, checksum]);
  };
  const width = 640, height = 360;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * (width * 3 + 1) + 1 + x * 3;
    pixels[i] = 30 + Math.floor(x / 4); pixels[i + 1] = 70 + Math.floor(y / 3); pixels[i + 2] = 150;
  }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

export function commentSeedSource(cwd, evidence) {
  return `
import fs from 'node:fs/promises';
import { createAssistantMessage } from '@deepseek-ai/dsh-llm';
const cwd=${JSON.stringify(cwd)};
const evidence=${JSON.stringify(evidence + '/')};
const sessionId='session-qa-agent-comments-1756';
export const inject=['attachments','sessions','modelCatalog','agents','agentDefaultModel','agentPresets'];
export async function apply(ctx){
  // modelCatalog is published after the production comment injector is mounted.
  ctx.on('agent/pre-step',async({agent},next)=>{
    if(agent.session.id!==sessionId)return next();
    const decision=await next();
    for(const message of decision.messages||[])for(const part of message.content||[]){
      if(part.type!=='file'||!part.attachment.name?.startsWith('omnimux-canvas-comments-'))continue;
      const chunks=[];for await(const chunk of ctx.attachments.readFileStream(part.attachment))chunks.push(chunk);
      await fs.writeFile(evidence+'uploaded-comment.json',Buffer.concat(chunks));
    }
    await fs.writeFile(evidence+'comment-pre-step-decision.json',JSON.stringify(decision,null,2));
    return {kind:'reject'};
  },{prepend:true});
  await fs.writeFile(evidence+'seed-observer-ready.json',JSON.stringify({sessionId,afterProductionModelCatalog:true,prepend:true}));
  const png=await fs.readFile(evidence+'fixture.png');
  const [image]=await ctx.attachments.saveImages([{data:png,mediaType:'image/png',name:'qa-native-comments.png'}]);
  const {provider,model}=ctx.agentDefaultModel.currentSelection();
  const preset=(await ctx.agentPresets.resolve()).id;
  const {agent}=await ctx.agents.create({sessionId,agentOptions:{provider,model},meta:{cwd,agentPreset:preset},setup:async(agentCtx)=>{await ctx.agentPresets.mount(agentCtx,preset);}});
  const session=agent.session;
  session.append('turn/start',{turn:1});
  session.append('step/start',{turn:1,step:1});
  session.append('assistant/message',{turn:1,step:1,message:createAssistantMessage({source:{provider:'qa-fixture',model:'static-history'},content:[{type:'text',text:'测试历史：本图片为本地验收素材，非模型生成。'},{type:'image',attachment:image}]}),stream:[]},{surfaceOp:'append'});
  session.append('step/end',{turn:1,step:1});
  session.append('turn/end',{turn:1,reason:{kind:'completed'}});
  await ctx.sessions.flush(session);
}
`;
}
