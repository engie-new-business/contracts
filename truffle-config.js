module.exports = {
  networks: {
  	development: {
    host: "127.0.0.1",
    port: 8545,
    network_id: "*",
    gas: 6283185,
    gasPrice: 0,
    },
  },


  mocha: {},

  compilers: {
    solc: {
      optimizer: {
        enabled: false
      },
      version: "0.6.0",
    }
  }
}
