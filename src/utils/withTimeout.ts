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
    if (await checkFunc()) return
    await new Promise(resolve => setTimeout(resolve, checkPeriodS * 1000))
  } while (new Date().valueOf() < deadline)

  throw new TimeoutExceededError(
    `${actionName} not done within timeout of ${timeoutM}min`
  )
}
