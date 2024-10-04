// npx fs-to-json --input "k8s/ci/*.yaml" --outputAsArray true --formatted true --output src/manifests.json
import workload from './workload.json'
import database from './database.json'
import storage from './storage.json'

export const workloadManifestTemplate = workload["k8s/ci/workload.yaml"].content
export const databaseManifestTemplate = database["k8s/ci/database.yaml"].content
export const storageManifestTemplate = storage["k8s/ci/storage.yaml"].content
export const databaseManifest = ""
    export const storageManifest = ""
    export const valuesForYDBOperator = ""
    export const prometheusPushGateway = ""
    export const grafanaRenderer = ""
    export const prometheus = ""
    export const serviceMonitor = ""
    export const grafana = ""
    export const kindConfig = ""
