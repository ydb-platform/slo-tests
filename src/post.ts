import * as core from '@actions/core'
import {call} from './callExecutables'

core.info('Cleanup')
core.debug('Remove .kube dir')
call('rm -rf ~/.kube')
core.debug('Remove .aws dir')
call('rm -rf ~/.aws')
