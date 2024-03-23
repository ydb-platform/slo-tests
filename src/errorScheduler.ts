import * as core from '@actions/core'
import {callKubernetes, callKubernetesAsync} from './callExecutables'

let grafanaPod: string | null = null

export async function errorScheduler(
  grafanaPodName: string,
  timeBetweenS: number
) {
  // get database target's IP
  const targetIP = (
    await callKubernetesAsync(
      `get pods database-sample-0 -o=jsonpath='{.status.podIP}'`
    )
  ).split('\n')[0]
  core.info(`Target of the error scheduler (database-sample-0) IP: ${targetIP}`)

  // get grafana pod name
  grafanaPod = grafanaPodName
  core.info(`Grafana pod name: ${grafanaPod}`)

  // wait until workload start?
  // what is workload to wait to start for?
  //   withTimeout(2, 2, 'Wait workload start before error scheduler', async () => {
  //     const status = JSON.parse(
  //         await callKubernetesAsync(
  //           `get job/${workloadId}-wl-run -o=jsonpath={.status}`
  //         )
  //       )
  //       if(status?.phase === 'Running') return true
  //       return false
  //   })

  await new Promise(resolve => {
    setTimeout(resolve, timeBetweenS * 1000)
  })

  const freezeCmd = (freeze: '1' | '0') =>
    `run -it --image=busybox --rm tablet-${
      freeze === '0' ? 'un' : ''
    }freezer --restart=Never --` +
    ` sh -c "wget -q -O- '${targetIP}:8765/tablets/app?` +
    `TabletID=72057594037968897&node=1&page=SetFreeze&freeze=${freeze}' "`

  // freeze
  await createError('Freeze tablet', freezeCmd('1'), timeBetweenS)

  // unfreeze
  await createError('Unfreeze tablet', freezeCmd('0'), timeBetweenS)

  // delete pod
  await createError(
    'Delete database pod',
    `delete pod database-sample-1`,
    timeBetweenS
  )

  // force delete pod
  await createError(
    'Force delete database pod',
    `delete pod database-sample-1 --force=true --grace-period=0`,
    timeBetweenS
  )

  // kill from inside
  await createError(
    'Kill database from inside',
    `exec -it database-sample-0 -- /bin/bash -c "kill -2 1 && echo 'process killed'"`,
    timeBetweenS
  )
  // TODO: add process sleep
}

async function createError(
  name: string,
  kubeCommand: string,
  timeBetweenS: number
): Promise<void> {
  return await Promise.allSettled([
    // run command
    callKubernetesAsync(kubeCommand),
    // annotate
    annotate(name),
    // wait till next
    new Promise(resolve => {
      setTimeout(resolve, timeBetweenS * 1000)
    })
  ]).then(v => {
    if (v.filter(p => p.status === 'rejected').length > 0)
      return Promise.reject('Error in YDB error creation')
  })
}

// no tags, but possible to add if needed
export function annotate(text: string, dashboardUID = '7CzMl5t4k') {
  const annotationsUrl = 'http://localhost:3000/api/annotations'

  const createWgetPost = (url: string, data: string) =>
    `wget -qS -O- --header 'Accept: application/json' --header 'Content-Type: application/json' --post-data '${data}' '${url}'`

  const data = `{\\"dashboardUID\\":\\"${dashboardUID}\\", \\"text\\":\\"${text}\\", \\"tags\\":[]}`
  return callKubernetes(
    `exec -it ${grafanaPod} --container grafana -- /bin/bash -c "${createWgetPost(
      annotationsUrl,
      data
    )}"`
  )
}
