const { REQUEST_TYPE } = require('../../constants/enums');

module.exports = {
  [REQUEST_TYPE.CABIN]: require('./cabin.handler'),
  [REQUEST_TYPE.HARDWARE]: require('./hardware.handler'),
  [REQUEST_TYPE.ROOM]: require('./booking.handler'),
  [REQUEST_TYPE.EVENT]: require('./event.handler'),
};