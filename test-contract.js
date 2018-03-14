'use strict';

var assert = require('assert');

var ethers = require('ethers');
var tools = require('ethers-cli');

// Obviously a lot more is needed here; like transfer, et cetera.

var AirDrop = require('./index');

function balanceOfIndex(index) {
    return ethers.utils.parseUnits(String(1 + 10 * index), 18);
}

function deployAirDrop(count) {

    // Construct a new test builder
    var builder = new tools.TestBuilder(function(builder) {
        var balances = {};
        for (var i = 0; i < count; i++) {
            balances[builder.accounts[i].address] = balanceOfIndex(i);
        }

        var airDrop = new AirDrop(balances);

        var codes = builder.compile('./AirDropToken.sol', true);

        var airDropTokenCode = codes.AirDropToken;

        return airDropTokenCode.deploy('Air Drop Token', 'ADT', 18, airDrop.rootHash, 10).then(function(contract) {
            return {
                airDrop: airDrop,
                builder: builder,
                contract: contract
            };
        });
    });

    // Deploy the contract into this builder
    return builder.deploy();
}


describe('Basic Tests', function() {
    it('correctly deploys', function() {
        this.timeout(120000);

        return deployAirDrop(8).then(function(deployed) {
            var builder = deployed.builder;

            var tokenAdmin = deployed.contract;

            var tokenReadOnly = tokenAdmin.connect(builder.provider);

            return Promise.all([
                tokenReadOnly.balanceOf(builder.accounts[0].address),
                tokenReadOnly.balanceOf(builder.accounts[1].address),
                tokenReadOnly.name(),
                tokenReadOnly.symbol(),
                tokenReadOnly.decimals(),
                tokenReadOnly.totalSupply(),
            ]).then(function(result) {
                assert.equal(result[0].toNumber(), 10, 'premined balance assigned')
                assert.equal(result[1].toNumber(), 0, 'other balance is empty')
                assert.equal(result[2], 'Air Drop Token', 'name is correct')
                assert.equal(result[3], 'ADT', 'symbol is correct')
                assert.equal(result[4], 18, 'decimals is correct')
                assert.equal(result[5].toNumber(), 10, 'total suppl is correct')
            });
        });
    });

    function testRedeem(index, count) {
        return deployAirDrop(8).then(function(deployed) {
            var builder = deployed.builder;

            var airDrop = builder.deployed.airDrop;

            var user = builder.accounts[1];
            var index = airDrop.getIndex(user.address);;
            var amount = balanceOfIndex(1);

            var tokenAdmin = builder.deployed.contract;
            var tokenReadOnly = tokenAdmin.connect(builder.provider);
            var tokenOtherUser = tokenAdmin.connect(builder.accounts[2]);

            var proof = airDrop.getMerkleProof(index);

            var seq = Promise.resolve();

            seq = seq.then(function() {
                return tokenReadOnly.balanceOf(user.address).then(function(balance) {
                    assert.equal(balance.toNumber(), 0, 'initial balance is zero');
                });
            });

            seq = seq.then(function() {
                return tokenOtherUser.redeemPackage(index, user.address, amount, proof).then(function(tx) {
                    console.log(tx);
                });
            });

            seq = seq.then(function() {
                return tokenReadOnly.balanceOf(user.address).then(function(balance) {
                    assert.ok(balance.eq(amount), 'final balance is correct');
                });
            });
/*
            seq = seq.then(function() {
                return tokenOtherUser.redeemPackage(index, user.address, amount, proof).then(function(tx) {
                    assert.ok(false, 'duplicate redeem did not fail');
                }, function(error) {
                    assert.ok(true, 'duplicate redeem failed');
                });
            });
*/
            return seq;
        });
    }

    [1, 2, 3, 4, 5, 7, 8, 9, 15, 16, 17].forEach(function(count) {
        for (var i = 0; i < count; i++) {
            (function(index) {
                it('allows a user index ' + index + ' to redeem a token pacakge from count ' + count, function() {
                    this.timeout(120000);
                    return testRedeem(index, count);
                });
            })(i);
        }
    });

});
