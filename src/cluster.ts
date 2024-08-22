import * as core from '@actions/core'
import {logGroup} from './utils/groupDecorator'
import {call, callKubernetes, callKubernetesPath, init_kubectlPath} from './callExecutables'

// npx fs-to-json --input "k8s/ci/*.yaml" --output src/manifests.json
import manifests from './manifests.json'
import {withTimeout} from './utils/withTimeout'
import { describe } from 'node:test'

let databaseManifest = manifests['k8s/ci/database.yaml'].content
let storageManifest = manifests['k8s/ci/storage.yaml'].content
let sloConfigMap = manifests['k8s/ci/slo-monitoring.yaml'].content
let valuesForYDBOperator = manifests['k8s/ci/valuesForYDBOperator.yaml'].content

/**
 * Create cluster with selected version
 * @param version YDB docker version
 * @param timeout timeout in minutes
 * @param checkPeriod update period in seconds
 */
export async function createCluster(
  version: string = '23.1.19',
  timeout: number,
  checkPeriod: number = 10
) {
  return logGroup('Create cluster', async () => {
    databaseManifest = databaseManifest.replace('${{VERSION}}', version)
    storageManifest = storageManifest.replace('${{VERSION}}', version)

    core.debug('database manifest:\n\n' + databaseManifest)
    core.debug('storage manifest:\n\n' + storageManifest)
    core.info('Apply database and storage manifests')
    core.info(
      'storage apply result:\n' +
        callKubernetesPath(
          kubectl => `${kubectl} apply -f - <<EOF\n${storageManifest}\nEOF`
        )
    )
    let lastStorageStatus = getStatus('storage')
    core.info('Check creation process')

    await withTimeout(timeout, checkPeriod, 'YDB cluster create storage', async () => {
      core.debug('check status of cluster')
      const storageStatus = getStatus('storage')
      core.debug(
        `Current status of cluster: storage - ${storageStatus}`
      )
      if (storageStatus !== lastStorageStatus) {
        core.info(
          `Storage become '${storageStatus}'`
        )
        lastStorageStatus = storageStatus
      }
      if (storageStatus === 'Ready') return true
      return false
    })

    core.info(
      'database apply result:\n' +
        callKubernetesPath(
          kubectl => `${kubectl} apply -f - <<EOF\n${databaseManifest}\nEOF`
        )
    )
    // TODO: create placeholders in k8s for database to speed up the startup

    let lastDatabaseStatus = getStatus('database')
    core.info('Check creation process')
    
    await withTimeout(timeout, checkPeriod, 'YDB cluster create database', async () => {
      core.debug('check status of cluster')
      const databaseStatus = getStatus('database')
      core.debug(
        `Current status of cluster: database - ${databaseStatus}`
      )
      if (databaseStatus !== lastDatabaseStatus) {
        core.info(
          `Database become '${databaseStatus}'`
        )
        lastDatabaseStatus = databaseStatus
      }
      if (databaseStatus === 'Ready') return true
      return false
    })
  })
}

export function getYdbVersions() {
  return logGroup('Get versions', () => {
    const versionsString = call(
      'docker run --rm ghcr.io/regclient/regctl:v0.4.8 tag ls cr.yandex/crptqonuodf51kdj7a7d/ydb'
    )
    const versions = versionsString.split('\n').filter(s => s.length > 0)
    versions.sort()
    return versions
  })
}

function getStatus(statusOf: 'database' | 'storage') {
  const res = callKubernetes(
    `get ${statusOf}s.ydb.tech ${statusOf}-sample -ojsonpath={.status}`
  )
  return JSON.parse(res).state
}

export function deleteCluster() {
  return logGroup('Delete cluster', () => {
    core.info('Delete minikube')
    try {
      core.info(
        'Minikube delete result:\n' +
          call('minikube delete')
      )
    } catch (error) {
      core.info('Error while deleting minikube' + JSON.stringify(error))
    }
  })
}

function get_status_monitoring(){
  const res = callKubernetes(
    `get pods -ojsonpath={.items..status..status}`
  )
  let mylist: string[] = res.split(" ")
  return mylist
}

function install_ydb_operator(){
  core.info('install ydb operator')

  call('git clone https://github.com/ydb-platform/ydb-kubernetes-operator')
  call('cd ydb-kubernetes-operator')
  call('helm repo add ydb https://charts.ydb.tech/')
  call('helm repo update')
  call(`helm install ydb-operator ydb/ydb-operator -f - <<EOF\n${valuesForYDBOperator}\nEOF`)
  call('cd ..')
}

function install_kubectl(){
  core.info('install kubectl')

  call('curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"')
  call('sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl')
  call('sudo rm kubectl')
}

function install_helm(){
  core.info('install helm')

  call('curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3')
  call('chmod 700 get_helm.sh')
  call('./get_helm.sh')
  call('sudo rm get_helm.sh')
}

function install_minikube(){
  core.info('install minikube')

  call('curl -Lo minikube https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64')
  call('chmod +x minikube')
  call('mkdir -p /usr/local/bin/')
  call('sudo install minikube /usr/local/bin/')
  call('sudo rm minikube')
}

function run_minikube(){
  core.info('run minikube')
  
  call('minikube start --memory=max --cpus=max')
}

function install_monitoring(){
  core.info('install monitoring')

  call('helm repo add prometheus-community https://prometheus-community.github.io/helm-charts')
  call('helm install prometheus prometheus-community/kube-prometheus-stack')
}

function add_slo_monitoring(){
  core.info('add monitoring table')
  core.info(JSON.stringify(call("pwd")))
  core.info(JSON.stringify(call("ls")))
  
  callKubernetesPath(
    kubectl => `${kubectl} apply -f - <<EOF\n${sloConfigMap}\nEOF`
  )
}

function install_docker(){
  core.info('install docker')

  call('sudo apt update && sudo apt upgrade')
  call('sudo apt install linux-image-extra-$(uname -r) linux-image-extra-virtual')
  call('sudo apt install apt-transport-https ca-certificates curl software-properties-common')
  call('curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -')
  call('sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu bionic stable"')
  call('sudo apt update && apt-cache policy docker-ce')
  call('sudo apt install -y docker-ce')
  call('sudo usermod -aG docker $(whoami)')
}

export function deploy_minikube() {
  if (!call('which kubectl')){
    install_kubectl()
  }
  if (!call('which helm')){
    install_helm()
  }  
  if (!call('which docker')){
    install_docker()
  }

  install_minikube()

  run_minikube()

  init_kubectlPath()
}

export function deploy_ydb_operator(){
    install_ydb_operator()
}

export async function deploy_monitoring(
  timeout: number,
  checkPeriod: number = 10
){
  return logGroup('Deploy monitoring', async () => {
    install_monitoring()

    add_slo_monitoring()

    await withTimeout(timeout, checkPeriod, 'monitoring create', async () => {
      core.debug('check status of monitoring')
      const monitoringStatus = get_status_monitoring()
      let allTrue = true
      monitoringStatus.forEach((status) => {
        if (status != 'true'){
          allTrue = false
        } 
      });
      if (allTrue === true) return true
      return false
    })
  })
}

