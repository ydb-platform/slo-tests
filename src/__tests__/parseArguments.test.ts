import {expect, test} from '@jest/globals'
import {parseArguments} from '../parseArguments'

function checkSuffixes(suffixes: string[]) {
  suffixes.map(suffix => {
    process.env[`INPUT_LANGUAGE_ID${suffix}`] = `my_test_language_id${suffix}`
    process.env[
      `INPUT_WORKLOAD_PATH${suffix}`
    ] = `my_test_workload_path${suffix}`
  })
  expect(parseArguments()).toStrictEqual(
    suffixes.map(suffix => ({
      id: `my_test_language_id${suffix}`,
      path: `my_test_workload_path${suffix}`
    }))
  )

  suffixes.map(suffix => {
    delete process.env[`INPUT_LANGUAGE_ID${suffix}`]
    delete process.env[`INPUT_WORKLOAD_PATH${suffix}`]
  })
}

test('parseArguments 1 arg', () => {
  checkSuffixes([''])
})
test('parseArguments 2 arg (variant 1)', () => {
  checkSuffixes(['', '0'])
})
test('parseArguments 2 arg (variant 2)', () => {
  checkSuffixes(['0', '1'])
})
