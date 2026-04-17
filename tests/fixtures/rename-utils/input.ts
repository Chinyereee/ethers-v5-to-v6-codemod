import * as ethers from 'ethers';

const parsed = ethers.parseEther('1.0');
const formatted = ethers.formatEther(parsed);
const parsedUnits = ethers.parseUnits('1.0', 18);
const formattedUnits = ethers.formatUnits(parsedUnits, 18);
const hash = ethers.keccak256(data);
const sha = ethers.sha256(data);
const bytes = ethers.toUtf8Bytes('hello');
const str = ethers.toUtf8String(bytes);
const hex = ethers.hexlify(bytes);
const arr = ethers.getBytes(hex);
const padded = ethers.zeroPadValue(hex, 32);
const padded2 = ethers.zeroPadBytes(arr, 32);
const valid = ethers.isAddress(addr);
const checksummed = ethers.getAddress(addr);
const topic = ethers.id('Transfer(address,address,uint256)');
const sig = ethers.Signature.from(sigData);
const coder = ethers.AbiCoder.defaultAbiCoder();
