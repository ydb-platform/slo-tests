import * as core from '@actions/core'
import * as github from '@actions/github'
import {parseArguments} from './parseArguments'
import {prepareAWS, call} from './callExecutables'
import {createCluster, deleteCluster, deploy_minikube, deploy_ydb_operator, deploy_monitoring} from './cluster'
import {
  buildWorkload,
  dockerLogin,
  generateDockerPath,
  runWorkload,
} from './workload'
import {getInfrastractureEndpoints} from './getInfrastractureEndpoints'
import {errorScheduler} from './errorScheduler'
import {retry} from './utils/retry'
import {IDesiredResults, checkResults} from './checkResults'
import {grafanaScreenshot, postComment} from './grafanaScreenshot'
import {createHash} from 'crypto'

const isPullRequest = !!github.context.payload.pull_request

let clusterCreated = false

async function main(): Promise<void> {
  try {
    
    await deploy_minikube()

    await deploy_monitoring(10)

    await deploy_ydb_operator(10)

    let {
      workloads,
      githubToken,
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
      grafanaDashboard,
      grafanaDashboardWidth,
      grafanaDashboardHeight
    } = parseArguments()

    core.debug(`Setting up OctoKit`)
    const octokit = github.getOctokit(githubToken)

    // prepareAWS(awsCredentials, awsConfig)


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

    const dockerPaths = workloads.map(w =>
      generateDockerPath(w.id)
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

    core.info(call('docker images'))
    /** Indicates that cluster created, some of workloads builded and it's possible to run wl */
    const continueRun =
      clusterWorkloadRes[0].status === 'fulfilled' &&
      builded.filter(v => v).length > 0
    core.debug(`builded: [${builded.toString()}], continueRun: ${continueRun}`)

    if (clusterWorkloadRes[0].status === 'fulfilled') {
      clusterCreated = true
    }

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
        if (
          runResult
            .slice(0, workloads.length)
            .filter(r => r.status === 'fulfilled').length === 0
        ) {
          core.info('No successfull workload runs!')
          throw new Error('No workloads runs completed successfully')
        } else {
          // TODO: somehow use objectives as input
          const objectives: IDesiredResults = {
            success_rate: [{filter: {}, value: ['>', 0.98]}],
            max_99_latency: [
              {filter: {status: 'ok'}, value: ['<', 100]},
              {filter: {status: 'err'}, value: ['<', 30000]}
            ],
            fail_interval: [{filter: {}, value: ['<', 20]}]
          }
          let promises: Promise<boolean | void>[] = []

          runResult.map((r, i) => {
            if (r.status === 'fulfilled' && i !== runResult.length - 1) {
              const timings = (
                r as PromiseFulfilledResult<{
                  startTime: Date
                  endTime: Date
                }>
              ).value
              promises.push(
                checkResults(
                  octokit,
                  workloads[i].id,
                  timings.startTime,
                  timings.endTime,
                  objectives
                )
              )

              core.debug('isPullRequest=' + isPullRequest)
              if (isPullRequest) {
                core.debug(
                  'Push to promises grafana screenshot and postComment'
                )
                promises.push(
                  (async () => {
                    const pictureUri = await grafanaScreenshot(
                      s3Endpoint,
                      s3Folder,
                      workloads[i].id,
                      timings.startTime,
                      timings.endTime,
                      grafanaDashboard,
                      grafanaDashboardWidth,
                      grafanaDashboardHeight
                    )
                    const comment = `
:volcano: Here are results of SLO test for **${
                      workloads[i].name ?? workloads[i].id
                    }**:

[Grafana Dashboard](${grafanaDomain}/d/${grafanaDashboard}?orgId=1&from=${timings.startTime.valueOf()}&to=${timings.endTime.valueOf()})

![SLO-${workloads[i].id}](${pictureUri})\n`

                    await postComment(
                      octokit,
                      createHash('sha1')
                        .update(workloads[i].id)
                        .digest()
                        .readUint16BE(),
                      comment
                    )
                  })()
                )
              }
            }
          })

          const res = await Promise.allSettled(promises)

          core.info(
            'checkResults and grafana screenshot result: ' + JSON.stringify(res)
          )
        }
      }
    }

    deleteCluster()
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
    if (clusterCreated) {
      try {
        deleteCluster()
      } catch (error) {
        core.info('Failed to delete cluster:' + JSON.stringify(error))
      }
    }
  }
}

core.info('Main SLO action')
main()
