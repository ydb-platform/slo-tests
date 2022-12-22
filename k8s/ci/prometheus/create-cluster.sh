helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack
helm install prometheus-pushgateway prometheus-community/prometheus-pushgateway