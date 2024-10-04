import * as core from '@actions/core'
import { logGroup } from './utils/groupDecorator'
import { call, callKubernetes, callKubernetesPath, init_kubectlPath } from './callExecutables'

import {
  databaseManifestTemplate,
  storageManifestTemplate,
  databaseManifest,
  storageManifest,
  valuesForYDBOperator,
  prometheusPushGateway,
  grafanaRenderer,
  prometheus,
  serviceMonitor,
  grafana,
  kindConfig
} from './manifests/manifests'
import {withTimeout} from './utils/withTimeout'
import * as fs from "fs";

/**
 * Create cluster with selected version
 * @param version YDB docker version
 * @param timeout timeout in minutes
 * @param checkPeriod update period in seconds
 */
export async function createCluster(
  version: string = '24.1',
  timeout: number,
  checkPeriod: number = 10
) {
  return logGroup('Create cluster', async () => {
    const databaseManifest = databaseManifestTemplate.replace('${{VERSION}}', version)
    const storageManifest = storageManifestTemplate.replace('${{VERSION}}', version)

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
    `get ${statusOf}s.ydb.tech ${statusOf} -ojsonpath={.status}`
  )
  return JSON.parse(res).state
}

export function deleteCluster() {
  return logGroup('Delete cluster', () => {
    core.info('Delete cluster')
    try {
      core.info(
        'Cluster delete result:\n' +
        call('kind delete cluster')
      )
    } catch (error) {
      core.info('Error while deleting kind' + JSON.stringify(error))
    }
  })
}

function get_status_monitoring() {
  const res = callKubernetes(
    `get pods -ojsonpath={.items..status..status}`
  )
  let mylist: string[] = res.split(" ")
  return mylist
}

function install_ydb_operator() {
  core.info('install ydb operator')

  call('helm repo add ydb https://charts.ydb.tech/')
  call('helm repo update')
  call(`helm upgrade --install ydb-operator ydb/ydb-operator --values - <<EOF\n${valuesForYDBOperator}\nEOF`)
  call(`kubectl apply -f - <<EOF\n${serviceMonitor}\nEOF`)
}

function install_kubectl() {
  core.info('install kubectl')

  call('curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"')
  call('sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl')
  call('sudo rm kubectl')
}

function install_helm() {
  core.info('install helm')

  call('curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3')
  call('chmod 700 get_helm.sh')
  call('./get_helm.sh')
  call('sudo rm get_helm.sh')
}

function install_kind() {
  core.info('install kind')

  call('[ $(uname -m) = x86_64 ] && curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.24.0/kind-linux-amd64')
  call('chmod +x ./kind')
  call('sudo mv ./kind /usr/local/bin/kind')
}

function run_kind() {
  core.info('run kind')

  fs.writeFileSync('kindConfig.yaml', kindConfig)
  call(`kind create cluster \
 --image=kindest/node:v1.28.0 \
 --config=kindConfig.yaml \
 --wait 5m`)
  call('kubectl config use-context kind-kind')
}

function install_monitoring() {
  core.info('install monitoring')

  call('helm repo add prometheus-community https://prometheus-community.github.io/helm-charts')
  call('helm repo add grafana https://grafana.github.io/helm-charts')
  call('helm repo update')

  call('kubectl create -f https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/v0.64.0/bundle.yaml')
  call(`kubectl apply -f - <<EOF\n${prometheus}\nEOF`)
  call(`helm upgrade --install prometheus-pushgateway prometheus-community/prometheus-pushgateway --values - <<EOF\n${prometheusPushGateway}\nEOF`)
  call(`helm upgrade --install grafana grafana/grafana --values - <<EOF\n${grafana}\nEOF`)
  call(`kubectl apply -f - <<EOF\n${grafanaRenderer}\nEOF`)
}

function install_docker() {
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

export async function deploy_kind() {
  return logGroup('Deploy kind', async () => {
    if (!call('which kubectl')) {
      install_kubectl()
    }
    if (!call('which helm')) {
      install_helm()
    }
    if (!call('which docker')) {
      install_docker()
    }

    install_kind()

    run_kind()

    init_kubectlPath()
  })
}

export async function deploy_ydb_operator(
  timeout: number,
  checkPeriod: number = 10
) {
  return logGroup('Deploy YDB operator', async () => {
    install_ydb_operator()

    await withTimeout(timeout, checkPeriod, 'monitoring create', async () => {
      core.debug('check status of monitoring')
      const monitoringStatus = get_status_monitoring()
      let allTrue = true
      monitoringStatus.forEach((status) => {
        if (status != 'True') {
          allTrue = false
        }
      });
      if (allTrue === true) return true
      return false
    })
  })
}

export async function deploy_monitoring(
  timeout: number,
  checkPeriod: number = 10
) {
  return logGroup('Deploy monitoring', async () => {
    install_monitoring()

    await withTimeout(timeout, checkPeriod, 'monitoring create', async () => {
      core.debug('check status of monitoring')
      const monitoringStatus = get_status_monitoring()
      let allTrue = true
      monitoringStatus.forEach((status) => {
        if (status != 'True') {
          allTrue = false
        }
      });
      if (allTrue === true) return true
      return false
    })
  })
}

