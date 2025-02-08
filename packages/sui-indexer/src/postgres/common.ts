import { Hex } from "viem";

export type RecordData = {
  address: Hex;
  tableId: Hex;
  keyBytes: Hex;
  staticData: Hex | null;
  encodedLengths: Hex | null;
  dynamicData: Hex | null;
  recordBlockNumber: string;
  logIndex: number;
};

export type RecordMetadata = {
  indexerVersion: string;
  chainId: string;
  chainBlockNumber: string;
  totalRows: number;
};

export type QueryAdapter = {
  getEvents: (name: string) => Promise<{
    id: number;
    name: string;
    value: any;
    checkpoint: string;
    digest: string;
    created_at: Date;
  }[]>;
  getSchemas: (name: string) => Promise<{
    id: number;
    name: string;
    key1?: string;
    key2?: string;
    value: any;
    last_update_checkpoint: string;
    last_update_digest: string;
    is_removed: boolean;
    created_at: Date;
    updated_at: Date;
  }[]>;
};

export type Record = RecordData & RecordMetadata;
