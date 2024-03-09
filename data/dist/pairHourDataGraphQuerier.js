import { request, gql } from 'graphql-request';
import { InfluxDB, Point } from '@influxdata/influxdb-client';
import * as fs from 'fs';
const UNISWAP_V2_SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v2-dev';
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".toLowerCase();
const OUTPUT_CSV = "./output.csv";
//influx setup
const token = INFLUXDB_TOKEN; //why do I have to make this assignment???
const url = 'http://localhost:8086';
const org = `token`;
const bucket = `token_prices`;
const client = new InfluxDB({ url, token });
const writeClient = client.getWriteApi(org, bucket, 'ns');
function getCSVHeader() {
    return "hourStartUnix,pairAddress,reserve0,reserve1,reserveUSD,hourlyVolumeToken0,hourlyVolumeToken1,hourlyVolumeUSD,hourlyTxns,price";
}
async function writeCSVLine(pairAddress, hourStartUnix, reserve0, reserve1, reserveUSD, hourlyVolumeToken0, hourlyVolumeToken1, hourlyVolumeUSD, hourlyTxns, price) {
    console.log(`${hourStartUnix},${pairAddress},${reserve0},${reserve1},${reserveUSD},${hourlyVolumeToken0},${hourlyVolumeToken1},${hourlyVolumeUSD},${hourlyTxns},${price}`);
    fs.appendFileSync(OUTPUT_CSV, `${hourStartUnix},${pairAddress},${reserve0},${reserve1},${reserveUSD},${hourlyVolumeToken0},${hourlyVolumeToken1},${hourlyVolumeUSD},${hourlyTxns},${price}\n`);
}
async function writeData(pairAddress, reserve0, reserve1, reserveUSD, hourlyVolumeToken0, hourlyVolumeToken1, hourlyVolumeUSD, hourlyTxns, price) {
    try {
        let point = new Point('Pair_Data')
            .tag('pairAddress', pairAddress)
            .floatField('reserve0', reserve0)
            .floatField('reserve1', reserve1)
            .floatField('reserveUSD', reserveUSD)
            .floatField('hourlyVolumeToken0', hourlyVolumeToken0)
            .floatField('hourlyVolumeToken1', hourlyVolumeToken1)
            .floatField('hourlyVolumeUSD', hourlyVolumeUSD)
            .floatField('hourlyTxns', hourlyTxns)
            .floatField('price', price);
        await writeClient.writePoint(point);
        await writeClient.flush();
    }
    catch (err) {
        console.error(`Error saving data to InfluxDB! ${err.stack}`);
    }
}
const GET_PAIR_DATA = gql `
  query GetPairData($pairAddress: ID!) {
    pairHourDatas(first: 100, orderBy: hourStartUnix, where: { pair: $pairAddress }) {
      id
      hourStartUnix
      pair {
        id
        token0 {
          id
          symbol
          name
        }
        token1 {
          id
          symbol
          name
        }
      }
      reserve0
      reserve1
      reserveUSD
      hourlyVolumeToken0
      hourlyVolumeToken1
      hourlyVolumeUSD
      hourlyTxns
    }
  }
`;
async function fetchData(pairAddress) {
    try {
        const data = await request(UNISWAP_V2_SUBGRAPH_URL, GET_PAIR_DATA, { pairAddress });
        for (const pairHourData of data.pairHourDatas) {
            const { hourStartUnix, pair, reserve0, reserve1, token1, token0, reserveUSD, hourlyVolumeToken0, hourlyVolumeToken1, hourlyVolumeUSD, hourlyTxns } = pairHourData;
            const wethIsToken0 = pair.token0.id.toLowerCase() === WETH_ADDRESS;
            const nonWethToken = wethIsToken0 ? pair.token1 : pair.token0;
            const nonWethTokenPriceInWeth = wethIsToken0 ? reserve0 / reserve1 : reserve1 / reserve0;
            //because weth is not always token0 or token1, i worry this will fuck with the data when it comes to everything ML
            if (wethIsToken0) {
                //await writeData(
                await writeCSVLine(pairAddress, hourStartUnix, reserve0, //always put weth token data in token0 spor
                reserve1, //reversed below
                reserveUSD, hourlyVolumeToken0, //reversed below
                hourlyVolumeToken1, //reversed below
                hourlyVolumeUSD, hourlyTxns, nonWethTokenPriceInWeth);
            }
            else {
                //await writeData(
                await writeCSVLine(pairAddress, hourStartUnix, reserve1, //always put weth token data in token0 spor
                reserve0, reserveUSD, hourlyVolumeToken1, hourlyVolumeToken0, hourlyVolumeUSD, hourlyTxns, nonWethTokenPriceInWeth);
            }
            //console.log(`\tPrice of ${nonWethToken.symbol} in WETH: ${nonWethTokenPriceInWeth.toFixed(18)}`);
        }
    }
    catch (error) {
        console.error("Error writing data: " + error);
    }
}
async function main() {
    //open output json file and grab all of the pair addresses then loop through them
    const data = fs.readFileSync('./output_http.json', 'utf8');
    const pairAddressArray = JSON.parse(data);
    let i = 1;
    console.log(getCSVHeader());
    fs.appendFileSync(OUTPUT_CSV, getCSVHeader() + "\n");
    for (const pair of pairAddressArray) {
        await fetchData(pair.pairAddress);
        console.log(`Finished fetching data for pair(${pair.pairAddress}) ${i}`);
        i++;
    }
}
console.log("Starting...");
main();
//# sourceMappingURL=pairHourDataGraphQuerier.js.map