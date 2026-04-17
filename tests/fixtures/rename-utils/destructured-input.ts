import { ethers, Contract } from 'ethers';

const parsed = ethers.parseEther('1.0');
const formatted = ethers.formatEther(parsed);
const hash = ethers.keccak256(data);
const arr = ethers.getBytes(hex);
const padded = ethers.zeroPadValue(hex, 32);
const sig = ethers.Signature.from(sigData);
const coder = ethers.AbiCoder.defaultAbiCoder();

const contract = new Contract(addr, abi, signer);
