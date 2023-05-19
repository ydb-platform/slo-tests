import * as core from '@actions/core'
import {IWorkloadOptions, parseArguments} from './parseArguments'
import {prepareK8S} from './callExecutables'
import {obtainMutex, releaseMutex} from './mutex'
import {createCluster, deleteCluster, getYdbVersions} from './cluster'
import {
  buildWorkload,
  dockerLogin,
  generateDockerPath,
  runWorkload
} from './workload'
import {getInfrastractureEndpoints} from './getInfrastractureEndpoints'

async function main(): Promise<void> {
  try {
    let workloads: IWorkloadOptions[] = parseArguments()
    const base64kubeconfig = ''
    const dockerRepo = '',
      dockerFolder = '',
      dockerUser = '',
      dockerPass = ''
    let version = ''

    if (version === '') version = '23.1.26'
    if (version === 'newest') {
      core.info('Get YDB docker versions')
      const ydbVersions = getYdbVersions()
      version = ydbVersions[ydbVersions.length - 1]
      core.info(`Use YDB docker version = '${version}'`)
    }

    prepareK8S(base64kubeconfig)

    await dockerLogin(dockerRepo, dockerUser, dockerPass)

    // check if all parts working: prometheus, prometheus-pushgateway, grafana, grafana-renderer
    const servicesPods = await getInfrastractureEndpoints()
    core.info(`Services pods: ${JSON.stringify(servicesPods)}`)

    core.info(
      'Run SLO tests for: \n' +
        workloads
          .map(option => {
            let str = `#${option.id}`
            str += option.name ? `(${option.name})\n` : '\n'
            str += `path: '${option.path}'\n`
            str += option.buildContext
              ? `build context: '${option.buildContext}'\n`
              : ''
            str += option.buildOptions
              ? `build options: '${option.buildOptions}'\n`
              : ''
            return str
          })
          .join('===')
    )
    const mutexId =
      workloads.length > 1
        ? workloads.map(v => v.id).join('__+__')
        : workloads[0].id

    await obtainMutex(mutexId, 30)

    const dockerPaths = workloads.map(w =>
      generateDockerPath(dockerRepo, dockerFolder, w.id)
    )

    core.info('Create cluster and build all workloads')
    const builded = workloads.map(() => false)
    const clusterWorkloadRes = await Promise.allSettled([
      createCluster(version, 15),

      ...workloads.map((wl, idx) =>
        buildWorkload(
          wl.id,
          dockerPaths[idx],
          wl.path,
          wl.buildOptions,
          wl.buildContext
        ).then(() => {
          builded[idx] = true
        })
      )
    ])

    /** Indicates that cluster created, some of workloads builded and it's possible to run wl */
    const continueRun =
      clusterWorkloadRes[0].status === 'fulfilled' &&
      builded.filter(v => v).length > 0
    core.debug(`builded: [${builded.toString()}], continueRun: ${continueRun}`)

    if (builded.every(v => v)) {
      core.info('All workloads builded successfully')
    } else {
      if (continueRun) {
        builded.map((done, i) => {
          if (!done) core.info(`Error in '${workloads[i].id}' build`)
          else core.info(`'${workloads[i].id}' build successful`)
        })
      } else {
        core.info('No workloads builded!')
      }
    }

    if (continueRun) {
      await Promise.allSettled(
        workloads.map(async (wl, idx) => {
          await runWorkload('create', {
            id: wl.id,
            dockerPath: dockerPaths[idx],
            timeoutMins: 2,
            args:
              `--min-partitions-count 6 --max-partitions-count 1000` +
              ` --partition-size 1 --initial-data-count 1000`
          })

          await Promise.allSettled([
            // retry on error? run in parrallel? run one by one?
            runWorkload('run', {
              id: wl.id,
              dockerPath: dockerPaths[idx],
              timeoutMins: 6,
              args:
                `--time 180 --shutdown-time 20 --read-rps 1000` +
                ` --write-rps 100 --prom-pgw http://prometheus-pushgateway:9091`
            })
            // run in parralel with workload
            // core.info('Run error scheduler')
          ])

          core.info('Check results')
          //

          core.info('Grafana screenshot')
          //
        })
      )
    }

    deleteCluster()

    releaseMutex()
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

const isPostAction = !!core.getState('isPost')

if (isPostAction) {
  core.info('Cleanup should be placed here')
  // TODO: cleanup
} else {
  main()
}
