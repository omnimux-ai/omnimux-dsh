export function requireConfig(env) {
 const spaceId=Number(env.EGO_TASK_ID)
 if(!Number.isSafeInteger(spaceId)||spaceId<=0)throw Error('EGO_TASK_ID required')
 if(!env.EVIDENCE_DIR?.startsWith('/'))throw Error('absolute EVIDENCE_DIR required')
 return {spaceId,output:env.EVIDENCE_DIR}
}
export async function runVerified({required,execute,capture,cleanup}) {
 const describe=e=>e?.message??String(e)
 let failed=false
 const result={passed:false,completed:[],missing:[...required],error:null,secondaryErrors:[]}
 try {
  await execute(id=>{if(!required.includes(id))throw Error('unknown case '+id);if(!result.completed.includes(id))result.completed.push(id)})
  result.missing=required.filter(id=>!result.completed.includes(id))
  if(result.missing.length)throw Error('missing required cases: '+result.missing.join(', '))
 } catch(error) {
  failed=true
  result.error=describe(error)
  try{await capture(error)}catch(e){result.secondaryErrors.push('capture: '+describe(e))}
 } finally {
  try{await cleanup()}catch(e){result.secondaryErrors.push('cleanup: '+describe(e))}
 }
 result.missing=required.filter(id=>!result.completed.includes(id))
 result.passed=!failed&&!result.missing.length&&!result.secondaryErrors.length
 return result
}
