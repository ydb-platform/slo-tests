import * as core from '@actions/core'
import {logGroup} from './utils/groupDecorator'
import {getYdbVersions} from './cluster'

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
  return logGroup('Parse arguments', () => {
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

    const githubToken: string = core.getInput('GITHUB_TOKEN')
    const kubeconfig = core.getInput('KUBECONFIG_B64')
    const dockerRepo = core.getInput('DOCKER_REPO')
    const dockerFolder = core.getInput('DOCKER_FOLDER')
    const dockerUsername = core.getInput('DOCKER_USERNAME')
    const dockerPassword = core.getInput('DOCKER_PASSWORD')
    const awsCredentials = core.getInput('AWS_CREDENTIALS_B64')
    const awsConfig = core.getInput('AWS_CONFIG_B64')
    const s3Endpoint = core.getInput('s3_endpoint')
    const s3Folder = core.getInput('s3_images_folder')
    const grafanaDomain = core.getInput('grafana_domain')
    const grafanaDashboard = core.getInput('grafana_dashboard') || '7CzMl5t4k'

    let ydbVersion = core.getInput('ydb_version')

    const timeBetweenPhases = Number(
      core.getInput('time_between_phases') || '20'
    )
    const shutdownTime = Number(core.getInput('shutdown_time') || '30')

    if (isNaN(timeBetweenPhases))
      throw new Error('time_between_phases is not a number')
    if (isNaN(shutdownTime)) throw new Error('shutdown_time is not a number')

    if (ydbVersion === '') ydbVersion = '23.1.26'
    if (ydbVersion === 'newest') {
      core.info('Get YDB docker versions')
      const ydbVersions = getYdbVersions()
      ydbVersion = ydbVersions[ydbVersions.length - 1]
      core.info(`Use YDB docker version = '${ydbVersion}'`)
    }

    return {
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
    }
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
