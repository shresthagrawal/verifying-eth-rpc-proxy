import {
  setLengthLeft,
  hexToBytes,
  bigIntToHex,
  bytesToHex,
  intToHex,
} from '@ethereumjs/util';
import { HeaderData, BlockData, Block } from '@ethereumjs/block';
import {
  TxData,
  AccessListEIP2930TxData,
  FeeMarketEIP1559TxData,
  TypedTransaction,
} from '@ethereumjs/tx';
import {
  TxReceipt,
  PreByzantiumTxReceipt,
  PostByzantiumTxReceipt,
} from '@ethereumjs/vm';
import { Log } from '@ethereumjs/evm';
import { JSONRPCTx, JSONRPCBlock, JSONRPCReceipt } from './types';

const isTruthy = (val: any) => !!val;

// TODO: fix blockInfo type
export function headerDataFromWeb3Response(blockInfo: any): HeaderData {
  return {
    parentHash: blockInfo.parentHash,
    uncleHash: blockInfo.sha3Uncles,
    coinbase: blockInfo.miner,
    stateRoot: blockInfo.stateRoot,
    transactionsTrie: blockInfo.transactionsRoot,
    receiptTrie: blockInfo.receiptsRoot,
    logsBloom: blockInfo.logsBloom,
    difficulty: BigInt(blockInfo.difficulty),
    number: BigInt(blockInfo.number),
    gasLimit: BigInt(blockInfo.gasLimit),
    gasUsed: BigInt(blockInfo.gasUsed),
    timestamp: BigInt(blockInfo.timestamp),
    extraData: blockInfo.extraData,
    mixHash: (blockInfo as any).mixHash, // some reason the types are not up to date :(
    nonce: blockInfo.nonce,
    baseFeePerGas: blockInfo.baseFeePerGas
      ? BigInt(blockInfo.baseFeePerGas)
      : undefined,
    withdrawalsRoot: blockInfo.withdrawalsRoot,
    excessBlobGas: blockInfo.excessBlobGas,
    blobGasUsed: blockInfo.blobGasUsed,
    parentBeaconBlockRoot: blockInfo.parentBeaconBlockRoot,
  };
}

export function txDataFromWeb3Response(
  txInfo: any,
): TxData | AccessListEIP2930TxData | FeeMarketEIP1559TxData {
  return {
    ...txInfo,
    data: txInfo.input,
    gasPrice: BigInt(txInfo.gasPrice),
    gasLimit: txInfo.gas,
    to: isTruthy(txInfo.to)
      ? setLengthLeft(hexToBytes(txInfo.to), 20)
      : undefined,
    value: BigInt(txInfo.value),
    maxFeePerGas: isTruthy(txInfo.maxFeePerGas)
      ? BigInt(txInfo.maxFeePerGas)
      : undefined,
    maxPriorityFeePerGas: isTruthy(txInfo.maxPriorityFeePerGas)
      ? BigInt(txInfo.maxPriorityFeePerGas)
      : undefined,
  };
}

export function blockDataFromWeb3Response(blockInfo: any): BlockData {
  return {
    header: headerDataFromWeb3Response(blockInfo),
    transactions: blockInfo.transactions.map(txDataFromWeb3Response),
  };
}

export function toJSONRPCTx(
  tx: TypedTransaction,
  block?: Block,
  txIndex?: number,
): JSONRPCTx {
  const txJSON = tx.toJSON();
  return {
    blockHash: block ? bytesToHex(block.hash()) : null,
    blockNumber: block ? bigIntToHex(block.header.number) : null,
    from: tx.getSenderAddress().toString(),
    gas: txJSON.gasLimit!,
    gasPrice: txJSON.gasPrice ?? txJSON.maxFeePerGas!,
    maxFeePerGas: txJSON.maxFeePerGas,
    maxPriorityFeePerGas: txJSON.maxPriorityFeePerGas,
    type: intToHex(tx.type),
    accessList: txJSON.accessList,
    chainId: txJSON.chainId,
    hash: bytesToHex(tx.hash()),
    input: txJSON.data!,
    nonce: txJSON.nonce!,
    to: tx.to?.toString() ?? null,
    transactionIndex: txIndex !== undefined ? intToHex(txIndex) : null,
    value: txJSON.value!,
    v: txJSON.v!,
    r: txJSON.r!,
    s: txJSON.s!,
  };
}

export function toJSONRPCBlock(
  block: Block,
  totalDifficulty: bigint,
  uncleHeaderHashes: Buffer[],
  includeTransactions: boolean,
): JSONRPCBlock {
  const json = block.toJSON();
  const header = json!.header!;
  const transactions = block.transactions.map((tx, txIndex) =>
    includeTransactions
      ? toJSONRPCTx(tx, block, txIndex)
      : bytesToHex(tx.hash()),
  );
  return {
    number: header.number!,
    hash: bytesToHex(block.hash()),
    parentHash: header.parentHash!,
    mixHash: header.mixHash,
    nonce: header.nonce!,
    sha3Uncles: header.uncleHash!,
    logsBloom: header.logsBloom!,
    transactionsRoot: header.transactionsTrie!,
    stateRoot: header.stateRoot!,
    receiptsRoot: header.receiptTrie!,
    miner: header.coinbase!,
    difficulty: header.difficulty!,
    totalDifficulty: bigIntToHex(totalDifficulty),
    extraData: header.extraData!,
    size: intToHex(Buffer.byteLength(JSON.stringify(json))),
    gasLimit: header.gasLimit!,
    gasUsed: header.gasUsed!,
    timestamp: header.timestamp!,
    transactions,
    uncles: uncleHeaderHashes.map(bytesToHex),
    baseFeePerGas: header.baseFeePerGas,
  };
}

export function txReceiptFromJSONRPCReceipt(
  receipt: JSONRPCReceipt,
): TxReceipt {
  // Transform logs
  const logs: Log[] = receipt.logs.map(log => [
    hexToBytes(log.address),
    log.topics.map(topic => hexToBytes(topic)),
    hexToBytes(log.data),
  ]);

  // Base receipt fields
  const baseReceipt = {
    cumulativeBlockGasUsed: BigInt(receipt.cumulativeGasUsed),
    bitvector: hexToBytes(receipt.logsBloom),
    logs,
  };

  // Determine the type of receipt
  if (receipt.root) {
    // Pre-Byzantium receipt
    const preByzantiumReceipt: PreByzantiumTxReceipt = {
      ...baseReceipt,
      stateRoot: hexToBytes(receipt.root),
    };
    return preByzantiumReceipt;
  } else if (receipt.status !== undefined) {
    // Post-Byzantium receipt
    const postByzantiumReceipt: PostByzantiumTxReceipt = {
      ...baseReceipt,
      status: parseInt(receipt.status, 16) as 0 | 1,
    };
    return postByzantiumReceipt;
  } else {
    throw new Error('Unsupported receipt type');
  }
}
