import { declareType, snakeToCamelCaseConversion, TypedData, Types, withTypeOptions } from 'ydb-sdk'

export interface IStructValue {
  objectIdKey: number
  object_id: number
  timestamp: number
  payload: string
}

@withTypeOptions({ namesConversion: snakeToCamelCaseConversion })
export class StructValue extends TypedData {
  @declareType(Types.UINT32)
  public objectIdKey: number

  @declareType(Types.UINT32)
  public object_id: number

  @declareType(Types.UINT64)
  public timestamp: number

  @declareType(Types.UTF8)
  public payload: string

  static create(objectIdKey: number, object_id: number, timestamp: number, payload: string) {
    return new this({ objectIdKey, timestamp, object_id, payload })
  }

  constructor(data: IStructValue) {
    super(data)
    this.objectIdKey = data.objectIdKey
    this.timestamp = data.timestamp
    this.object_id = data.object_id
    this.payload = data.payload
  }
}
