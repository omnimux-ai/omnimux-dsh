import { lstatSync, realpathSync, mkdirSync } from 'node:fs'
import { resolve, relative, join, dirname, sep } from 'node:path'
import { avatarDirOf } from './paths.js'
import { AvatarError } from './store.js'
const denied=()=>new AvatarError('path-denied','素材不在该角色的受管目录中',400)

/** Preserve harmless platform aliases while rejecting a changed managed ancestor. */
export function resolveAvatarDestination(paths,avatarId,file) {
  const directory=resolve(avatarDirOf(paths,avatarId))
  const data=realpathSync(paths.dataDir)
  const canonicalRoot=join(data,avatarId)
  const logical=resolve(file)
  const base=logical.startsWith(directory+sep)?directory:canonicalRoot
  if(!logical.startsWith(base+sep))throw denied()
  const relativeFile=relative(base,logical)
  const expected=join(canonicalRoot,relativeFile)
  let ancestor=dirname(logical)
  for(;;){
    try {
      const actual=realpathSync(ancestor)
      const relativeAncestor=relative(base,ancestor)
      if(actual!==join(canonicalRoot,relativeAncestor)||!lstatSync(actual).isDirectory())throw denied()
      break
    } catch(error) {
      if(error.code!=='ENOENT'||ancestor===base) {
        if(error.code==='ENOENT'&&ancestor===base){if(realpathSync(dirname(base))!==data)throw denied();break}
        throw error
      }
      ancestor=dirname(ancestor)
    }
  }
  mkdirSync(dirname(logical),{recursive:true})
  if(realpathSync(dirname(logical))!==dirname(expected))throw denied()
  try {const info=lstatSync(logical);if(info.isSymbolicLink()||!info.isFile())throw denied()}
  catch(error){if(error.code!=='ENOENT')throw error}
  return logical
}

/** Existing artifact identity, not a ledger string, authorizes a read. */
export function resolveAvatarArtifact(paths,avatarId,file) {
  const directory=resolve(avatarDirOf(paths,avatarId))
  const data=realpathSync(paths.dataDir)
  const root=realpathSync(directory)
  const logical=resolve(file)
  const base=logical.startsWith(directory+sep)?directory:root
  const actual=realpathSync(file)
  if(root!==join(data,avatarId)||!logical.startsWith(base+sep)||actual!==join(root,relative(base,logical))||lstatSync(logical).isSymbolicLink()||!lstatSync(actual).isFile())throw denied()
  return logical
}
