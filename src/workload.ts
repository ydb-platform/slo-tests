import * as core from '@actions/core'
import {call} from './callExecutables'
import {logGroup} from './groupDecorator'

export function buildWorkload() {}

export function dockerLogin(repo: string, user: string, password: string) {
  return logGroup('Docker login', () => {
    try {
      call(
        `echo "${password}" | docker login ${repo} -u ${user} --password-stdin`,
        true
      )
    } catch (error: any) {
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
