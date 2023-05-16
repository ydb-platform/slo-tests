import * as core from '@actions/core'
import * as github from '@actions/github'
import {call, callKubernetesPath} from './callExecutables'
import {logGroup} from './groupDecorator'

// npx fs-to-json --input "k8s/ci/*.yaml" --output src/manifests.json
import manifests from './manifests.json'

const workloadManifestTemplate = manifests['k8s/ci/workload.yaml'].content

export function dockerLogin(repo: string, user: string, password: string) {
  return logGroup('Docker login', () => {
    try {
      call(
        `echo "${password}" | base64 -d | docker login ${repo} -u ${user} --password-stdin`,
        true
      )
      core.info('Successfully logged in')
    } catch (error: any) {
      // suppress error revealing user and password
      const msg = 'Incorrect docker repo, username or password'
      if (
        (error?.message as string).indexOf('incorrect username or password') >
        -1
      ) {
        core.info(msg)
      } else {
        core.info('Something went wrong in docker login')
      }
      throw new Error(msg)
    }
  })
}

export function generateDockerPath(repo: string, folder: string, id: string) {
  return `${repo}/${folder}/${id}`
}

export function buildWorkload(
  id: string,
  dockerPath: string,
  options?: string,
  context?: string
) {
  if (!options || options.length === 0) options = ''
  if (!context || context.length === 0) context = '.'

  return logGroup(`Build workload ${id}`, () => {
    core.info('Build docker image')
    call(
      `docker build ` +
        `-t ${dockerPath}:latest ` +
        `-t ${dockerPath}:gh-${github.context.sha} ` +
        `${options} ` +
        `${context}`
    )
    core.info('Push docker tag @latest')
    call(`docker image push ${dockerPath}:latest`)
    core.info(`Push docker tag '@gh-${github.context.sha}'`)
    call(`docker image push ${dockerPath}:gh-${github.context.sha}`)
  })
}

export interface IWorkloadRunOptions {
  id: string
  dockerPath: string
  args: string
}

export function runWorkload(
  command: 'create' | 'run',
  options: IWorkloadRunOptions
) {
  return logGroup(`Workload ${options.id} - ${command}`, () => {
    const workloadManifest = workloadManifestTemplate
      .replace('${{LANGUAGE_ID}}', options.id)
      .replace('${{COMMAND}}', command)
      .replace(
        '${{ARGS}}',
        options.args
          .split(' ')
          .map(s => `'${s}'`)
          .join('\n            - ')
      )

    core.debug(`Workload manifest: \n\n${workloadManifest}`)

    core.info(
      `Workload apply ${command} result:\n` +
        callKubernetesPath(
          kubectl => `${kubectl} apply -f - <<EOF\n${workloadManifest}\nEOF`
        )
    )
  })
}
