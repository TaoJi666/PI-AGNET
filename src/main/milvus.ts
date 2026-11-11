import { start, type MilvusLiteServer } from '@lyyyuna/milvus-lite'
import {
  DataType,
  IndexType,
  MetricType,
  MilvusClient,
  PlaceholderType
} from '@zilliz/milvus2-sdk-node'
import { VECTOR_DIM } from './embed'

export const COLLECTION = 'chunks'

let opening: Promise<MilvusClient> | null = null
let client: MilvusClient | null = null
let server: MilvusLiteServer | null = null

export async function openMilvus(dbFile: string): Promise<MilvusClient> {
  if (client) return client
  opening ??= open(dbFile).catch((error: unknown) => {
    opening = null
    throw error
  })
  return opening
}

export async function stopMilvus(): Promise<void> {
  const current = client
  const running = server
  client = null
  server = null
  opening = null
  await current?.closeConnection()
  await running?.stop()
}

async function open(dbFile: string): Promise<MilvusClient> {
  server = await start(dbFile, { logLevel: 'ERROR' })
  client = new MilvusClient({ address: server.addr })
  patchDescribe(client)
  const listed = await client.listCollections()
  const exists = listed.data.some((item) => item.name === COLLECTION)
  if (!exists) {
    const created = await client.createCollection({
      collection_name: COLLECTION,
      fields: [
        { name: 'id', data_type: DataType.VarChar, is_primary_key: true, max_length: 64 },
        { name: 'vector', data_type: DataType.FloatVector, dim: VECTOR_DIM },
        { name: 'path', data_type: DataType.VarChar, max_length: 512 },
        { name: 'text', data_type: DataType.VarChar, max_length: 1500 },
        { name: 'workspace', data_type: DataType.VarChar, max_length: 1024 }
      ]
    })
    assertOk(created, '创建集合失败')
    const indexed = await client.createIndex({
      collection_name: COLLECTION,
      field_name: 'vector',
      index_type: IndexType.FLAT,
      metric_type: MetricType.COSINE
    })
    assertOk(indexed, '创建索引失败')
  }
  const loaded = await client.loadCollection({ collection_name: COLLECTION })
  assertOk(loaded, '加载集合失败')
  return client
}

function patchDescribe(target: MilvusClient): void {
  const original = target.describeCollection.bind(target)
  target.describeCollection = (async (data: { collection_name: string }) => {
    try {
      return await original(data)
    } catch (error) {
      if (!(error instanceof TypeError)) throw error
      return liteDescription(data.collection_name)
    }
  }) as MilvusClient['describeCollection']
}

function liteDescription(
  collectionName: string
): Awaited<ReturnType<MilvusClient['describeCollection']>> {
  const field = (
    name: string,
    dataType: 'VarChar' | 'FloatVector',
    primary: boolean
  ): {
    name: string
    data_type: string
    dataType: DataType
    is_primary_key: boolean
    autoID: boolean
    is_function_output: boolean
    element_type: string
    dim: number
    _placeholderType: PlaceholderType
    index_params: { key: string; value: string }[]
  } => ({
    name,
    data_type: dataType,
    dataType: dataType === 'FloatVector' ? DataType.FloatVector : DataType.VarChar,
    is_primary_key: primary,
    autoID: false,
    is_function_output: false,
    element_type: 'None',
    dim: dataType === 'FloatVector' ? VECTOR_DIM : 0,
    _placeholderType:
      dataType === 'FloatVector' ? PlaceholderType.FloatVector : PlaceholderType.None,
    index_params:
      dataType === 'FloatVector' ? [{ key: 'metric_type', value: MetricType.COSINE }] : []
  })
  const vector = field('vector', 'FloatVector', false)
  return {
    status: {
      error_code: 'Success',
      reason: '',
      code: 0,
      retriable: false,
      detail: '',
      extra_info: {}
    },
    schema: {
      name: collectionName,
      enable_dynamic_field: false,
      fields: [
        field('id', 'VarChar', true),
        vector,
        field('path', 'VarChar', false),
        field('text', 'VarChar', false),
        field('workspace', 'VarChar', false)
      ]
    },
    properties: [],
    anns_fields: { vector },
    collection_name: collectionName
  } as unknown as Awaited<ReturnType<MilvusClient['describeCollection']>>
}

function assertOk(
  status: { error_code?: string | number; reason?: string },
  fallback: string
): void {
  const code = status.error_code
  if (code && code !== 'Success' && code !== 0) throw new Error(status.reason || fallback)
}
