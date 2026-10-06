const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3001,
  REPOS_DIR: path.join(__dirname, '..', 'repos'),
  DATA_DIR: path.join(__dirname, '..', 'data'),
  RENAME_THRESHOLD: 50,
  BATCH_SIZE: 1000
};
