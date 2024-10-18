// npx fs-to-json --input "k8s/ci/*.yaml" --outputAsArray true --formatted true --output src/manifests.json
import workloadManifestTemplateJson from "./workload.json"
import databaseManifestTemplateJson from "./database.json"
import storageManifestTemplateJson from "./storage.json"
import valuesForYDBOperatorJson from "./valuesForYDBOperator.json"
import prometheusPushGatewayJson from "./prometheus-pushgateway.json"
import grafanaRendererJson from "./grafana-renderer.json"
import prometheusJson from "./prometheus.json"
import serviceMonitorJson from "./serviceMonitor.json"
import grafanaJson from "./grafana.json"
import kindConfigJson from "./kind-config.json"

export const workloadManifestTemplate = workloadManifestTemplateJson["k8s/ci/workload.yaml"].content
export const databaseManifestTemplate = databaseManifestTemplateJson["k8s/ci/database.yaml"].content
export const storageManifestTemplate = storageManifestTemplateJson["k8s/ci/storage.yaml"].content
export const valuesForYDBOperator = valuesForYDBOperatorJson["k8s/ci/valuesForYDBOperator.yaml"].content
export const prometheusPushGateway = prometheusPushGatewayJson["k8s/ci/prometheus-pushgateway.yaml"].content
export const grafanaRenderer = grafanaRendererJson["k8s/ci/grafana-renderer.yaml"].content
export const prometheus = prometheusJson["k8s/ci/prometheus.yaml"].content
export const serviceMonitor = serviceMonitorJson["k8s/ci/serviceMonitor.yaml"].content
export const grafana = grafanaJson["k8s/ci/grafana.yaml"].content
export const kindConfig = kindConfigJson["k8s/ci/kind-config.yaml"].content
