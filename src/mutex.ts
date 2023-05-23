import * as core from '@actions/core'
import {callKubernetes, callKubernetesPath} from './callExecutables'
import {logGroup} from './utils/groupDecorator'
import {withTimeout} from './utils/withTimeout'

/** Is mutex busy (configmap has field busy) */
function isBusy(name: string): boolean {
  core.debug(`isBusy(${name})`)
  const res = callKubernetes(`get configmaps ${name} -ojson`)
  core.debug('isBusy result: ' + res)

  const configmap = JSON.parse(res)
  core.debug('configmap parsed: ' + JSON.stringify(configmap))

  if (configmap?.data?.busy !== undefined) {
    core.info(`Mutex locked by ${configmap?.data?.lockedBy}`)
  }
  return configmap?.data?.busy !== undefined
}

function setBusy(lockedBy: string) {
  core.debug(`setBusy(${lockedBy})`)

  callKubernetesPath(
    kubectl =>
      `${kubectl} create configmap slo-mutex --from-literal=busy=true --from-literal=lockedBy=${lockedBy} -o=yaml --dry-run=client | ${kubectl} apply -f -`
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
  timeout: number,
  checkPeriod: number = 20
) {
  return logGroup('Obtain mutex', async () => {
    return withTimeout(timeout, checkPeriod, 'Obtain mutex', () => {
      const busy = isBusy('slo-mutex')
      if (!busy) {
        setBusy(workloadId)
        core.info('Mutex obtained')
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
