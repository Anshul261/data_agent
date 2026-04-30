<!--
name: monthly_ticket_trend
question: What is the monthly ticket volume trend?
intent: Monthly ticket volume over time
aliases:
  - month over month ticket trend
  - ticket count by month
  - monthly volume trend
  - tickets over time by month
  - monthly ticket history
when_to_use:
  - Use for questions about monthly ticket volume trends over time.
  - Use when a chart should show month-by-month counts.
primary_group_by: month_label
primary_metric: COUNT(*)
returns:
  - year
  - month
  - month_label
  - ticket_count
do_not_use_for:
  - current status distribution
  - category distribution
  - technician ranking
tables_used: LLM_access_tickets
description: Shows ticket count per month from the filtered LLM_access_tickets view, useful for trend analysis
-->
SELECT
    toYear(created_time_ts) AS year,
    toMonth(created_time_ts) AS month,
    formatDateTime(created_time_ts, '%Y-%m') AS month_label,
    COUNT(*) AS ticket_count
FROM LLM_access_tickets
WHERE created_time_ts IS NOT NULL
GROUP BY year, month, month_label
ORDER BY year, month
