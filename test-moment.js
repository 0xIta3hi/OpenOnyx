const moment = require('moment');
const locale = moment.locale('en-us');
console.log('locale:', locale);
console.log('week:', moment.localeData()._week);
