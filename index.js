'use strict';

var fs = require('fs');
var path = require('path');

var solc = null;

var ethers = require('ethers');

function compile(sourceCode) {
    if (!solc) { solc = require('solc'); }
    var contracts = solc.compile(sourceCode, 1)
    return contracts;
}

var abiFragment = [
    {
        inputs: [
            { name: 'name', type: 'string' },
            { name: 'symbol', type: 'string' },
            { name: 'decimals', type: 'uint8' },
            { name: 'rootHash', type: 'bytes32' },
            { name: 'premine', type: 'uint256' },
        ],
        outputs: [],
        payable: false,
        type: 'constructor'
    },
    {
        name: 'redeemed',
        inputs: [
            { name: 'index', type: 'uint256' }
        ],
        outputs: [
            { name: 'redeemed', type: 'bool' }
        ],
        constant: true,
        type: 'function'
    },
    {
        name: 'name',
        inputs: [],
        outputs: [
            { name: 'name', type: 'string' }
        ],
        constant: true,
        type: 'function'
    },
    {
        name: 'symbol',
        inputs: [],
        outputs: [
            { name: 'symbol', type: 'string' }
        ],
        constant: true,
        type: 'function'
    },
    {
        name: 'decimals',
        inputs: [],
        outputs: [
            { name: 'decimals', type: 'uint8' }
        ],
        constant: true,
        type: 'function'
    },
    {
        name: 'totalSupply',
        inputs: [],
        outputs: [
            { name: 'totalSupply', type: 'uint256' }
        ],
        constant: true,
        type: 'function'
    },
    {
        name: 'balanceOf',
        inputs: [
            { name: 'owner', type: 'address' }
        ],
        outputs: [
            { name: 'balance', type: 'uint256' }
        ],
        constant: true,
        type: 'function'
    },
    {
        name: 'redeemPackage',
        inputs: [
            { name: 'index', type: 'uint256' },
            { name: 'recipient', type: 'address' },
            { name: 'amount', type: 'uint256' },
            { name: 'proof', type: 'bytes32[]' }
        ],
        outputs: [],
        payable: false,
        constant: false,
        type: 'function'
    }
];

function reduceMerkleBranches(leaves) {
    var output = [];

    while (leaves.length) {
        var left = leaves.shift();
        var right = (leaves.length === 0) ? left: leaves.shift();
        //output.push(ethers.utils.keccak256(ethers.utils.concat([ left, right ])));
        output.push(ethers.utils.keccak256(left + right.substring(2)));
    }

    output.forEach(function(leaf) {
        leaves.push(leaf);
    });
}

var t0 = (new Date()).getTime()
function now() {
    return (new Date()).getTime() - t0;
}

function expandLeaves(balances) {
    var addresses = Object.keys(balances);

    addresses.sort(function(a, b) {
        var al = a.toLowerCase(), bl = b.toLowerCase();
        if (al < bl) { return -1; }
        if (al > bl) { return 1; }
        return 0;
    });

    return addresses.map(function(a, i) { return { address: a, balance: balances[a], index: i }; });
}

// ethers.utils.solidityKeccak256(types, [ leaf.index, leaf.address, leaf.balance ]);
var zeros32 = '0000000000000000000000000000000000000000000000000000000000000000';
function hash(index, address, balance) {
    index = zeros32 + (index).toString(16);
    index = index.substring(index.length - 64);
    address = address.substring(2)
    balance = zeros32 + balance.substring(2);
    balance = balance.substring(balance.length - 64);
    return ethers.utils.keccak256('0x' + index + address + balance);
}

function getLeaves(balances) {
    var leaves = expandLeaves(balances);

    return leaves.map(function(leaf) {
        return hash(leaf.index, leaf.address, leaf.balance);
    });
}

function computeRootHash(balances) {
    var leaves = getLeaves(balances);

    while (leaves.length > 1) {
        reduceMerkleBranches(leaves);
    }

    return leaves[0];
}

function computeMerkleProof(balances, index) {
    var leaves = getLeaves(balances);

    if (index == null) { throw new Error('address not found'); }

    var path = index;

    var proof = [ ];
    while (leaves.length > 1) {
        if ((path % 2) == 1) {
            proof.push(leaves[path - 1])
        } else {
            proof.push(leaves[path + 1])
        }

        // Reduce the merkle tree one level
        reduceMerkleBranches(leaves);

        // Move up
        path = parseInt(path / 2);
    }

    return proof;
}

function AirDrop(balances) {
    if (!(this instanceof AirDrop)) { throw new Error('missing new') ;}

    this.balances = balances;

    var rootHash = null;
    Object.defineProperty(this, 'rootHash', {
        get: function() {
            if (rootHash == null) {
                rootHash = computeRootHash(balances);
            }
            return rootHash;
        }
    });
        
}

AirDrop.prototype.getIndex = function(address) {
    address = address.toLowerCase();

    var leaves = expandLeaves(this.balances);

    var index = null;
    for (var i = 0; i < leaves.length; i++) {
        if (i != leaves[i].index) { throw new Error('huh?'); }
        if (leaves[i].address === address) { return leaves[i].index; }
    }

    throw new Error('address not found');
}

AirDrop.prototype.getAddress = function(index) {
    var leaves = expandLeaves(this.balances);
    return leaves[index].address;
}

AirDrop.prototype.getAmount = function(index) {
    var leaves = expandLeaves(this.balances);
    return leaves[index].balance;
}

AirDrop.prototype.getMerkleProof = function(index) {
    return computeMerkleProof(this.balances, index);
}

AirDrop.prototype.deploy = function(signer, name, symbol, decimals, premine) {
    if (arguments.length < 3) {
        throw new Error('deploy: signer, name and symbol are required');
    }
    if (decimals == null) { decimals = 18; }
    if (premine == null) { premine = '0x0'; }

    var sourceCode = fs.readFileSync(path.resolve(__dirname, 'AirDropToken.sol')).toString();
    var bytecode = '0x' + compile(sourceCode).contracts[':AirDropToken'].bytecode;

    var tx = ethers.Contract.getDeployTransaction(
        bytecode,
        abiFragment,
        name,
        symbol,
        decimals,
        this.rootHash,
        premine
    );
    console.log(tx);

    return signer.sendTransaction(tx).then(function(tx) {
        tx.contractAddress = ethers.utils.getContractAddress(tx);
        return tx;
    });
}

AirDrop.prototype.redeem = function(signer, contractAddress, index) {

    var self = this;

    var proof = this.getMerkleProof(index);
    console.log('Proof', proof);

    var contract = new ethers.Contract(contractAddress, abiFragment, signer);
    return contract.redeemPackage(index, this.getAddress(index), this.getAmount(index), proof).then(function(tx) {
        return signer.provider.waitForTransaction(tx.hash).then(function(tx) {
             return signer.provider.getTransactionReceipt(tx.hash);
        });
    }).then(function(receipt) {
        console.log(receipt);
        return receipt;
    });
}

AirDrop.prototype.getBalance = function(provider, contractAddress, address) {
    var contract = new ethers.Contract(contractAddress, abiFragment, provider);
    return contract.balanceOf(address);
}

AirDrop.prototype.getRedeemed = function(provider, contractAddress, index) {
    var contract = new ethers.Contract(contractAddress, abiFragment, provider);
    return contract.redeemed(index);
}

AirDrop.prototype.getInfo = function(provider, contractAddress) {
    var contract = new ethers.Contract(contractAddress, abiFragment, provider);
    return Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals(),
        contract.totalSupply(),
    ]).then(function(result) {
        return {
            name: result[0],
            symbol: result[1],
            decimals: result[2],
            totalSupply: result[3],
        }
    });
}
module.exports = AirDrop;

