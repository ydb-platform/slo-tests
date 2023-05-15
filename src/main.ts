import * as core from '@actions/core'
import {IWorkloadOptions, parseArguments} from './parseArguments'
import {prepareK8S} from './callExecutables'
import {obtainMutex, releaseMutex} from './mutex'

async function main(): Promise<void> {
  try {
    let workloads: IWorkloadOptions[] = parseArguments()

    core.info(
      workloads
        .map(option => {
          let str = `Run SLO tests for #${option.id}`
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
        .join('')
    )
    const mutexId =
      workloads.length > 1
        ? workloads.map(v => v.id).join('__+__')
        : workloads[0].id

    prepareK8S('')

    await obtainMutex(mutexId, 30)

    // can be parallel with next step (build workload)
    core.info('Create cluster')
    //

    core.info('Build workload')
    //

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

    core.info('Delete cluster')
    //

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
