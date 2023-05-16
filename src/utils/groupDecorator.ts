import * as core from '@actions/core'

export function logGroup<T extends any>(
  name: string,
  fun: () => Promise<T>
): Promise<T>

export function logGroup<T extends any>(name: string, fun: () => T): T

export function logGroup<T extends any>(
  name: string,
  fun: () => Promise<T> | T
): Promise<T> | T {
  core.startGroup(name)
  const res = fun()

  if (res instanceof Promise) {
    return res.finally(() => {
      core.endGroup()
    })
  } else {
    core.endGroup()
    return res
  }
}
