const moment = require('moment');
const origUpdate = moment.updateLocale;
moment.updateLocale = function(name, config) {
  if (config && config.week && config.week.dow === -1) config.week.dow = 0;
  return origUpdate.apply(this, arguments);
};
moment.updateLocale('en', { week: { dow: -1, doy: 6 } });
console.log(moment.localeData().firstDayOfWeek());
