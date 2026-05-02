const moment = require('moment');
moment.updateLocale('en', { week: { dow: -1, doy: 6 } });
console.log(moment.localeData().firstDayOfWeek());
console.log(moment().startOf('month').startOf('week').day());
