import * as core from '@actions/core'
import {call, callKubernetes, callKubernetesPath} from './callExecutables'
import {logGroup} from './utils/groupDecorator'
import {withTimeout} from './utils/withTimeout'

/** Is mutex busy (configmap has field busy) */
export function isBusy(name: string): false | string {
  core.debug(`isBusy(${name})`)
  const res = callKubernetes(`get configmaps ${name} -ojson`)
  core.debug('isBusy result: ' + res)

  const configmap = JSON.parse(res)
  core.debug('configmap parsed: ' + JSON.stringify(configmap))

  if (configmap?.data?.busy !== undefined
    && typeof configmap?.data?.lockedTill === 'string'
    && parseInt(configmap.data.lockedTill) >= Date.now()) {
    core.info(`Mutex locked by ${configmap?.data?.lockedBy} till ${new Date(parseInt(configmap?.data?.lockedTill))}`)
    return configmap?.data?.lockedBy
  }
  return false
}

export function setBusy(lockedBy: string, lockLimitMins: number) {
  core.debug(`setBusy(${lockedBy})`)

  callKubernetesPath(
    kubectl =>
      `${kubectl} create configmap slo-mutex --from-literal=busy=true --from-literal=lockedBy=${lockedBy} --from-literal=lockedTill=${Date.now() + lockLimitMins * 60_000} -o=yaml --dry-run=client | ${kubectl} apply -f -`
  )
}

/**
 * Obtain mutex
 * @param workloadId id to mention in mutex
 * @param timeout  timeout in minutes
 * @param checkPeriod update period in seconds
 */
export function obtainMutex(
  workloadId: string,
  lockLimitMins: number,
  timeout: number,
  checkPeriod: number = 20
) {
  return logGroup('Obtain mutex', async () => {
    return withTimeout(timeout, checkPeriod, 'Obtain mutex', () => {
      const busy = isBusy('slo-mutex')
      if (typeof busy === 'boolean' && !busy) {
        core.debug('Set mutex')
        setBusy(workloadId, lockLimitMins)
        core.info('Mutex obtained')
        core.debug('Mutex sleep 5s')
        call('sleep 5')
        core.debug('Re-check after sleep')
        const mutexObtainedBy = isBusy('slo-mutex')
        if (mutexObtainedBy !== workloadId) {
          core.info('Mutex is not obtained!')
          return false
        }
        return true
      }
      return false
    })
  })
}

export function releaseMutex() {
  return logGroup('Release mutex', () => {
    callKubernetesPath(
      kubectl =>
        `${kubectl} create configmap slo-mutex -o=yaml --dry-run=client | ${kubectl} apply -f -`
    )
  })
}
