import * as core from '@actions/core'
import {execSync} from 'child_process'
import {mkdirSync, writeFileSync} from 'fs'
import {homedir} from 'os'
import path from 'path'
import {logGroup} from './utils/groupDecorator'

let kubectlPath: string | null = null

export function prepareK8S(base64kubeconfig: string) {
  return logGroup('Prepare k8s', () => {
    // create ~/.kube folder
    const kubePath = path.join(homedir(), '.kube')
    core.info(`mkdir ${kubePath}`)
    try {
      mkdirSync(kubePath)
    } catch (error: any) {
      core.debug('error' + JSON.stringify(error))
      if (error?.code === 'EEXIST') {
        core.debug(kubePath + ' EEXIST')
      } else throw error
    }

    // add kubeconfig
    if (base64kubeconfig.length > 0) {
      core.debug('Get kubeconfig string')
      const kubeconfig = Buffer.from(base64kubeconfig, 'base64').toString(
        'utf8'
      )
      core.info(`Write kubeconfig to ~/.kube/config`)
      writeFileSync(path.join(homedir(), '.kube/config'), kubeconfig)
    }

    kubectlPath = call('which kubectl').split('\n')[0]
    core.info(`kubectl path: ${kubectlPath}`)
  })
}

export function call(command: string, secret = false) {
  !secret && core.info(`Call command: '${command}'`)
  const spawnResult = execSync(command, {encoding: 'utf8', stdio: 'pipe'})
  return spawnResult
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
