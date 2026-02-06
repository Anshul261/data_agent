<!--
name: avg_resolution_time_by_priority
question: What is the average resolution time for tickets by priority?
tables_used: prod_tickets_2025___tickets
description: Calculates average resolution time in hours using time_elapsed_hours, grouped by priority. Only includes tickets that have been resolved.
-->
SELECT
    priority__name AS priority,
    COUNT(*) AS resolved_tickets,
    ROUND(AVG(time_elapsed_hours), 2) AS avg_resolution_hours,
    ROUND(MIN(time_elapsed_hours), 2) AS min_hours,
    ROUND(MAX(time_elapsed_hours), 2) AS max_hours,
    ROUND(quantile(0.5)(time_elapsed_hours), 2) AS median_hours
FROM prod_tickets_2025___tickets
WHERE resolved_time_ts IS NOT NULL
  AND time_elapsed_hours IS NOT NULL
  AND priority__name IS NOT NULL
GROUP BY priority__name
ORDER BY priority__name
