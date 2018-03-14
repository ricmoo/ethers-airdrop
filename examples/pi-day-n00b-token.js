'use strict';

var fs = require('fs');

var ethers = require('ethers');

var convert = require('ethers/utils/convert');
function getBlockNumber(blockNumber) {
    return convert.hexStripZeros(convert.hexlify(blockNumber));
}

function now() {
    return (new Date()).getTime() / 1000;
}

var total = ethers.utils.bigNumberify(0);
var provider = new ethers.providers.JsonRpcProvider();
var balances = {};

function getBalances(startBlockNumber, count) {
    var t0 = now();
    function check(blockNumber) {
        console.log(blockNumber);
        provider.send('eth_getBlockByNumber', [getBlockNumber(blockNumber), true]).then(function(block) {
            block.transactions.forEach(function(tx) {
                if (tx.nonce !== '0x0') { return; }
                if (!balances[tx.from]) {
                    balances[tx.from] = ethers.utils.bigNumberify(tx.value);
                } else {
                    console.log('This should not happen...');
                    balances[tx.from].add(tx.value);
                }
                total = total.add(tx.value);
            });

            if (Object.keys(balances).length > count) {
               Object.keys(balances).forEach(function(a) {
                   balances[a] = balances[a].toHexString();
               });
               console.log({
                   blocks: startBlockNumber - blockNumber,
                   dt: now() - t0,
                   accounts: Object.keys(balances).length,
                   total: ethers.utils.formatUnits(total, 18)
               });
               fs.writeFileSync('airdrop-balances.json', JSON.stringify(balances));
            } else {
                setTimeout(function() { check(blockNumber - 1, count); }, 0);
            }
        });
    }
    check(startBlockNumber);
}

var firstPiDayBlock = 5251718;
getBalances(firstPiDayBlock, 10000);
/*
provider.getBlockNumber().then(function(blockNumber) {
    getBalances(blockNumber, 10000);
});
*/
