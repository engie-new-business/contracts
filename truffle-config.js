module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
    },
  },

  mocha: {},

  compilers: {
    solc: {
      optimizer: {
        enabled: false
      },
      version: "0.6.10",
    }
  }
}
