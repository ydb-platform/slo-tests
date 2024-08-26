import {callKubernetesAsync} from './callExecutables'
import {retry} from './utils/retry'
import {withTimeoutSimple} from './utils/withTimeout'

export async function getInfrastractureEndpoints() {
  const services = [
    'prometheus-operator',
    'prometheus',
    'prometheus-pushgateway',
    'grafana',
    //'grafana-renderer',
    'ydb-operator'
  ]
  return Promise.allSettled(services.map(getEndpoint)).then(res => {
    const servicesWithoutPods = services.filter(
      (v, i) => res[i].status === 'rejected'
    )
    if (servicesWithoutPods.length > 0) {
      throw new Error(
        `Not found those required k8s pods: ${servicesWithoutPods.join(', ')}`
      )
    }

    // return {
    //   prometheusOperator: (res[0] as PromiseFulfilledResult<string>).value,
    //   prometheus: (res[1] as PromiseFulfilledResult<string>).value,
    //   prometheusPushgateway: (res[2] as PromiseFulfilledResult<string>).value,
    //   grafana: (res[3] as PromiseFulfilledResult<string>).value,
    //   grafanaRenderer: (res[4] as PromiseFulfilledResult<string>).value,
    //   ydbOperator: (res[5] as PromiseFulfilledResult<string>).value
    // }
    return {
      prometheusOperator: (res[0] as PromiseFulfilledResult<string>).value,
      prometheus: (res[1] as PromiseFulfilledResult<string>).value,
      prometheusPushgateway: (res[2] as PromiseFulfilledResult<string>).value,
      grafana: (res[3] as PromiseFulfilledResult<string>).value,
      ydbOperator: (res[4] as PromiseFulfilledResult<string>).value
    }
    //test
  })
}

function getEndpoint(kubeName: string) {
  return retry(2, () => {
    return withTimeoutSimple(
      10,
      callKubernetesAsync(
        `get pods -l "app.kubernetes.io/name=${kubeName}" -o jsonpath="{.items[0].metadata.name}"`
      ).then(s => s.split('\n')[0])
    )
  })
}
