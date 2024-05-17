import * as core from '@actions/core'

export class TimeoutExceededError extends Error {}

export async function withTimeout(
  timeoutM: number,
  checkPeriodS: number,
  actionName: string,
  checkFunc: (() => boolean) | (() => Promise<boolean>)
): Promise<void> {
  core.debug(
    `Call withTimeout: timeout=${timeoutM}mins refreshPeriod=${checkPeriodS}s now: ${new Date().toISOString()}`
  )
  const deadline = new Date().valueOf() + timeoutM * 1000 * 60
  core.debug(
    `Deadline is set to: ${deadline} ( ${new Date(deadline).toISOString()} )`
  )
  do {
    core.debug(
      `withTimeout check: ${deadline} ( ${new Date(deadline).toISOString()} )`
    )
    if (await checkFunc()) return
    await new Promise(resolve => setTimeout(resolve, checkPeriodS * 1000))
  } while (new Date().valueOf() < deadline)

  core.debug(`withTimeout throw timeout`)
  throw new TimeoutExceededError(
    `${actionName} not done within timeout of ${timeoutM}min`
  )
}

export async function withTimeoutSimple<T>(
  timeoutS: number,
  func: Promise<T>
): Promise<T> {
  const timer: Promise<never> = new Promise((_, reject) =>
    setTimeout(reject, timeoutS * 1000)
  )
  return Promise.race([func, timer])
}
