# How to install prometheus in cluster

```
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm install prometheus prometheus-community/prometheus --values k8s/ci/prometheus/prom.yaml
helm install grafana grafana/grafana --values k8s/ci/prometheus/grafana.yaml
```
