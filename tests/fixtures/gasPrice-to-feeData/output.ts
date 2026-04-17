import * as ethers from 'ethers';

async function example(provider: ethers.providers.Provider, signer: ethers.Signer) {
  const gas = (await provider.getFeeData()).gasPrice;

  const tx = await signer.sendTransaction({
    to: recipient,
    value: amount,
    gasPrice: (await provider.getFeeData()).gasPrice,
  });

  const gasFromSigner = (await signer.getFeeData()).gasPrice;

  // TODO: ethers v6 - replace getGasPrice() with getFeeData() and access .gasPrice, .maxFeePerGas, or .maxPriorityFeePerGas
  const noAwait = provider.getGasPrice();

  let feeData: ethers.FeeData;
}
