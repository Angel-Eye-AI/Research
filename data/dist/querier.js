import { ethers } from 'ethers';
import * as fs from 'fs';
import { ApolloClient, HttpLink, InMemoryCache, gql } from '@apollo/client/core';
import fetch from 'cross-fetch';
const client = new ApolloClient({
    link: new HttpLink({
        uri: 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v2-dev',
        fetch,
    }),
    cache: new InMemoryCache(),
});
// WETH (wrapped ether) address. if the token is paired with a stablecoin we don't want to deal with it.
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const JSON_RPC_URL = 'https://eth.llamarpc.com';
const UNISWAP_V2_FACTORY_ABI = [
    'function getPair(address tokenA, address tokenB) external view returns (address pair)',
];
const UNISWAP_V3_FACTORY_ABI = [
    'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)', // Only for V3 Factory
];
const UNISWAP_V2_FACTORY_ADDRESS = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
const UNISWAP_V3_FACTORY_ADDRESS = "0x1f98431c8ad98523631ae4a59f267346ea31f984";
const FEE_TIERS = [10000, 3000, 500, 100]; //https://ethereum.stackexchange.com/questions/107853/uniswap-v3-pools-list
//const INPUT_FILE_PATH = './ethereum_addresses.txt';  // input file path. Replace with your actual path.
//const OUTPUT_FILE_PATH = './output.json';   // output file path. Replace with your actual path.
const INPUT_FILE_PATH = './ethereum_addresses.txt'; // input file path. Replace with your actual path.
const OUTPUT_FILE_PATH = './output_http.json'; // output file path. Replace with your actual path.
const provider = new ethers.providers.JsonRpcProvider(JSON_RPC_URL);
async function getPairAddress(tokenAddress, wethAddress, provider) {
    const factoryV2 = new ethers.Contract(UNISWAP_V2_FACTORY_ADDRESS, UNISWAP_V2_FACTORY_ABI, provider);
    const factoryV3 = new ethers.Contract(UNISWAP_V3_FACTORY_ADDRESS, UNISWAP_V3_FACTORY_ABI, provider);
    /*
    let version = 3;
    let pairAddress = ethers.constants.AddressZero

    // Iterate through all possible Uniswap V3 fee tiers
    // Unfortunatly we have to do this first. people tend to make small v2 pools for big v3 tokens. its fairly quick anyway
    for (const fee of FEE_TIERS) {
        pairAddress = await factoryV3.getPool(tokenAddress, wethAddress, fee);  // Adjust the fee tier as necessary
        if (pairAddress !== ethers.constants.AddressZero) {
            return [pairAddress, version];
        }
    }
    */
    //FIXME: uncomment if we want to waste time on v3
    const pairAddress = await factoryV2.getPair(tokenAddress, wethAddress);
    const version = 2;
    // If no pair address exists, throw an error
    if (pairAddress === ethers.constants.AddressZero) {
        throw new Error(`No pair exists for token address: ${tokenAddress}`);
    }
    return [pairAddress, version];
}
async function processAddresses(useHTTP = false) {
    const inputFilePath = INPUT_FILE_PATH; // input file path. Replace with your actual path.
    const outputFilePath = OUTPUT_FILE_PATH; // output file path. Replace with your actual path.
    const wethAddress = WETH_ADDRESS; // replace with actual WETH address.
    const addresses = fs.readFileSync(inputFilePath, 'utf-8').split('\n').filter(Boolean); // read addresses from file.
    //TODO: uncomment
    //fs.appendFileSync(outputFilePath, "[");
    for (const address of addresses) {
        try {
            let data;
            if (useHTTP) {
                const pairAddress = await getPairAddressHTTP(address); // get pair address and version.
                data = {
                    contractAddress: address,
                    pairAddress,
                    version: 2
                };
                // append result to output file.
                if (pairAddress) {
                    fs.appendFileSync(outputFilePath, JSON.stringify(data) + ',\n');
                }
                else {
                    console.log('Uniswap Failed to get pair for address:', address, ' time: ', new Date().toISOString());
                }
            }
            else {
                const [pairAddress, version] = await getPairAddress(address, wethAddress, provider); // get pair address and version.
                data = {
                    contractAddress: address,
                    pairAddress,
                    version
                };
                // append result to output file.
                fs.appendFileSync(outputFilePath, JSON.stringify(data) + ',\n');
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
async function tryFetchPairAddress(token1, token2) {
    const GET_PAIR_ADDRESS_QUERY = gql `
    query GetPairAddress($token0: String!, $token1: String!) {
        pairs(where: { token0: $token0, token1: $token1 }) {
            id
        }
    }
    `;
    try {
        const { data } = await client.query({
            query: GET_PAIR_ADDRESS_QUERY,
            variables: { token0: token1, token1: token2 },
        });
        // If there are no pairs, return null.
        if (data.pairs.length === 0) {
            return null;
        }
        // Otherwise, return the id of the first pair.
        return data.pairs[0].id;
    }
    catch (error) {
        console.log('Error:', error);
        return null;
    }
}
async function getPairAddressHTTP(tokenAddress) {
    const wethAddress = WETH_ADDRESS;
    let result = await tryFetchPairAddress(tokenAddress, wethAddress);
    //if (result && result?.data.pairs.length > 0) {
    if (result) {
        return result;
    }
    // Try the reverse pair
    result = await tryFetchPairAddress(wethAddress, tokenAddress);
    //if (result && result?.data.pairs.length > 0) {
    //return result.data.pairs[0].id;
    if (result) {
        return result;
    }
    return null;
}
(async () => {
    try {
        //test code should be moved to a test file
        /*
        const pepe2pair = await getPairAddress("0xfb66321d7c674995dfcc2cb67a30bc978dc862ad", WETH_ADDRESS, provider);
        const pepepair = await getPairAddress("0x6982508145454ce325ddbe47a25d4ec3d2311933", WETH_ADDRESS, provider);
        const refundPair = await getPairAddress("0x955d5c14c8d4944da1ea7836bd44d54a8ec35ba1", WETH_ADDRESS, provider);
        const thugPair = await getPairAddress("0xce9de5365739b1bed5c8546867aee4209fbb8538", WETH_ADDRESS, provider);
        const flappyPair = await getPairAddress("0xb577a36a6a7e39fb40032efe363b6add0c29b941", WETH_ADDRESS, provider);

        console.log("pepe 2.0 pair address: " + pepe2pair[0] + " version: " + pepe2pair[1]);
        console.log("pepe pair address: " + pepepair[0] + " version: " + pepepair[1]);
        console.log("refund pair address: " + refundPair[0] + " version: " + refundPair[1]);
        console.log("thug pair address: " + thugPair[0] + " version: " + thugPair[1]);
        console.log("flappy pair address: " + flappyPair[0] + " version: " + flappyPair[1]);
        */
        //removeDuplicates();
        //await processAddresses(true);
        //Tests for gets pairs from uniswap subgraph
        console.log(JSON.stringify(await tryFetchPairAddress(WETH_ADDRESS, "0xfb243bc5e98286e8560f17c3f6b48203afe43139")));
    }
    catch (error) {
        console.error(`top level error ${error}`);
    }
})();
//# sourceMappingURL=querier.js.map