import * as core from '@actions/core'
import {logGroup} from './utils/groupDecorator'
import {call, callKubernetes, callKubernetesPath} from './callExecutables'

// npx fs-to-json --input "k8s/ci/*.yaml" --output src/manifests.json
import manifests from './manifests.json'
import {withTimeout} from './utils/withTimeout'

let databaseManifest = manifests['k8s/ci/database.yaml'].content
let storageManifest = manifests['k8s/ci/storage.yaml'].content

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
        lastDatabaseStatus = databaseStatus
      }
      if (storageStatus !== lastStorageStatus) {
        core.info(
          `Storage become '${storageStatus}', database is '${databaseStatus}'`
        )
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
    core.info('Delete database and storage manifests')
    try {
      core.info(
        'Database delete result:\n' +
          callKubernetes('delete databases.ydb.tech database-sample')
      )
    } catch (error) {
      core.info('Error while deleting database' + JSON.stringify(error))
    }

    try {
      core.info(
        'Storage delete result:\n' +
          callKubernetes('delete storages.ydb.tech storage-sample')
      )
    } catch (error) {
      core.info('Error while deleting storage' + JSON.stringify(error))
    }

    try {
      const pvcs = callKubernetes(
        'get pvc -o=jsonpath="{.items[*].metadata.name}" -l ydb.tech/statefulset-name=storage-sample'
      )
      core.debug('pvcs' + pvcs)
      core.info('PVC delete result:\n' + callKubernetes(`delete pvc ${pvcs}`))
    } catch (error) {
      core.info('Error while deleting pvcs' + JSON.stringify(error))
    }
  })
}
