const moment = require('moment');
moment.updateLocale('en', { week: { dow: -1, doy: 6 } });
const date = moment().startOf('month');
console.log(date.isValid(), date.toDate());
console.log(date.clone().startOf('week').toDate());
