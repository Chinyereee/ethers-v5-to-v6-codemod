import * as ethers from 'ethers';

async function example(provider: any) {
  const gas = await provider.getGasPrice();

  const txOpts = {
    to: recipient,
    value: amount,
    gasPrice: await provider.getGasPrice(),
  };

  const gasFromSigner = await provider.getGasPrice();

  const noAwait = provider.getGasPrice();

  let feeData: ethers.providers.FeeData;
}
