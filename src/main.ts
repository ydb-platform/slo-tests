import * as core from '@actions/core'
import * as github from '@actions/github'
import {GitHub} from '@actions/github/lib/utils'
import {parseArguments} from './parseArguments'
import {call, prepareAWS, prepareK8S} from './callExecutables'
import {obtainMutex, releaseMutex} from './mutex'
import {createCluster, deleteCluster} from './cluster'
import {
  buildWorkload,
  dockerLogin,
  generateDockerPath,
  runWorkload
} from './workload'
import {getInfrastractureEndpoints} from './getInfrastractureEndpoints'
import {errorScheduler} from './errorScheduler'
import {retry} from './utils/retry'

const isPullRequest = !!github.context.payload.pull_request

async function main(): Promise<void> {
  try {
    let {
      workloads,
      githubToken,
      kubeconfig,
      awsCredentials,
      awsConfig,
      s3Endpoint,
      s3Folder,
      dockerRepo,
      dockerFolder,
      dockerUsername,
      dockerPassword,
      ydbVersion,
      timeBetweenPhases,
      shutdownTime,
      grafanaDomain,
      grafanaDashboard
    } = parseArguments()

    core.debug(`Setting up OctoKit`)
    const octokit = github.getOctokit(githubToken)

    prepareK8S(kubeconfig)
    prepareAWS(awsCredentials, awsConfig)

    await dockerLogin(dockerRepo, dockerUsername, dockerPassword)

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
    core.info('Mutex obtained!')

    const dockerPaths = workloads.map(w =>
      generateDockerPath(dockerRepo, dockerFolder, w.id)
    )

    core.info('Create cluster and build all workloads')
    const builded = workloads.map(() => false)
    const clusterWorkloadRes = await Promise.allSettled([
      createCluster(ydbVersion, 15),
      // TODO: create placeholder pods for databases
      // TODO: catch build error and stop cluster creation
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
      // retry create operation one time in case of error
      const createResult = await Promise.allSettled(
        workloads.map(async (wl, idx) =>
          retry(2, () =>
            runWorkload('create', {
              id: wl.id,
              dockerPath: dockerPaths[idx],
              timeoutMins: 2,
              args:
                `--min-partitions-count 6 --max-partitions-count 1000 ` +
                `--partition-size 1 --initial-data-count 1000`
            })
          )
        )
      )
      core.debug('create results: ' + JSON.stringify(createResult))
      if (createResult.filter(r => r.status === 'fulfilled').length === 0) {
        throw new Error('No workloads performed `create` action, exit')
      } else {
        // run in parrallel without retries
        const runResult = await Promise.allSettled([
          ...workloads.map((wl, idx) =>
            runWorkload('run', {
              id: wl.id,
              dockerPath: dockerPaths[idx],
              timeoutMins: Math.ceil(
                ((5 + 4) * timeBetweenPhases + shutdownTime) / 60
              ),
              args:
                `--time ${
                  (5 + 2) * timeBetweenPhases
                } --shutdown-time ${shutdownTime} --read-rps 1000 ` +
                `--write-rps 100 --prom-pgw http://prometheus-pushgateway:9091`
            })
          ),
          errorScheduler(servicesPods.grafana, timeBetweenPhases)
        ])

        core.debug('run results: ' + JSON.stringify(runResult))
        if (runResult.filter(r => r.status === 'fulfilled').length === 0) {
        } else {
          await Promise.allSettled([
            // core.info('Check results')
            // //
            // core.info('Grafana screenshot')
            // //
          ])
        }
      }
    }

    deleteCluster()

    releaseMutex()
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

const isPostAction = !!core.getState('isPost')

if (isPostAction) {
  core.info('Cleanup')
  core.debug('Remove .kube dir')
  call('rm -rf ~/.kube')
  core.debug('Remove .aws dir')
  call('rm -rf ~/.aws')
} else {
  main()
}
