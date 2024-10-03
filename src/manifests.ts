const fs2json = require('fs-to-json').fs2json

function manifests(path: string) {
    return fs2json({input: path})
}

export const databaseManifestTemplate = manifests('k8s/ci/database.yaml')
export const storageManifestTemplate = manifests('k8s/ci/storage.yaml')
export const valuesForYDBOperator = manifests('k8s/ci/valuesForYDBOperator.yaml')
export const prometheusPushGateway = manifests('k8s/ci/prometheus-pushgateway.yaml')
export const grafanaRenderer = manifests('k8s/ci/grafana-renderer.yaml')
export const prometheus = manifests('k8s/ci/prometheus.yaml')
export const serviceMonitor = manifests('k8s/ci/serviceMonitor.yaml')
export const grafana = manifests('k8s/ci/grafana.yaml')
export const kindConfig = manifests('k8s/ci/kind-config.yaml')
export const workloadManifestTemplate = manifests('k8s/ci/workload.yaml')
