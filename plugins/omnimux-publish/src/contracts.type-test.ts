import type { AggregateStatus, DisplayStatus } from './shared/record-status.js'
import type { PublishConfig } from './config.js'
import type { PublishRecord, RecordView } from './record-types.js'
import type { createRecordStore } from './store.js'
import type { createSubmitService } from './submit.js'
import type { createPublishDispatcher } from './http-routes.js'

type Assert<T extends true> = T
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false

type FiveAggregateStates = Assert<Equal<AggregateStatus, 'draft' | 'publishing' | 'partial_failed' | 'failed' | 'published'>>
type ReviewingIsDisplayOnly = Assert<Equal<Extract<AggregateStatus, 'reviewing'>, never>>
type DisplayIncludesReviewing = Assert<Equal<DisplayStatus, AggregateStatus | 'reviewing'>>
type StoreRecord = Assert<Equal<ReturnType<ReturnType<typeof createRecordStore>['get']>, PublishRecord | null>>
type StoreView = Assert<Equal<ReturnType<ReturnType<typeof createRecordStore>['getView']>, RecordView | null>>
type SubmitStore = Assert<Equal<Parameters<typeof createSubmitService>[0]['store'], ReturnType<typeof createRecordStore>>>
type DispatcherStore = Assert<Equal<Parameters<typeof createPublishDispatcher>[0]['store'], ReturnType<typeof createRecordStore>>>
type ConfigStatus = Assert<Equal<PublishConfig['statusMap'][string], 'submitted' | 'reviewing' | 'published' | 'failed'>>
