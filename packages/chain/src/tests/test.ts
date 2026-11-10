import { createBaseSepoliaClient } from "../index";

const client = createBaseSepoliaClient();
const blockNumber = await client.getBlockNumber();

console.log(typeof blockNumber);
console.log(blockNumber);
