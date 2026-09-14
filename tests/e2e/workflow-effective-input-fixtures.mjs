// Synthetic QA contracts only: not declarations of supported product models.
import { operation, slot } from '../../plugins/omnimux-workflow/src/workflow/seam/submissionFixtures.mjs';
export const catalog = { source: 'static-stub', schemaVersion: '1.1', defaults: {}, models: [], text: [], image: [], video: [], audio: [] };
const operations = {
  text: [operation('text_to_text','text'), operation('image_to_text','text',[slot('image','reference',0,4,'images')])],
  image: [operation('text_to_image','image'), operation('image_to_image','image',[slot('image','reference',1,1,'images')])],
  video: [operation('text_to_video','video'), operation('first_frame','video',[slot('image','first_frame',1,1,'first_frame')],false), operation('first_last_frame','video',[slot('image','first_frame',1,1,'first_frame'),slot('image','last_frame',1,1,'last_frame')],false), operation('video_multi_ref','video',[slot('image','reference',1,3,'reference_images')],false)],
  audio: [operation('text_to_speech','audio'), operation('text_to_music','audio',[slot('audio','reference',0,1,'reference_audio')])],
};
for (const type of Object.keys(operations)) {
  const model = { id: `qa-${type}`, label: `离线${type}夹具`, listed: true, operations: operations[type], parameterSchema: {} };
  catalog[type] = [model]; catalog.models.push(model); catalog.defaults[type] = model.id;
}
const singleFrame = {id:'qa-single-frame',label:'单首帧参数夹具',listed:true,parameterSchema:{},operations:[{...operation('first_frame','video',[slot('image','first_frame',1,1,'first_frame')],false),parameters:{duration:{options:[{value:5}],defaultValue:5}}}]};
catalog.video.push(singleFrame);catalog.models.push(singleFrame);
export function fixture(name='text', origin='http://127.0.0.1') {
  const type = ['text','image','video','audio'].includes(name) ? name : name === 'music' ? 'audio' : name === 'mixed' ? 'image' : name === 'frames' ? 'video' : 'text';
  const source = (id, materialType, data={}) => ({id,type:'material',position:{x:0,y:0},data:{materialType,nodeKind:'import',kind:'import',label:id,status:'completed',...data}});
  const text = source('正文甲','text',{content:'OLD',generatedContent:'1dog'});
  const image = source('图片甲','image',{mediaUrl:`${origin}/media/a.svg`,mimeType:'image/svg+xml'});
  const image2 = source('图片乙','image',{mediaUrl:`${origin}/media/b.svg`,mimeType:'image/svg+xml'});
  const target = {id:'target',type:'material',position:{x:400,y:100},data:{materialType:type,nodeKind:'generate',kind:'generate',label:'生成目标',prompt:'',params:{model:`qa-${type}`,operation:operations[type][0].id,...(type==='audio'?{voice:'alloy',speed:1}:{})}}};
  let sources = [text];
  if(name==='music') { sources=[text,source('音频甲','audio',{mediaUrl:`${origin}/media/silence.wav`,mimeType:'audio/wav',durationSec:1})]; target.data.params={model:'qa-audio',operation:'text_to_music'}; }
  if(name==='empty') sources=[];
  if(name==='ordered') sources=[source('正文乙','text',{content:'乙段'}),source('正文甲','text',{content:'甲段'})];
  if(name==='mixed') { sources=[text,image,image2]; target.data.params.operation='image_to_image'; }
  if(name==='frames') { sources=[image,image2,text]; target.data.params.operation='first_last_frame'; }
  if(name==='single-frame-params') {sources=[image,image2,text];target.data.materialType='video';target.data.params={model:'qa-single-frame',operation:'first_frame',duration:10};target.data.slotBindings={first_frame:[{sourceNodeId:'图片甲',edgeId:'edge-0',outputId:`${origin}/media/a.svg`,pinned:true}]};}
  return {nodes:[...sources,target],edges:sources.map((n,i)=>({id:`edge-${i}`,source:n.id,target:'target',targetHandle:i%2?'input':'in',data:{feedType:n.data.materialType}})),targetId:'target',name};
}
