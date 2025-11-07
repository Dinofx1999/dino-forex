/* eslint-disable */
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};
const time = new Date().toISOString().replace('T', ' ').split('.')[0];

function log(color_label, label, color_text, message) {
  console.log(`${color_label}[${label}]${color_text} ${getTimeGMT7('datetime')} ${message}`);
}


function getTimeGMT7(format = 'datetime') {
  const now = new Date();
  
  // Offset GMT+7 = +7 hours = 7 * 60 * 60 * 1000 milliseconds
  const gmt7Time = new Date(now.getTime() + (7 * 60 * 60 * 1000));
  
  const year = gmt7Time.getUTCFullYear();
  const month = String(gmt7Time.getUTCMonth() + 1).padStart(2, '0');
  const day = String(gmt7Time.getUTCDate()).padStart(2, '0');
  const hour = String(gmt7Time.getUTCHours()).padStart(2, '0');
  const minute = String(gmt7Time.getUTCMinutes()).padStart(2, '0');
  const second = String(gmt7Time.getUTCSeconds()).padStart(2, '0');
  
  switch(format) {
    case 'date':
      return `${year}-${month}-${day}`;
    case 'time':
      return `${hour}:${minute}:${second}`;
    case 'datetime':
    default:
      return `${year}.${month}.${day} ${hour}:${minute}:${second}`;
  }
}
module.exports = { colors, log ,getTimeGMT7};
