import * as core from '@actions/core'

export async function retry<T>(
  retries: number,
  inner: () => Promise<T>
): Promise<T> {
  let error: unknown
  while (retries > 0) {
    try {
      return await inner()
    } catch (e) {
      error = e
    }
    retries--
  }
  core.info('All retries have been used, re-throwing error')
  throw error
}
