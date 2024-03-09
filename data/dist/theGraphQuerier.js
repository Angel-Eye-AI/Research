// Important: Thins only works for uniswap v2 tokens
import { request, gql } from 'graphql-request';
import * as fs from 'fs';
import { ethers } from 'ethers';
const INPUT_FILE_PATH = './ethereum_addresses_for_uniswap.txt'; // input file path. Replace with your actual path.
const OUTPUT_FILE_PATH = './output_http.json'; // output file path. Replace with your actual path.
const UNISWAP_V2_SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v2-dev';
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const JSON_RPC_URL = 'https://eth.llamarpc.com';
const provider = new ethers.providers.JsonRpcProvider(JSON_RPC_URL);
const tryFetchPairAddress = async (token0, token1) => {
    const query = gql `
    query getPairs($token0: Bytes!, $token1: Bytes!) {
      pairs(where: { token0: $token0, token1: $token1 }) {
        id
      }
    }
  `;
    const variables = {
        token0: token0.toLowerCase(),
        token1: token1.toLowerCase(),
    };
    try {
        const data = await request(UNISWAP_V2_SUBGRAPH_URL, query, variables);
        return data.pairs.length > 0 ? data.pairs[0].id : null;
    }
    catch (error) {
        console.error(JSON.stringify(error, undefined, 2));
        return null;
    }
};
const isV2Pair = async (address) => {
    // ABI definition of the UniswapV2Pair contract
    const abi = ['function name() view returns (string)'];
    // Create a Contract instance for the given address
    const contract = new ethers.Contract(address, abi, provider);
    // Call the name() method
    const name = await contract.name();
    // Check if the returned name matches the expected name of Uniswap V2 pairs
    return name === 'Uniswap V2';
};
//grabs the pair address regardless of token order in the pair
async function getPairAddress(token0, token1) {
    let result = await tryFetchPairAddress(token0, token1);
    if (result) {
        return result;
    }
    // Try the reverse pair
    result = await tryFetchPairAddress(token1, token0);
    if (result) {
        return result;
    }
    return null;
}
const getNonWETHTokenAddress = async (pairAddress) => {
    // ABI definition of the UniswapV2Pair contract
    const abi = ['function token0() view returns (address)', 'function token1() view returns (address)'];
    // Create a Contract instance for the given pair address
    const pairContract = new ethers.Contract(pairAddress, abi, provider);
    // Call the token0() and token1() methods to get the token addresses
    const [token0Address, token1Address] = await Promise.all([
        pairContract.token0(),
        pairContract.token1(),
    ]);
    // Check if either token is WETH
    const isToken0WETH = ethers.utils.getAddress(token0Address).toLowerCase() === WETH_ADDRESS.toLowerCase();
    const isToken1WETH = ethers.utils.getAddress(token1Address).toLowerCase() === WETH_ADDRESS.toLowerCase();
    // Return the non-WETH token address or null if both tokens are WETH
    if (!isToken0WETH) {
        return token0Address;
    }
    else if (!isToken1WETH) {
        return token1Address;
    }
    else {
        return null;
    }
};
async function processAddresses() {
    const inputFilePath = INPUT_FILE_PATH; // input file path. Replace with your actual path.
    const outputFilePath = OUTPUT_FILE_PATH; // output file path. Replace with your actual path.
    const addresses = fs.readFileSync(inputFilePath, 'utf-8').split('\n').filter(Boolean); // read addresses from file.
    fs.appendFileSync(outputFilePath, "[");
    for (const address of addresses) {
        try {
            let pairAddress = null;
            let contractAddress = null;
            if (await isV2Pair(address)) {
                pairAddress = address;
                contractAddress = await getNonWETHTokenAddress(address);
            }
            else {
                pairAddress = await getPairAddress(ethers.utils.getAddress(address), WETH_ADDRESS); // get pair address and version.
                contractAddress = address;
            }
            const data = {
                contractAddress,
                pairAddress,
                version: 2
            };
            // append result to output file.
            if (pairAddress && contractAddress) {
                fs.appendFileSync(outputFilePath, JSON.stringify(data) + ',\n');
            }
            else {
                console.log('Uniswap Failed to get pair for address:', address, ' time: ', new Date().toISOString());
            }
            //wait 500ms to avoid rate limiting
            await new Promise(r => setTimeout(r, 500));
        }
        catch (err) {
            console.error('Failed to get pair for address:', address, ' time: ', new Date().toISOString());
            //wait 500ms to avoid rate limiting
            await new Promise(r => setTimeout(r, 500));
            continue; // skip this address and continue with next.
        }
    }
    fs.appendFileSync(outputFilePath, "]");
    console.log('Finished processing all addresses.');
}
function removeDuplicates() {
    const filePath = INPUT_FILE_PATH; // file path. Replace with your actual path.
    const addresses = new Set(fs.readFileSync(filePath, 'utf-8')
        .toLowerCase()
        .split('\n')
        .filter(Boolean));
    fs.writeFileSync(filePath, Array.from(addresses).join('\n'));
    console.log('Removed duplicates from the address file');
}
(async () => {
    //removeDuplicates();
    /*
    console.log(await getPairAddress(atoken0, atoken1));
    console.log(await getPairAddress(atoken1, atoken0));
    console.log(
        await tryFetchPairAddress(atoken0, atoken1)
    )
    console.log(
        await tryFetchPairAddress(atoken1, atoken0)
    )
    */
    await processAddresses();
})();
//# sourceMappingURL=theGraphQuerier.js.map