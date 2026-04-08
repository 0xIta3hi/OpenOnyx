# Personal Finance Tracker

## Goal

Build a personal finance tracking application to manage expenses, budgets, and investments.

## Features

- [ ] Expense categorization
- [ ] Budget planning
- [ ] Investment tracking
- [ ] Visual reports
- [ ] CSV import/export
- [ ] Recurring transactions

## Tech Considerations

- Desktop app with [[Electron]]?
- Web app with [[React]]?
- Mobile app with [[React Native]]?

## Data Model

```
Transaction {
  id: string
  date: Date
  amount: number
  category: string
  description: string
  type: 'income' | 'expense'
}

Budget {
  category: string
  limit: number
  period: 'monthly' | 'weekly'
}
```

## Related

- [[Finance MOC]]
- [[Investment Basics]]
- [[Budgeting Strategies]]
