import { rpc } from "../solana/rpc";
import { createRpcChainReader, type ChainReader } from "./chain";

/**
 * The one-line bridge between the RPC client and the reconciler.
 *
 * Both have existed for a while and have never been connected, which is why the
 * reconciler has only ever run against a fake chain. This is that connection.
 */
export const chain: ChainReader = createRpcChainReader(rpc);
