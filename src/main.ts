import * as core from '@actions/core'
import {IWorkloadOptions, parseArguments} from './parseArguments'
import {prepareK8S} from './callExecutables'
import {obtainMutex, releaseMutex} from './mutex'
import {createCluster, deleteCluster, getYdbVersions} from './cluster'
import {
  IWorkloadRunOptions,
  buildWorkload,
  dockerLogin,
  generateDockerPath,
  runWorkload
} from './workload'

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

    dockerLogin(dockerRepo, dockerUser, dockerPass)

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

    prepareK8S(base64kubeconfig)

    await obtainMutex(mutexId, 30)

    const dockerPaths = workloads.map(w =>
      generateDockerPath(dockerRepo, dockerFolder, w.id)
    )

    core.info('Create cluster and build all workloads')
    const builded = workloads.map(() => false)
    await Promise.allSettled([
      createCluster(version, 15),

      ...workloads.map((wl, idx) => {
        return (async () => {
          buildWorkload(
            wl.id,
            dockerPaths[idx],
            wl.buildOptions,
            wl.buildContext
          )
          builded[idx] = true
        })()
      })
    ])

    /** Indicates that some of workloads builded and it's possible to run wl */
    const continueRun = builded.filter(v => v).length > 0
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
      core.info('Create tables')
      //

      // retry on error? run in parrallel? run one by one?
      core.info('Run workload')
      //

      // run in parralel with workload
      core.info('Run error scheduler')
      //

      core.info('Check results')
      //

      core.info('Grafana screenshot')
      //
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
