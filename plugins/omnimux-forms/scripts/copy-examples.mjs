import { cp } from 'node:fs/promises'

/** Keep installed examples independent of the authoring package's source path. */
export async function copyExamples(sourceDirectory, destinationDirectory) {
  await cp(sourceDirectory, destinationDirectory, { recursive: true })
}
