#!/usr/bin/env node

'use strict';

var fs = require('fs');

var ethers = require('ethers');
var getopts = require('ethers-cli/lib/getopts');

var AirDrop = require('..');
var version = require('../package.json').version;

var options = {
    balances: 'airdrop-balances.json',
    premine: '0',

    help: false,
    version: false,

    _accounts: true,
    _provider: true,
    _promises: true,
};

getopts(options).then(function(opts) {
    if (opts.options.help) { getopts.throwError(); }

    if (opts.options.version) {
        console.log('ethers-airdrop/' + version);
        return function() { }
    }

    var airDrop = new AirDrop(JSON.parse(fs.readFileSync(opts.options.balances)), opts.options.account);
    console.log('Loaded Air Drop Balances.');

    if (opts.args.length === 0) { getopts.throwError('no command provided'); }

    var command = opts.args.shift();

    switch (command) {

        case 'deploy': return (function() {
            if (opts.args.length === 3) {
                var decimals = parseInt(opts.args.pop());
            }
            if (opts.args.length !== 2) {
                getopts.throwError('deploy requires TITLE, SYMBOL');
            }
            var title = opts.args.shift();
            var symbol = opts.args.shift();
            var premine = ethers.utils.parseUnits(opts.options.premine, 18);
            if (opts.accounts.length !== 1) {
                getopts.throwError('deploy requires --account');
            }
            return (function() {
                return airDrop.deploy(opts.accounts[0], title, symbol, decimals, premine).then(function(tx) {
                    console.log(tx);
                    console.log('Deployed:');
                    console.log('  Transaction:      ' + tx.hash);
                    console.log('  Contract Address: ' + tx.contractAddress);
                    console.log('');
                });
            });
        })();

        case 'redeem': return (function() {
            if (opts.args.length !== 2) { throw new Error('redeem requires CONTRACT_ADDRESS and INDEX_OR_ADDRESS'); }
            var contractAddress = opts.args.shift();
            var index = opts.args.shift();
            if (!index.match(/^[0-9]+$/)) {
                index = airDrop.getIndex(ethers.utils.getAddress(index));
            } else {
                var index = parseInt(index);
            }
            return (function() {
                return airDrop.redeem(opts.accounts[0], contractAddress, index).then(function(tx) {
                    console.log('Redeem: (Contract: ' + contractAddress + ')');
                    console.log('  Transaction:    ' + tx.hash);
                    console.log('');
                });
            });
        })();

        case 'lookup': return (function() {
            if (opts.args.length !== 2) { throw new Error('lookup requires CONTRACT_ADDRESS and INDEX_OR_ADDRESS'); }
            var contractAddress = opts.args.shift();
            var index = opts.args.shift();
            if (!index.match(/^[0-9]+$/)) {
                index = airDrop.getIndex(ethers.utils.getAddress(index));
            }
            return (function() {
                var address = airDrop.getAddress(index);
                return Promise.all([
                    airDrop.getRedeemed(opts.provider, contractAddress, index),
                    airDrop.getInfo(opts.provider, contractAddress),
                    airDrop.getBalance(opts.provider, contractAddress, address)
                ]).then(function(result) {
                    console.log('Lookup: (Contract: ' + contractAddress + ')');
                    console.log('  Address:      ' + address);
                    console.log('  Index:        ' + index);
                    console.log('  Name:         ' + result[1].name);
                    console.log('  Symbol:       ' + result[1].symbol);
                    console.log('  Decimals:     ' + result[1].decimals);
                    console.log('  Total Supply: ' + ethers.utils.formatUnits(result[1].totalSupply, result[1].decimals));
                    console.log('  Amount:       ' + ethers.utils.formatUnits(airDrop.getAmount(index), result[1].decimals));
                    console.log('  Balance:      ' + ethers.utils.formatUnits(result[2], result[1].decimals));
                    console.log('  Redeemed:     ' + (result[0] ? 'yes': 'no'));
                    console.log('');
                });
            });
        })();

        default:
            getopts.throwError('unknown command: ' + command);
    }

}).then(function(run) {
    return run();

}, function(error) {
    console.log('');
    console.log('Command Line Interface - ethers-airdrop/' + version);
    console.log('');
    console.log('Usage:');
    console.log('    ethers-airdrop deploy TITLE SYMBOL [ DECIMALS ] --account ACCOUNT');
    console.log('    ethers-airdrop redeem CONTRACT_ADDRESS INDEX --account ACCOUNT');
    console.log('    ethers-airdrop lookup CONTRACT_ADDRESS INDEX_OR_ADDRESS');
    console.log('');
    console.log('Options:');
    console.log('  --balances      AirDrop Balance Data (default: ./airdrop-balances.json)');
    console.log('');

    if (error.message) { throw error; }
    console.log('');

}).catch(function(error) {
    console.log('');
    if (!error._messageOnly) {
        console.log(error.stack);
    } else {
        console.log('Error: ' + error.message);
    }
    console.log('');
});
