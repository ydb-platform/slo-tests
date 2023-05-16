import * as core from '@actions/core'
import {logGroup} from './utils/groupDecorator'

export interface IWorkloadOptions {
  /** SDK language or language+variant for kuberetes, prometheus metrics, PR comments */
  id: string
  /** SDK name for PR comments */
  name?: string
  /** Workload folder to build docker image from */
  path: string
  /** Path to docker build context - cwd is workload_path */
  buildContext?: string
  /** String with additional options, such as --build-arg and others from https://docs.docker.com/engine/reference/commandline/build/#options */
  buildOptions?: string
}

export function parseArguments() {
  return logGroup('Prepare k8s', () => {
    let workloads: IWorkloadOptions[] = []
    let i = -1,
      haveValue = true
    do {
      const readedValue = getWorkloadParam(i)
      if (null === readedValue) {
        // can start from '' or from 0
        if (i !== -1) haveValue = false
      } else {
        workloads.push(readedValue)
      }
      i++
    } while (haveValue)

    // TODO: add other args
    return workloads
  })
}

function getWorkloadParam(id: number): IWorkloadOptions | null {
  let suffix = id == -1 ? '' : `${id}`
  const languageId: string = core.getInput('language_id' + suffix)
  const languageName: string = core.getInput('language' + suffix)
  const workloadPath: string = core.getInput('workload_path' + suffix)
  const workloadBuildContext: string = core.getInput(
    'workload_build_context' + suffix
  )
  const workloadBuildOptions: string = core.getInput(
    'workload_build_options' + suffix
  )

  core.debug(`getWorkloadParam(${id}):
  suffix='${suffix}'
  languageId='${languageId}'
  languageName='${languageName}'
  workloadPath='${workloadPath}'
  workloadBuildContext='${workloadBuildContext}'
  workloadBuildOptions='${workloadBuildOptions}'`)

  // id and path are required
  if (languageId.length === 0 || workloadPath.length === 0) {
    core.debug(
      `Not found params for ${id} workload - ${'language_id' + suffix} and ${
        'workload_path' + suffix
      } are not presented`
    )
    return null
  }
  let options: IWorkloadOptions = {
    id: languageId,
    path: workloadPath
  }
  if (languageName) options.name = languageName
  if (workloadBuildContext) options.buildContext = workloadBuildContext
  if (workloadBuildOptions) options.buildOptions = workloadBuildOptions
  return options
}
