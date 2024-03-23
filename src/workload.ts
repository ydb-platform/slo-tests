import * as core from '@actions/core'
import * as github from '@actions/github'
import {
  callAsync,
  callKubernetesAsync,
  callKubernetesPathAsync
} from './callExecutables'
import {logGroup} from './utils/groupDecorator'

// npx fs-to-json --input "k8s/ci/*.yaml" --output src/manifests.json
import manifests from './manifests.json'
import {withTimeout} from './utils/withTimeout'

const workloadManifestTemplate = manifests['k8s/ci/workload.yaml'].content

const fs = require('fs')

export function dockerLogin(repo: string, user: string, password: string) {
  return logGroup('Docker login', async () => {
    try {
      await callAsync(
        `echo "${password}" | base64 -d | docker login ${repo} -u ${user} --password-stdin`,
        true
      )
      core.info('Successfully logged in')
    } catch (error: any) {
      // suppress error revealing user and password
      const msg = 'Incorrect docker repo, username or password'
      if (
        error?.message &&
        (error?.message as string).indexOf('username or password') > -1
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
  dockerImage: string,
  workingDir: string,
  options?: string,
  context?: string
) {
  if (!options || options.length === 0) options = ''
  if (!context || context.length === 0) context = '.'

  return core.group(`Build workload ${id}`, async () => {
    core.info('Build docker image')
    await callAsync(
      `docker buildx build --platform linux/amd64 ` +
        `-t ${dockerImage}:latest ` +
        `-t ${dockerImage}:gh-${github.context.sha} ` +
        `${options} ` +
        `${context}`,
      false,
      workingDir
    )
    core.info('Push docker tag @latest')
    await callAsync(`docker image push ${dockerImage}:latest`)
    core.info(`Push docker tag '@gh-${github.context.sha}'`)
    await callAsync(`docker image push ${dockerImage}:gh-${github.context.sha}`)
  })
}

export interface IWorkloadRunOptions {
  id: string
  dockerPath: string
  timeoutMins: number
  args: string
}

export function runWorkload(
  command: 'create' | 'run',
  options: IWorkloadRunOptions
) {
  return core.group(`Workload ${options.id} - ${command}`, async () => {
    const containerArgs = `grpc://database-sample-grpc:2135 /root/database-sample --table-name slo-${options.id} ${options.args}`

    const workloadManifest = workloadManifestTemplate
      .replace(/\$\{\{LANGUAGE_ID}}/g, options.id)
      .replace(/\$\{\{COMMAND}}/g, command)
      .replace(/\$\{\{DOCKER_IMAGE}}/g, options.dockerPath)
      .replace(
        '${{ARGS}}',
        containerArgs
          .split(' ')
          .map(s => `'${s}'`)
          .join('\n            - ')
      )

    core.debug(`Workload manifest: \n\n${workloadManifest}`)

    const startTime = new Date()
    core.info(
      `Workload apply ${command} result:\n` +
        (await callKubernetesPathAsync(
          kubectl => `${kubectl} apply -f - <<EOF\n${workloadManifest}\nEOF`
        ))
    )

    await withTimeout(
      options.timeoutMins,
      15,
      `Workload ${options.id} ${command}`,
      async () => {
        const status = JSON.parse(
          await callKubernetesAsync(
            `get job/${options.id}-wl-${command} -o=jsonpath={.status}`
          )
        )
        core.debug('Workload status check: ' + JSON.stringify(status))
        if (status.failed) {
          const msg = `Workload ${options.id} ${command} failed`
          core.info(msg)
          await saveLogs(options.id, command)
          throw new Error(msg)
        }
        return status.complete || status.succeeded
      }
    )
    const endTime = new Date()
    // print logs
    await saveLogs(options.id, command)
    return {startTime, endTime}
  })
}

async function saveLogs(id: string, command: string) {
  let logs = await callKubernetesAsync(`logs job/${id}-wl-${command}`)

  try {
    let dir = './logs'
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir)
    }

    await fs.promises.writeFile(`${dir}/${id}-${command}.log`, logs)
  } catch (e) {
    core.info(`error write file for ${id}-${command}: ${(e as Error).message}`)
    core.group(`Workload ${id} ${command} logs`, async () => {
      core.info(logs)
    })
  }
}
