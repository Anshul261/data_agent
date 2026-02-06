<!--
name: monthly_ticket_trend
question: What is the monthly ticket volume trend?
tables_used: prod_tickets_2025___tickets
description: Shows ticket count per month with year, useful for trend analysis
-->
SELECT
    toYear(created_time_ts) AS year,
    toMonth(created_time_ts) AS month,
    formatDateTime(created_time_ts, '%Y-%m') AS month_label,
    COUNT(*) AS ticket_count
FROM prod_tickets_2025___tickets
WHERE created_time_ts IS NOT NULL
GROUP BY year, month, month_label
ORDER BY year, month
