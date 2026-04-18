import * as ethers from 'ethers';

async function example(provider: any) {
  const gas = (await provider.getFeeData()).gasPrice;

  const txOpts = {
    to: recipient,
    value: amount,
    gasPrice: (await provider.getFeeData()).gasPrice,
  };

  const gasFromSigner = (await provider.getFeeData()).gasPrice;

  // TODO: ethers v6 - replace getGasPrice() with getFeeData() and access .gasPrice, .maxFeePerGas, or .maxPriorityFeePerGas
  const noAwait = provider.getGasPrice();

  let feeData: ethers.FeeData;
}
