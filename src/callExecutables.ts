import * as core from '@actions/core'
import {exec, execSync} from 'child_process'
import {mkdirSync, writeFileSync} from 'fs'
import {homedir} from 'os'
import path from 'path'
import {logGroup} from './utils/groupDecorator'

let kubectlPath: string | null = null
let callId = 0

export function call(command: string, secret = false) {
  const id = ++callId
  !secret && core.info(`Call #${id} command: '${command}'`)
  const spawnResult = execSync(command, {
    encoding: 'utf8',
    maxBuffer: Infinity,
    stdio: 'pipe'
  })
  core.debug(`Call #${id} result ${spawnResult}`)
  return spawnResult
}

export function callAsync(
  command: string,
  secret = false,
  cwd = '.'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = ++callId
    !secret && core.info(`Call #${id} command: '${command}' with cwd '${cwd}'`)
    const proc = exec(command, {encoding: 'utf8', maxBuffer: Infinity, cwd})
    if (!proc.stdio || !proc.stdout || !proc.stderr) {
      core.info(`Error in callAsync #${id}: can't spawn process`)
      throw new Error(`Error in callAsync #${id}: can't spawn process`)
    }

    let out = '',
      err = ''
    proc.stdout.on('data', data => (out += data.toString()))
    proc.stderr.on('data', data => (err += data.toString()))

    proc.on('close', code => {
      core.debug(`Call #${id} async code = ${code}`)
      if (code == 0) {
        if (out.length > 3000)
          core.debug(
            `Call #${id} async TRUNCATED (full size is ${
              out.length / 1024
            }kb - showing 3000 symbols) output: \n${out.slice(
              0,
              1500
            )}\n.........\n${out.slice(-1500)}`
          )
        else core.debug(`Call #${id} async output \n${out}`)
        resolve(out)
      } else {
        if (secret)
          core.info(`Call #${id} async with secrets failed - on close`)
        else
          core.info(
            `Call #${id} async failed - on close:\nError: ${err}\nOutput: ${out}`
          )

        reject(new Error(err))
      }
    })
    proc.on('error', err => {
      if (secret) core.info(`Call #${id} async with secrets failed - on error`)
      else
        core.info(
          `Call #${id} async failed - on error:\nError: ${err}\nOutput: ${out}`
        )

      reject(err)
    })
  })
}

export function callKubernetes(command: string) {
  if (kubectlPath === null)
    throw new Error('K8s not initialized, call prepareK8S first')
  return call(`${kubectlPath} ${command}`)
}

export function callKubernetesPath(
  commandGenerator: (kPath: string) => string
) {
  if (kubectlPath === null)
    throw new Error('K8s not initialized, call prepareK8S first')
  return call(commandGenerator(kubectlPath))
}

export function callKubernetesAsync(command: string) {
  if (kubectlPath === null)
    throw new Error('K8s not initialized, call prepareK8S first')
  return callAsync(`${kubectlPath} ${command}`)
}

export function callKubernetesPathAsync(
  commandGenerator: (kPath: string) => string
) {
  if (kubectlPath === null)
    throw new Error('K8s not initialized, call prepareK8S first')
  return callAsync(commandGenerator(kubectlPath))
}
