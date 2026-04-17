import * as ethers from 'ethers';

const web3Provider = new ethers.BrowserProvider(window.ethereum);
const jsonRpc = new ethers.JsonRpcProvider('https://mainnet.infura.io');
const ws = new ethers.WebSocketProvider('wss://mainnet.infura.io/ws');
const fallback = new ethers.FallbackProvider([web3Provider, jsonRpc]);
const staticRpc = new ethers.JsonRpcProvider('https://mainnet.infura.io');
const alchemy = new ethers.AlchemyProvider('mainnet', apiKey);
const infura = new ethers.InfuraProvider('mainnet', projectId);

let typed: ethers.BrowserProvider;
let typed2: ethers.JsonRpcProvider;
