const { registerAccountCommands } = require('./account-actions')
const { registerSellerCommands } = require('./seller-actions')

module.exports = function register(api) {
  api.logger.info('[openclaw-surplus-intelligence] Plugin loading...')

  registerAccountCommands(api)
  registerSellerCommands(api)
}
