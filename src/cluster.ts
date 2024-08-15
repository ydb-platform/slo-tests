import * as core from '@actions/core'
import {logGroup} from './utils/groupDecorator'
import {call, callKubernetes, callKubernetesPath, init_kubectlPath} from './callExecutables'

// npx fs-to-json --input "k8s/ci/*.yaml" --output src/manifests.json
import manifests from './manifests.json'
import {withTimeout} from './utils/withTimeout'
import { describe } from 'node:test'

let databaseManifest = manifests['k8s/ci/database.yaml'].content
let storageManifest = manifests['k8s/ci/storage.yaml'].content

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
    core.info(
      'database apply result:\n' +
        callKubernetesPath(
          kubectl => `${kubectl} apply -f - <<EOF\n${databaseManifest}\nEOF`
        )
    )
    // TODO: create placeholders in k8s for database to speed up the startup

    core.info('Check creation process')

    let lastDatabaseStatus = getStatus('database')
    let lastStorageStatus = getStatus('storage')
    await withTimeout(timeout, checkPeriod, 'YDB cluster create', async () => {
      core.debug('check status of cluster')
      const databaseStatus = getStatus('database')
      const storageStatus = getStatus('storage')
      core.debug(
        `Current status of cluster: database - ${databaseStatus}, storage - ${storageStatus}`
      )
      if (databaseStatus !== lastDatabaseStatus) {
        core.info(
          `Database become '${databaseStatus}', storage is '${storageStatus}'`
        )
        core.info(callKubernetes('describe databases.ydb.tech database-sample'))
        lastDatabaseStatus = databaseStatus
      }
      if (storageStatus !== lastStorageStatus) {
        core.info(
          `Storage become '${storageStatus}', database is '${databaseStatus}'`
        )
        core.info(callKubernetes('describe databases.ydb.tech database-sample'))
        lastStorageStatus = storageStatus
      }
      if (databaseStatus === 'Ready' && storageStatus === 'Ready') return true
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

function get_status(statusOf: 'prometheus' | 'grafana'){
  const res = callKubernetes(
    `get pods -l app.kubernetes.io/instance=${statusOf} -ojsonpath={.items..status.containerStatuses..ready}`
  )
  let mylist: string[] = res.split(" ")
  return mylist
}

function install_prometheus(){
  core.info('install prometheus')

  call('helm repo add prometheus-community https://prometheus-community.github.io/helm-charts')
  call('helm install prometheus prometheus-community/prometheus')
}

function run_prometheus(){
  core.info('run prometheus')

  callKubernetes('expose service prometheus-server --type=NodePort --target-port=9091 --name=prometheus-server-np')
}

function install_ydb_operator(){
  core.info('install ydb operator')

  call('git clone https://github.com/ydb-platform/ydb-kubernetes-operator')
  call('cd ydb-kubernetes-operator')
  call('helm repo add ydb https://charts.ydb.tech/')
  call('helm repo update')
  call('helm install ydb-operator ydb/ydb-operator')
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

function install_grafana(){
  core.info('install grafana')
  
  call('helm repo add grafana https://grafana.github.io/helm-charts')
  call('helm install grafana grafana/grafana')
}

function run_grafana(){
  core.info('run grafana')

  callKubernetes('expose service grafana --type=NodePort --target-port=3000 --name=grafana-np')
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

export async function deploy_prometheus(
  timeout: number,
  checkPeriod: number = 10
){
  return logGroup('Deploy prometheus', async () => {
    install_prometheus()

    run_prometheus()

    await withTimeout(timeout, checkPeriod, 'Prometheus create', async () => {
      core.debug('check status of prometheus')
      const prometheusStatus = get_status('prometheus')
      let allTrue = true
      prometheusStatus.forEach((status) => {
        if (status != 'true'){
          allTrue = false
        } 
      });
      if (allTrue === true) return true
      return false
    })

  })
}

export async function deploy_grafana(
  timeout: number,
  checkPeriod: number = 10
){
  return logGroup('Deploy grafana', async () => {
    install_grafana()

    run_grafana()

    await withTimeout(timeout, checkPeriod, 'Grafana create', async () => {
      core.debug('check status of grafana')
      const prometheusStatus = get_status('grafana')
      let allTrue = true
      prometheusStatus.forEach((status) => {
        if (status != 'true'){
          allTrue = false
        } 
      });
      if (allTrue === true) return true
      return false
    })
  })
}