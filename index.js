const { registerBuyerCommands } = require('./buyer-actions')
const { registerSellerCommands } = require('./seller-actions')

module.exports = function register(api) {
  api.logger.info('[surplus-intelligence] Plugin loading...')

  registerBuyerCommands(api)
  registerSellerCommands(api)
}
