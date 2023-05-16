import * as core from '@actions/core'
import * as github from '@actions/github'
import {call} from './callExecutables'
import {logGroup} from './groupDecorator'

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

export function buildWorkload(
  repo: string,
  folder: string,
  id: string,
  options?: string,
  context?: string
) {
  if (!options || options.length === 0) options = ''
  if (!context || context.length === 0) context = '.'

  return logGroup('Build workload', () => {
    core.info('Build docker image')
    const dockerImg = `${repo}/${folder}/${id}`
    call(
      `docker build ` +
        `-t ${dockerImg}:latest ` +
        `-t ${dockerImg}:gh-${github.context.sha} ` +
        `${options} ` +
        `${context}`
    )
    core.info('Push docker tag @latest')
    call(`docker image push ${dockerImg}:latest`)
    core.info(`Push docker tag '@gh-${github.context.sha}'`)
    call(`docker image push ${dockerImg}:gh-${github.context.sha}`)
  })
}
