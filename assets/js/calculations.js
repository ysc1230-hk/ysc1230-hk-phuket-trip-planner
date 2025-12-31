/**
 * Calculations Module
 * Handles dual-currency expense calculations (THB and HKD separately)
 */

/**
 * Calculate total expenses per currency
 */
function calculateTotals(expenses) {
    const totals = {
        THB: 0,
        HKD: 0
    };

    expenses.forEach(expense => {
        const amount = parseFloat(expense.total_amount) || 0;
        if (expense.currency === 'THB') {
            totals.THB += amount;
        } else if (expense.currency === 'HKD') {
            totals.HKD += amount;
        }
    });

    return totals;
}

/**
 * Calculate person's share of an expense
 */
function calculatePersonShare(expense, personName) {
    const splitAmong = Array.isArray(expense.split_among) 
        ? expense.split_among 
        : expense.split_among.split(',').map(n => n.trim());

    if (!splitAmong.includes(personName)) {
        return 0;
    }

    const totalAmount = parseFloat(expense.total_amount) || 0;

    if (expense.split_type === 'Custom' && expense.custom_splits) {
        return parseFloat(expense.custom_splits[personName]) || 0;
    }

    // Equal split
    return totalAmount / splitAmong.length;
}

/**
 * Calculate balances for all people (separate for each currency)
 */
function calculateBalances(expenses) {
    const balances = {};

    // Get all unique people
    const allPeople = new Set();
    expenses.forEach(expense => {
        allPeople.add(expense.paid_by);
        const splitAmong = Array.isArray(expense.split_among)
            ? expense.split_among
            : expense.split_among.split(',').map(n => n.trim());
        splitAmong.forEach(person => allPeople.add(person));
    });

    // Initialize balances for each person
    allPeople.forEach(person => {
        balances[person] = {
            name: person,
            paid_thb: 0,
            paid_hkd: 0,
            owed_thb: 0,
            owed_hkd: 0,
            balance_thb: 0,
            balance_hkd: 0
        };
    });

    // Calculate for each expense
    expenses.forEach(expense => {
        const amount = parseFloat(expense.total_amount) || 0;
        const currency = expense.currency;
        const paidBy = expense.paid_by;

        // Add to person who paid
        if (currency === 'THB') {
            balances[paidBy].paid_thb += amount;
        } else if (currency === 'HKD') {
            balances[paidBy].paid_hkd += amount;
        }

        // Calculate splits
        const splitAmong = Array.isArray(expense.split_among)
            ? expense.split_among
            : expense.split_among.split(',').map(n => n.trim());

        splitAmong.forEach(person => {
            const share = calculatePersonShare(expense, person);
            
            if (currency === 'THB') {
                balances[person].owed_thb += share;
            } else if (currency === 'HKD') {
                balances[person].owed_hkd += share;
            }
        });
    });

    // Calculate final balances
    Object.values(balances).forEach(person => {
        person.balance_thb = person.paid_thb - person.owed_thb;
        person.balance_hkd = person.paid_hkd - person.owed_hkd;
    });

    return Object.values(balances);
}

/**
 * Calculate settlement suggestions (separate for each currency)
 */
function calculateSettlements(balances) {
    const settlements = {
        THB: [],
        HKD: []
    };

    // Calculate THB settlements
    const thbCreditors = balances.filter(p => p.balance_thb > 0.01).sort((a, b) => b.balance_thb - a.balance_thb);
    const thbDebtors = balances.filter(p => p.balance_thb < -0.01).sort((a, b) => a.balance_thb - b.balance_thb);

    let thbCreditorsCopy = thbCreditors.map(c => ({ ...c, remaining: c.balance_thb }));
    let thbDebtorsCopy = thbDebtors.map(d => ({ ...d, remaining: Math.abs(d.balance_thb) }));

    while (thbCreditorsCopy.length > 0 && thbDebtorsCopy.length > 0) {
        const creditor = thbCreditorsCopy[0];
        const debtor = thbDebtorsCopy[0];

        const amount = Math.min(creditor.remaining, debtor.remaining);

        settlements.THB.push({
            from: debtor.name,
            to: creditor.name,
            amount: amount,
            currency: 'THB'
        });

        creditor.remaining -= amount;
        debtor.remaining -= amount;

        if (creditor.remaining < 0.01) {
            thbCreditorsCopy.shift();
        }
        if (debtor.remaining < 0.01) {
            thbDebtorsCopy.shift();
        }
    }

    // Calculate HKD settlements
    const hkdCreditors = balances.filter(p => p.balance_hkd > 0.01).sort((a, b) => b.balance_hkd - a.balance_hkd);
    const hkdDebtors = balances.filter(p => p.balance_hkd < -0.01).sort((a, b) => a.balance_hkd - b.balance_hkd);

    let hkdCreditorsCopy = hkdCreditors.map(c => ({ ...c, remaining: c.balance_hkd }));
    let hkdDebtorsCopy = hkdDebtors.map(d => ({ ...d, remaining: Math.abs(d.balance_hkd) }));

    while (hkdCreditorsCopy.length > 0 && hkdDebtorsCopy.length > 0) {
        const creditor = hkdCreditorsCopy[0];
        const debtor = hkdDebtorsCopy[0];

        const amount = Math.min(creditor.remaining, debtor.remaining);

        settlements.HKD.push({
            from: debtor.name,
            to: creditor.name,
            amount: amount,
            currency: 'HKD'
        });

        creditor.remaining -= amount;
        debtor.remaining -= amount;

        if (creditor.remaining < 0.01) {
            hkdCreditorsCopy.shift();
        }
        if (debtor.remaining < 0.01) {
            hkdDebtorsCopy.shift();
        }
    }

    return settlements;
}

/**
 * Calculate category statistics (separate for each currency)
 */
function calculateCategoryStats(expenses) {
    const stats = {
        THB: {},
        HKD: {}
    };

    const totals = calculateTotals(expenses);

    expenses.forEach(expense => {
        const category = expense.category;
        const amount = parseFloat(expense.total_amount) || 0;
        const currency = expense.currency;

        if (!stats[currency][category]) {
            stats[currency][category] = {
                total: 0,
                count: 0,
                percentage: 0
            };
        }

        stats[currency][category].total += amount;
        stats[currency][category].count++;
    });

    // Calculate percentages
    Object.keys(stats).forEach(currency => {
        const total = totals[currency];
        if (total > 0) {
            Object.keys(stats[currency]).forEach(category => {
                stats[currency][category].percentage = 
                    (stats[currency][category].total / total) * 100;
            });
        }
    });

    return stats;
}

/**
 * Calculate per-person statistics (separate for each currency)
 */
function calculatePersonStats(expenses) {
    const balances = calculateBalances(expenses);
    const totals = calculateTotals(expenses);
    const peopleCount = balances.length || 1;

    const stats = {
        averages: {
            THB: totals.THB / peopleCount,
            HKD: totals.HKD / peopleCount
        },
        people: {}
    };

    balances.forEach(person => {
        stats.people[person.name] = {
            paid_thb: person.paid_thb,
            paid_hkd: person.paid_hkd,
            owed_thb: person.owed_thb,
            owed_hkd: person.owed_hkd,
            balance_thb: person.balance_thb,
            balance_hkd: person.balance_hkd,
            percentage_paid_thb: totals.THB > 0 ? (person.paid_thb / totals.THB) * 100 : 0,
            percentage_paid_hkd: totals.HKD > 0 ? (person.paid_hkd / totals.HKD) * 100 : 0,
            percentage_owed_thb: totals.THB > 0 ? (person.owed_thb / totals.THB) * 100 : 0,
            percentage_owed_hkd: totals.HKD > 0 ? (person.owed_hkd / totals.HKD) * 100 : 0
        };
    });

    return stats;
}

/**
 * Format currency amount
 */
function formatCurrency(amount, currency = 'THB') {
    const formatted = parseFloat(amount).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    return `${formatted} ${currency}`;
}

/**
 * Format percentage
 */
function formatPercentage(percentage) {
    return `${percentage.toFixed(1)}%`;
}

/**
 * Filter expenses by criteria
 */
function filterExpenses(expenses, filters = {}) {
    let filtered = [...expenses];

    if (filters.currency && filters.currency !== 'all') {
        filtered = filtered.filter(e => e.currency === filters.currency);
    }

    if (filters.category && filters.category !== 'all') {
        filtered = filtered.filter(e => e.category === filters.category);
    }

    if (filters.person) {
        filtered = filtered.filter(e => {
            const splitAmong = Array.isArray(e.split_among)
                ? e.split_among
                : e.split_among.split(',').map(n => n.trim());
            return e.paid_by === filters.person || splitAmong.includes(filters.person);
        });
    }

    if (filters.dateFrom) {
        filtered = filtered.filter(e => {
            // If the expense has a timestamp, use it for comparison
            if (e.timestamp) {
                const timestampDate = new Date(e.timestamp);
                const filterDate = new Date(filters.dateFrom);
                // Validate dates before comparison
                if (!isNaN(timestampDate.getTime()) && !isNaN(filterDate.getTime())) {
                    return timestampDate >= filterDate;
                }
                // If timestamp is invalid, fallback to date field
            }
            // Otherwise, use the date field
            const expenseDate = new Date(e.date);
            const filterDate = new Date(filters.dateFrom);
            // Validate dates before comparison
            if (!isNaN(expenseDate.getTime()) && !isNaN(filterDate.getTime())) {
                return expenseDate >= filterDate;
            }
            // If both dates are invalid, include the expense
            return true;
        });
    }

    if (filters.dateTo) {
        filtered = filtered.filter(e => {
            // If the expense has a timestamp, use it for comparison
            if (e.timestamp) {
                const timestampDate = new Date(e.timestamp);
                const filterDate = new Date(filters.dateTo);
                // Validate dates before comparison
                if (!isNaN(timestampDate.getTime()) && !isNaN(filterDate.getTime())) {
                    return timestampDate <= filterDate;
                }
                // If timestamp is invalid, fallback to date field
            }
            // Otherwise, use the date field
            const expenseDate = new Date(e.date);
            const filterDate = new Date(filters.dateTo);
            // Validate dates before comparison
            if (!isNaN(expenseDate.getTime()) && !isNaN(filterDate.getTime())) {
                return expenseDate <= filterDate;
            }
            // If both dates are invalid, include the expense
            return true;
        });
    }

    return filtered;
}

/**
 * Sort expenses
 */
function sortExpenses(expenses, sortBy = 'date', order = 'desc') {
    const sorted = [...expenses];

    sorted.sort((a, b) => {
        let comparison = 0;

        switch (sortBy) {
            case 'date':
                // Use timestamp if available for more precise sorting, otherwise use date
                let dateA, dateB;
                
                // Validate timestamp for a
                if (a.timestamp) {
                    dateA = new Date(a.timestamp);
                    if (isNaN(dateA.getTime())) {
                        // Invalid timestamp, fallback to date
                        dateA = new Date(a.date);
                    }
                } else {
                    dateA = new Date(a.date);
                }
                
                // Validate timestamp for b
                if (b.timestamp) {
                    dateB = new Date(b.timestamp);
                    if (isNaN(dateB.getTime())) {
                        // Invalid timestamp, fallback to date
                        dateB = new Date(b.date);
                    }
                } else {
                    dateB = new Date(b.date);
                }
                
                // Only compare if both dates are valid
                if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
                    comparison = dateA - dateB;
                } else {
                    comparison = 0; // Treat invalid dates as equal
                }
                break;
            case 'amount':
                comparison = parseFloat(a.total_amount) - parseFloat(b.total_amount);
                break;
            case 'category':
                comparison = a.category.localeCompare(b.category);
                break;
            default:
                comparison = 0;
        }

        return order === 'desc' ? -comparison : comparison;
    });

    return sorted;
}
